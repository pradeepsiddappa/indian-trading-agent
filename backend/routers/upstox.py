"""Upstox API v2 OAuth, credential status, and read-only session routes."""

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from backend.auth import frontend_page_url, public_mode
from backend.brokers.upstox import (
    UpstoxAuthExpired, UpstoxConfigError, clear_upstox_access_token, consume_oauth_state,
    create_oauth_state, exchange_code, get_upstox_status, get_login_url,
    save_upstox_credentials,
)

router = APIRouter(prefix="/api/upstox", tags=["upstox"])


class UpstoxCredentials(BaseModel):
    api_key: str
    api_secret: str


def _with_state(url: str) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    if "state" not in query:
        query["state"] = create_oauth_state()
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _redirect(query: dict[str, str]) -> RedirectResponse:
    try:
        target = frontend_page_url()
    except (RuntimeError, ValueError):
        if public_mode():
            raise HTTPException(status_code=503, detail="Frontend URL is not configured")
        target = "http://localhost:3000/equity-portfolio-analysis"
    separator = "&" if "?" in target else "?"
    return RedirectResponse(target + separator + urlencode(query))


@router.get("/status")
def status():
    return get_upstox_status()


@router.put("/credentials")
def credentials(data: UpstoxCredentials):
    try:
        return save_upstox_credentials(data.api_key, data.api_secret)
    except UpstoxConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/login-url")
def login_url():
    try:
        return {"login_url": get_login_url()}
    except UpstoxConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/callback")
def callback(request: Request, code: str | None = None, state: str | None = None, status: str | None = None):
    if not consume_oauth_state(state):
        return _redirect({"upstox": "error", "message": "invalid_oauth_state"})
    if status and status != "success":
        return _redirect({"upstox": "error", "message": status})
    if not code:
        return _redirect({"upstox": "error", "message": "missing_authorization_code"})
    try:
        exchange_code(code)
        return _redirect({"upstox": "connected"})
    except (UpstoxConfigError, UpstoxAuthExpired):
        return _redirect({"upstox": "error", "message": "upstox_login_failed"})
    except Exception:
        return _redirect({"upstox": "error", "message": "upstox_login_failed"})


def _logout_response():
    clear_upstox_access_token()
    return {"status": "logged_out", "upstox": get_upstox_status()}


@router.post("/logout")
def logout():
    return _logout_response()
