"""Read-only Zerodha Kite Connect integration.

This module only reads holdings/profile data. It never exposes or calls order
placement APIs. OAuth state is generated for each login URL and consumed
atomically once by the callback to prevent request-token replay.
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

from backend.db import get_db, get_setting, set_setting


KITE_API_KEY = "kite_api_key"
KITE_API_SECRET = "kite_api_secret"
KITE_ACCESS_TOKEN = "kite_access_token"
KITE_ACCESS_TOKEN_DATE = "kite_access_token_date"
KITE_PROFILE = "kite_profile"
KITE_OAUTH_STATE = "kite_oauth_state"
OAUTH_STATE_TTL_SECONDS = 10 * 60
MAX_PENDING_OAUTH_STATES = 8


def _api_key() -> str:
    return (get_setting(KITE_API_KEY) or os.getenv("KITE_API_KEY") or "").strip()


def _api_secret() -> str:
    return (get_setting(KITE_API_SECRET) or os.getenv("KITE_API_SECRET") or "").strip()


def _access_token() -> str:
    return (get_setting(KITE_ACCESS_TOKEN) or os.getenv("KITE_ACCESS_TOKEN") or "").strip()


def _access_token_date() -> str | None:
    stored = get_setting(KITE_ACCESS_TOKEN_DATE)
    if stored:
        return stored
    if os.getenv("KITE_ACCESS_TOKEN"):
        return (os.getenv("KITE_ACCESS_TOKEN_DATE") or _today()).strip()
    return None


def _oauth_entries(raw: str | None) -> list[dict[str, float | str]]:
    """Decode current and legacy single-state values into valid entries."""
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


class KiteConfigError(RuntimeError):
    """Raised when Kite credentials or access token are not ready."""


class KiteAuthExpired(RuntimeError):
    """Raised when Kite rejects the current read-only session."""


def mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "****"
    return f"{value[:4]}...{value[-4:]}"


def _today() -> str:
    return date.today().isoformat()


def _load_profile() -> dict | None:
    raw = get_setting(KITE_PROFILE)
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return None


def get_kite_status() -> dict:
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


def save_kite_credentials(api_key: str, api_secret: str) -> dict:
    api_key = (api_key or "").strip()
    api_secret = (api_secret or "").strip()
    if not api_key or not api_secret:
        raise KiteConfigError("Both Kite API key and API secret are required")
    set_setting(KITE_API_KEY, api_key)
    set_setting(KITE_API_SECRET, api_secret)
    clear_kite_access_token()
    return get_kite_status()


def clear_kite_access_token():
    set_setting(KITE_ACCESS_TOKEN, None)
    set_setting(KITE_ACCESS_TOKEN_DATE, None)


def _kite_connect_cls():
    try:
        from kiteconnect import KiteConnect
        return KiteConnect
    except ImportError as exc:
        raise KiteConfigError("kiteconnect package is not installed") from exc


def _new_client():
    api_key = _api_key()
    if not api_key:
        raise KiteConfigError("Kite API key is not configured")
    return _kite_connect_cls()(api_key=api_key)


def create_oauth_state() -> str:
    state = secrets.token_urlsafe(32)
    issued_at = time.time()
    with get_db() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (KITE_OAUTH_STATE,)).fetchone()
        entries = [
            entry for entry in _oauth_entries(row["value"] if row else None)
            if 0 <= issued_at - float(entry["issued_at"]) <= OAUTH_STATE_TTL_SECONDS
        ]
        entries.append({"state": state, "issued_at": issued_at})
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (KITE_OAUTH_STATE, json.dumps(entries[-MAX_PENDING_OAUTH_STATES:])),
        )
    return state


def consume_oauth_state(state: str | None) -> bool:
    """Atomically validate and delete the currently outstanding OAuth state."""
    if not state:
        return False
    with get_db() as conn:
        # SQLite's default deferred transaction allows two concurrent readers
        # to observe the same state before either DELETE is committed. Take a
        # write lock before reading so exactly one callback can consume it.
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (KITE_OAUTH_STATE,)).fetchone()
        if not row:
            return False
        entries = _oauth_entries(row["value"])
        if not entries:
            conn.execute("DELETE FROM settings WHERE key = ?", (KITE_OAUTH_STATE,))
            return False
        now = time.time()
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

        # A forged callback preserves every other pending state. Matching
        # states are removed, including expired matches, to prevent replay.
        if remaining:
            conn.execute(
                "UPDATE settings SET value = ? WHERE key = ?",
                (json.dumps(remaining), KITE_OAUTH_STATE),
            )
        else:
            conn.execute("DELETE FROM settings WHERE key = ?", (KITE_OAUTH_STATE,))
        return matched and valid


def get_login_url() -> str:
    if not _api_secret():
        raise KiteConfigError("Kite API secret is not configured")
    state = create_oauth_state()
    url = _new_client().login_url()
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query["state"] = state
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def exchange_request_token(request_token: str, state: str | None = None) -> dict:
    request_token = (request_token or "").strip()
    api_secret = _api_secret()
    if not request_token:
        raise KiteConfigError("Missing Kite request token")
    if not api_secret:
        raise KiteConfigError("Kite API secret is not configured")
    if state is not None and not consume_oauth_state(state):
        raise KiteConfigError("Invalid or expired Kite login state")

    client = _new_client()
    try:
        session = client.generate_session(request_token, api_secret=api_secret)
    except Exception as exc:
        if _is_auth_error(exc):
            raise KiteAuthExpired("Kite login could not be completed") from exc
        raise KiteConfigError("Kite login could not be completed") from exc
    access_token = session.get("access_token")
    if not access_token:
        raise KiteConfigError("Kite login did not return an access token")

    set_setting(KITE_ACCESS_TOKEN, access_token)
    set_setting(KITE_ACCESS_TOKEN_DATE, _today())
    client.set_access_token(access_token)
    profile = {
        "user_id": session.get("user_id"), "user_name": session.get("user_name"),
        "user_shortname": session.get("user_shortname"), "broker": session.get("broker"),
        "email": mask_secret(session.get("email")),
    }
    set_setting(KITE_PROFILE, json.dumps({k: v for k, v in profile.items() if v}))
    return get_kite_status()


def get_authenticated_client():
    access_token = _access_token()
    token_date = _access_token_date()
    if not access_token or token_date != _today():
        clear_kite_access_token()
        raise KiteConfigError("Kite login is required for today")
    client = _new_client()
    client.set_access_token(access_token)
    return client


def _is_auth_error(exc: Exception) -> bool:
    message = str(exc).lower()
    name = type(exc).__name__.lower()
    return "token" in message or "permission" in message or "auth" in name or "tokenexception" in name


def fetch_equity_holdings() -> list[dict[str, Any]]:
    client = get_authenticated_client()
    try:
        holdings = client.holdings()
    except Exception as exc:
        if _is_auth_error(exc):
            clear_kite_access_token()
            raise KiteAuthExpired("Kite session expired. Please connect Kite again.") from exc
        raise KiteConfigError("Kite holdings could not be fetched") from exc
    return normalize_holdings(holdings)


def _num(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def normalize_holdings(holdings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not isinstance(holdings, list):
        raise KiteConfigError("Kite returned an invalid holdings snapshot")
    normalized = []
    seen: set[tuple[str, str]] = set()
    for holding in holdings or []:
        if not isinstance(holding, dict):
            raise KiteConfigError("Kite returned an invalid holdings row")
        raw_symbol = holding.get("tradingsymbol") or holding.get("ticker")
        raw_exchange = holding.get("exchange") or "NSE"
        if not isinstance(raw_symbol, str) or not isinstance(raw_exchange, str):
            raise KiteConfigError("Kite returned a holdings row with an invalid symbol or exchange")
        symbol = raw_symbol.strip().upper()
        exchange = raw_exchange.strip().upper()
        if not symbol or not exchange:
            raise KiteConfigError("Kite returned a holdings row without a symbol or exchange")
        identity = (symbol, exchange)
        if identity in seen:
            raise KiteConfigError(f"Kite returned duplicate holding {symbol} ({exchange})")
        seen.add(identity)

        numeric_fields = ("quantity", "average_price", "last_price")
        for field in numeric_fields:
            value = holding.get(field)
            try:
                if value is None or not math.isfinite(float(value)) or float(value) < 0:
                    raise ValueError
            except (TypeError, ValueError):
                raise KiteConfigError(f"Kite returned an invalid {field} for {symbol}")
        quantity = float(holding["quantity"])
        average_price = float(holding["average_price"])
        last_price = float(holding["last_price"])
        close_price = _num(holding.get("close_price", last_price))
        invested_value = average_price * quantity
        current_value = last_price * quantity
        pnl = _num(holding.get("pnl")) if holding.get("pnl") is not None else current_value - invested_value
        normalized.append({
            "tradingsymbol": symbol,
            "exchange": exchange,
            "isin": holding.get("isin"), "product": holding.get("product"),
            "quantity": quantity, "t1_quantity": _num(holding.get("t1_quantity")),
            "average_price": round(average_price, 2), "last_price": round(last_price, 2),
            "close_price": round(close_price, 2), "invested_value": round(invested_value, 2),
            "current_value": round(current_value, 2), "pnl": round(pnl, 2),
            "pnl_pct": round(pnl / invested_value * 100, 2) if invested_value else 0.0,
            "day_change": _num(holding.get("day_change")),
            "day_change_pct": _num(holding.get("day_change_percentage")),
        })
    return normalized
