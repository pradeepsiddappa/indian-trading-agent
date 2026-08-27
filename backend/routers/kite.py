"""Kite Connect OAuth, credential status, and read-only session routes."""

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from backend.auth import frontend_page_url, public_mode
from backend.brokers.kite import (
    KiteAuthExpired, KiteConfigError, clear_kite_access_token, consume_oauth_state,
    create_oauth_state, exchange_request_token, get_kite_status, get_login_url,
    save_kite_credentials,
)

router = APIRouter(prefix="/api/kite", tags=["kite"])


class KiteCredentials(BaseModel):
    api_key: str
    api_secret: str


def _with_state(url: str) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.setdefault("state", create_oauth_state())
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
    return get_kite_status()


@router.put("/credentials")
def credentials(data: KiteCredentials):
    try:
        return save_kite_credentials(data.api_key, data.api_secret)
    except KiteConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/login-url")
def login_url():
    try:
        return {"login_url": _with_state(get_login_url())}
    except KiteConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/callback")
def callback(request: Request, request_token: str | None = None, state: str | None = None, status: str | None = None):
    # Consume before token exchange. Even a failed exchange cannot be replayed
    # with the same state, which is the safe one-time OAuth tradeoff.
    if not consume_oauth_state(state):
        return _redirect({"kite": "error", "message": "invalid_oauth_state"})
    if status and status != "success":
        return _redirect({"kite": "error", "message": status})
    if not request_token:
        return _redirect({"kite": "error", "message": "missing_request_token"})
    try:
        # State was validated and consumed above; exchange has no independent
        # public HTTP surface and therefore receives only the request token.
        exchange_request_token(request_token)
        return _redirect({"kite": "connected"})
    except (KiteConfigError, KiteAuthExpired):
        return _redirect({"kite": "error", "message": "kite_login_failed"})
    except Exception:
        return _redirect({"kite": "error", "message": "kite_login_failed"})


def _logout_response():
    clear_kite_access_token()
    return {"status": "logged_out", "kite": get_kite_status()}


@router.post("/logout")
def logout():
    return _logout_response()
