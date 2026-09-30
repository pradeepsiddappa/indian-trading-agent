"""Read-only Upstox API v2 integration.

This module only reads holdings and profile data. It never exposes or calls order
placement APIs. OAuth state is generated for each login URL and consumed
atomically once by the callback to prevent token replay.
"""

from __future__ import annotations

import hmac
import json
import math
import os
import secrets
import time
from datetime import date
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx

from backend.db import get_db, get_setting, set_setting
from backend.auth import frontend_url, public_mode


UPSTOX_API_KEY = "upstox_api_key"
UPSTOX_API_SECRET = "upstox_api_secret"
UPSTOX_ACCESS_TOKEN = "upstox_access_token"
UPSTOX_ACCESS_TOKEN_DATE = "upstox_access_token_date"
UPSTOX_PROFILE = "upstox_profile"
UPSTOX_OAUTH_STATE = "upstox_oauth_state"
OAUTH_STATE_TTL_SECONDS = 10 * 60
MAX_PENDING_OAUTH_STATES = 8

UPSTOX_AUTH_URL = "https://api.upstox.com/v2/login/authorization/dialog"
UPSTOX_TOKEN_URL = "https://api.upstox.com/v2/login/authorization/token"
UPSTOX_PROFILE_URL = "https://api.upstox.com/v2/user/profile"
UPSTOX_HOLDINGS_URL = "https://api.upstox.com/v2/portfolio/long-term-holdings"


def _api_key() -> str:
    return (get_setting(UPSTOX_API_KEY) or os.getenv("UPSTOX_API_KEY") or "").strip()


def _api_secret() -> str:
    return (get_setting(UPSTOX_API_SECRET) or os.getenv("UPSTOX_API_SECRET") or "").strip()


def _access_token() -> str:
    return (get_setting(UPSTOX_ACCESS_TOKEN) or os.getenv("UPSTOX_ACCESS_TOKEN") or "").strip()


def _access_token_date() -> str | None:
    stored = get_setting(UPSTOX_ACCESS_TOKEN_DATE)
    if stored:
        return stored
    if os.getenv("UPSTOX_ACCESS_TOKEN"):
        return (os.getenv("UPSTOX_ACCESS_TOKEN_DATE") or _today()).strip()
    return None


def _oauth_entries(raw: str | None) -> list[dict[str, float | str]]:
    try:
        payload = json.loads(raw or "")
    except (TypeError, ValueError, json.JSONDecodeError):
        return []
    candidates = payload if isinstance(payload, list) else [payload]
    entries = []
    for item in candidates:
        if not isinstance(item, dict):
            continue
        try:
            state = str(item["state"])
            issued_at = float(item["issued_at"])
        except (KeyError, TypeError, ValueError):
            continue
        if state:
            entries.append({"state": state, "issued_at": issued_at})
    return entries


class UpstoxConfigError(RuntimeError):
    """Raised when Upstox credentials or access token are not ready."""


class UpstoxAuthExpired(RuntimeError):
    """Raised when Upstox rejects the current read-only session."""


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "****"
    return f"{value[:4]}...{value[-4:]}"


def _today() -> str:
    return date.today().isoformat()


def _load_profile() -> dict | None:
    raw = get_setting(UPSTOX_PROFILE)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


def get_upstox_status() -> dict:
    api_key = _api_key()
    api_secret = _api_secret()
    token_date = _access_token_date()
    access_token = _access_token()
    return {
        "api_key_configured": bool(api_key),
        "api_secret_configured": bool(api_secret),
        "configured": bool(api_key and api_secret),
        "connected_today": bool(access_token and token_date == _today()),
        "token_date": token_date,
        "login_ready": bool(api_key and api_secret),
        "masked_api_key": mask_secret(api_key),
        "profile": _load_profile(),
    }


def save_upstox_credentials(api_key: str, api_secret: str) -> dict:
    api_key = (api_key or "").strip()
    api_secret = (api_secret or "").strip()
    if not api_key or not api_secret:
        raise UpstoxConfigError("Both Upstox API key and API secret are required")
    set_setting(UPSTOX_API_KEY, api_key)
    set_setting(UPSTOX_API_SECRET, api_secret)
    clear_upstox_access_token()
    return get_upstox_status()


def clear_upstox_access_token():
    set_setting(UPSTOX_ACCESS_TOKEN, None)
    set_setting(UPSTOX_ACCESS_TOKEN_DATE, None)


