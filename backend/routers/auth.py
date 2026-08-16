"""Login/logout routes for the single-user application boundary."""

import os
import secrets

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from backend.auth import CSRF_COOKIE, SESSION_COOKIE, cookie_secure, make_session, public_mode, revoke_session, secret_matches, valid_session


router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    # Username/password is the explicit local/public configuration contract.
    # ``secret`` remains a compatible single-field presentation for the
    # existing login page; both forms validate against environment-only data.
    username: str | None = None
    password: str | None = None
    secret: str | None = None


@router.post("/login")
def login(data: LoginRequest):
    """Establish an HTTP-only session after constant-time secret validation."""
    expected_username = (os.getenv("TRADINGAGENTS_AUTH_USERNAME") or "").strip()
    username_ok = (
        bool(expected_username and data.username and data.password)
        and secrets.compare_digest(data.username, expected_username)
        and secret_matches(data.password)
    )
    secret_ok = secret_matches(data.secret)
    authenticated = (
        bool(expected_username) and username_ok
        if public_mode()
        else username_ok or secret_ok
    )
    if not authenticated:
        return JSONResponse({"detail": "Invalid credentials"}, status_code=401)

    session = make_session()
    csrf = secrets.token_urlsafe(24)
    response = JSONResponse({"status": "authenticated", "csrf_token": csrf})
    response.set_cookie(
        SESSION_COOKIE, session, httponly=True, secure=cookie_secure(), samesite="lax",
        max_age=12 * 60 * 60, path="/",
    )
    response.set_cookie(
        CSRF_COOKIE, csrf, httponly=False, secure=cookie_secure(), samesite="lax",
        max_age=12 * 60 * 60, path="/",
    )
    return response


@router.post("/logout")
def logout(request: Request):
    revoke_session(request.cookies.get(SESSION_COOKIE))
    response = JSONResponse({"status": "logged_out"})
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    return response


@router.get("/status")
def status(request: Request):
    """Return session state and the non-secret CSRF token for split origins."""
    authenticated = valid_session(request.cookies.get(SESSION_COOKIE))
    return {
        "authenticated": authenticated,
        "csrf_token": request.cookies.get(CSRF_COOKIE) if authenticated else None,
    }