def create_oauth_state() -> str:
    state = secrets.token_urlsafe(32)
    issued_at = time.time()
    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (UPSTOX_OAUTH_STATE,)).fetchone()
        entries = [
            entry for entry in _oauth_entries(row["value"] if row else None)
            if 0 <= issued_at - float(entry["issued_at"]) <= OAUTH_STATE_TTL_SECONDS
        ]
        entries.append({"state": state, "issued_at": issued_at})
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (UPSTOX_OAUTH_STATE, json.dumps(entries[-MAX_PENDING_OAUTH_STATES:])),
        )
    return state


def consume_oauth_state(state: str | None = None) -> bool:
    """Atomically validate and delete the currently outstanding OAuth state."""
    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (UPSTOX_OAUTH_STATE,)).fetchone()
        if not row:
            return False
        entries = _oauth_entries(row["value"])
        if not entries:
            conn.execute("DELETE FROM settings WHERE key = ?", (UPSTOX_OAUTH_STATE,))
            return False
        now = time.time()

        if state is None:
            fresh_entries = [
                e for e in entries if 0 <= now - float(e["issued_at"]) <= OAUTH_STATE_TTL_SECONDS
            ]
            if not fresh_entries:
                conn.execute("DELETE FROM settings WHERE key = ?", (UPSTOX_OAUTH_STATE,))
                return False
            latest = max(fresh_entries, key=lambda e: float(e["issued_at"]))
            remaining = [
                e for e in entries
                if e["state"] != latest["state"] and 0 <= now - float(e["issued_at"]) <= OAUTH_STATE_TTL_SECONDS
            ]
            if remaining:
                conn.execute(
                    "UPDATE settings SET value = ? WHERE key = ?",
                    (json.dumps(remaining), UPSTOX_OAUTH_STATE),
                )
            else:
                conn.execute("DELETE FROM settings WHERE key = ?", (UPSTOX_OAUTH_STATE,))
            return True

        matched = False
        valid = False
        remaining = []
        for entry in entries:
            expected = str(entry["state"])
            is_match = hmac.compare_digest(expected.encode(), state.encode())
            is_fresh = 0 <= now - float(entry["issued_at"]) <= OAUTH_STATE_TTL_SECONDS
            if is_match:
                matched = True
                valid = valid or is_fresh
            elif is_fresh:
                remaining.append(entry)

        if remaining:
            conn.execute(
                "UPDATE settings SET value = ? WHERE key = ?",
                (json.dumps(remaining), UPSTOX_OAUTH_STATE),
            )
        else:
            conn.execute("DELETE FROM settings WHERE key = ?", (UPSTOX_OAUTH_STATE,))
        return matched and valid


def get_redirect_uri() -> str:
    try:
        base = frontend_url()
    except (RuntimeError, ValueError):
        if public_mode():
            raise UpstoxConfigError("FRONTEND_URL must be configured")
        base = "http://localhost:8000"
    
    # If base points to frontend on :3000 in dev, backend callback is on :8000 (or /api endpoint)
    if "localhost:3000" in base:
        return "http://localhost:8000/api/upstox/callback"
    return f"{base.rstrip('/')}/api/upstox/callback"


def get_login_url() -> str:
    api_key = _api_key()
    if not api_key:
        raise UpstoxConfigError("Upstox API key is not configured")
    if not _api_secret():
        raise UpstoxConfigError("Upstox API secret is not configured")
    state = create_oauth_state()
    redirect_uri = get_redirect_uri()
    params = {
        "response_type": "code",
        "client_id": api_key,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    return f"{UPSTOX_AUTH_URL}?{urlencode(params)}"


def exchange_code(code: str, state: str | None = None) -> dict:
    code = (code or "").strip()
    api_key = _api_key()
    api_secret = _api_secret()
    if not code:
        raise UpstoxConfigError("Missing Upstox authorization code")
    if not api_key or not api_secret:
        raise UpstoxConfigError("Upstox API key or secret is not configured")
    if state is not None and not consume_oauth_state(state):
        raise UpstoxConfigError("Invalid or expired Upstox login state")

    redirect_uri = get_redirect_uri()
    payload = {
        "code": code,
        "client_id": api_key,
        "client_secret": api_secret,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
    }

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(UPSTOX_TOKEN_URL, data=payload, headers=headers)
            if resp.status_code != 200:
                raise UpstoxAuthExpired(f"Upstox token exchange failed: {resp.text}")
            data = resp.json()
    except UpstoxAuthExpired:
        raise
    except Exception as exc:
        raise UpstoxConfigError("Upstox login could not be completed") from exc

    access_token = data.get("access_token")
    if not access_token:
        raise UpstoxConfigError("Upstox login did not return an access token")

    set_setting(UPSTOX_ACCESS_TOKEN, access_token)
    set_setting(UPSTOX_ACCESS_TOKEN_DATE, _today())

    profile = {
        "user_id": data.get("user_id"),
        "user_name": data.get("user_name"),
        "user_type": data.get("user_type"),
        "broker": "Upstox",
        "email": mask_secret(data.get("email")),
    }
    
    # Try fetching full user profile if user_name is missing
    if not profile["user_name"]:
        try:
            with httpx.Client(timeout=10.0) as client:
                prof_resp = client.get(
                    UPSTOX_PROFILE_URL,
                    headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
                )
                if prof_resp.status_code == 200:
                    prof_data = prof_resp.json().get("data", {})
                    profile["user_name"] = prof_data.get("user_name") or prof_data.get("name")
                    profile["user_id"] = prof_data.get("user_id") or profile["user_id"]
                    profile["email"] = mask_secret(prof_data.get("email")) or profile["email"]
        except Exception:
            pass

    set_setting(UPSTOX_PROFILE, json.dumps({k: v for k, v in profile.items() if v}))
    return get_upstox_status()


def get_authenticated_headers() -> dict[str, str]:
    access_token = _access_token()
    token_date = _access_token_date()
    if not access_token or token_date != _today():
        clear_upstox_access_token()
        raise UpstoxConfigError("Upstox login is required for today")
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/json",
    }


def fetch_equity_holdings() -> list[dict[str, Any]]:
    headers = get_authenticated_headers()
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.get(UPSTOX_HOLDINGS_URL, headers=headers)
            if resp.status_code == 401 or resp.status_code == 403:
                clear_upstox_access_token()
                raise UpstoxAuthExpired("Upstox session expired. Please connect Upstox again.")
            if resp.status_code != 200:
                raise UpstoxConfigError(f"Upstox holdings call failed: {resp.text}")
            holdings_raw = resp.json().get("data", [])
    except (UpstoxAuthExpired, UpstoxConfigError):
        raise
    except Exception as exc:
        raise UpstoxConfigError("Upstox holdings could not be fetched") from exc

    return normalize_holdings(holdings_raw)


def _num(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _clean_exchange(ex: str) -> str:
    ex = (ex or "NSE").strip().upper()
    if ex.startswith("NSE"):
        return "NSE"
    if ex.startswith("BSE"):
        return "BSE"
    return ex


def normalize_holdings(holdings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(holdings, list):
        raise UpstoxConfigError("Upstox returned an invalid holdings snapshot")
    normalized = []
    seen: set[tuple[str, str]] = set()
    for holding in holdings or []:
        if not isinstance(holding, dict):
            raise UpstoxConfigError("Upstox returned an invalid holdings row")
        raw_symbol = holding.get("trading_symbol") or holding.get("tradingsymbol") or holding.get("company_name") or holding.get("symbol")
        raw_exchange = _clean_exchange(holding.get("exchange"))
        if not isinstance(raw_symbol, str) or not isinstance(raw_exchange, str):
            raise UpstoxConfigError("Upstox returned a holdings row with an invalid symbol or exchange")
        symbol = raw_symbol.strip().upper()
        exchange = raw_exchange.strip().upper()
        if not symbol or not exchange:
            raise UpstoxConfigError("Upstox returned a holdings row without a symbol or exchange")
        identity = (symbol, exchange)
        if identity in seen:
            continue
        seen.add(identity)

        quantity = _num(holding.get("quantity"))
        average_price = _num(holding.get("average_price") or holding.get("avg_price"))
        last_price = _num(holding.get("last_price") or holding.get("ltp"))
        close_price = _num(holding.get("close_price", last_price))
        invested_value = average_price * quantity
        current_value = last_price * quantity
        pnl = _num(holding.get("pnl")) if holding.get("pnl") is not None else current_value - invested_value

        normalized.append({
            "tradingsymbol": symbol,
            "exchange": exchange,
            "isin": holding.get("isin"),
            "product": holding.get("product", "CNC"),
            "quantity": quantity,
            "t1_quantity": _num(holding.get("t1_quantity")),
            "average_price": round(average_price, 2),
            "last_price": round(last_price, 2),
            "close_price": round(close_price, 2),
            "invested_value": round(invested_value, 2),
            "current_value": round(current_value, 2),
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl / invested_value * 100, 2) if invested_value else 0.0,
            "day_change": _num(holding.get("day_change")),
            "day_change_pct": _num(holding.get("day_change_percentage")),
        })
    return normalized
