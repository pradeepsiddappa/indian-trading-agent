"""Application authentication and request-boundary security.

This is a single-user application boundary, not an account/authorization
system. A shared secret establishes one signed session cookie. The secret is
read only from the process environment and is never persisted in SQLite or
returned to the frontend. Browser state changes authenticated by that cookie
also require an allowed Origin and a matching CSRF token.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import os
import secrets
import time
from http.cookies import SimpleCookie
from urllib.parse import urlsplit

from starlette.responses import JSONResponse


PUBLIC_MODES = {"public", "production", "prod"}
SESSION_COOKIE = "trading_agent_session"
CSRF_COOKIE = "trading_agent_csrf"
CSRF_HEADER = "x-csrf-token"
SESSION_TTL_SECONDS = 12 * 60 * 60


def _env_mode() -> str:
    return (os.getenv("TRADINGAGENTS_AUTH_MODE") or os.getenv("TRADINGAGENTS_ENV")
            or os.getenv("APP_ENV") or "local").strip().lower()


def public_mode() -> bool:
    return _env_mode() in PUBLIC_MODES


def _origin(value: str, require_https: bool = False) -> str:
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("FRONTEND_URL must be an absolute HTTP(S) URL")
    if require_https and parsed.scheme != "https":
        raise ValueError("FRONTEND_URL must use HTTPS in public or production mode")
    return f"{parsed.scheme}://{parsed.netloc}"


def frontend_url() -> str:
    """Return the configured public frontend origin.

    Local development has a localhost fallback. Public/production mode fails
    closed if an explicit URL is not configured, preventing redirects and
    notification links from being derived from an incoming Host header.
    """
    configured = (os.getenv("FRONTEND_URL") or os.getenv("TRADINGAGENTS_FRONTEND_URL") or "").strip()
    if not configured:
        if _env_mode() in PUBLIC_MODES:
            raise RuntimeError("FRONTEND_URL is required in public or production mode")
        configured = "http://localhost:3000"
    return _origin(configured, require_https=_env_mode() in PUBLIC_MODES)


def frontend_page_url() -> str:
    """Return the portfolio frontend URL used by redirects and Telegram."""
    configured = (os.getenv("FRONTEND_URL") or os.getenv("TRADINGAGENTS_FRONTEND_URL") or "").strip()
    if not configured:
        return f"{frontend_url()}/equity-portfolio-analysis"
    parsed = urlsplit(configured)
    _origin(configured, require_https=public_mode())  # validate before preserving an optional page path
    if parsed.path and parsed.path != "/":
        return configured.rstrip("/")
    return f"{frontend_url()}/equity-portfolio-analysis"


def allowed_origins() -> list[str]:
    """Return explicit CORS/CSRF origins; no wildcard or private-network regex."""
    configured = (os.getenv("FRONTEND_URL") or os.getenv("TRADINGAGENTS_FRONTEND_URL") or "").strip()
    try:
        values = [frontend_url()]
    except (RuntimeError, ValueError):
        # Keep module/app import usable for diagnostics and tests. Requests in
        # this invalid public configuration fail closed at auth/redirect use.
        values = []
    if not configured and not public_mode():
        # Preserve the documented local two-process workflow for the default
        # port, the start.sh override, and loopback aliases. Public mode never
        # receives these convenience origins.
        for host in ("localhost", "127.0.0.1", "[::1]"):
            for port in (3000, 3001):
                origin = f"http://{host}:{port}"
                if origin not in values:
                    values.append(origin)
    extra = os.getenv("CORS_ORIGINS", "")
    for item in extra.split(","):
        if item.strip():
            try:
                origin = _origin(item)
            except ValueError:
                # Ignore malformed optional entries rather than making app
                # import fail; the configured primary frontend still governs.
                continue
            if origin not in values:
                values.append(origin)
    return values


def auth_secret() -> str:
    configured = (os.getenv("TRADINGAGENTS_AUTH_PASSWORD") or os.getenv("TRADINGAGENTS_AUTH_SECRET") or "").strip()
    if configured:
        return configured
    if _env_mode() in PUBLIC_MODES:
        # Public mode deliberately has no implicit credential. Login fails
        # closed until an operator configures a username/password pair.
        return ""
    # Local mode is intentionally localhost-CORS-only and still requires an
    # operator-provided secret at the login boundary. Do not ship a known
    # source-visible fallback, even for a local installation.
    return (os.getenv("TRADINGAGENTS_LOCAL_AUTH_SECRET") or "").strip()


def cookie_secure() -> bool:
    try:
        # Local development commonly runs the backend over HTTP even when the
        # eventual public frontend URL is HTTPS. Public mode is always secure;
        # local mode remains usable with TestClient and localhost HTTP.
        return public_mode()
    except (RuntimeError, ValueError):
        return _env_mode() in PUBLIC_MODES


def _b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _unb64(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def make_session() -> str:
    secret = auth_secret()
    if not secret:
        raise RuntimeError("Authentication credentials are not configured")
    issued = str(int(time.time()))
    nonce = secrets.token_urlsafe(24)
    payload = f"{issued}.{nonce}".encode("ascii")
    signature = hmac.new(secret.encode(), payload, hashlib.sha256).digest()
    return f"{_b64(payload)}.{_b64(signature)}"


def valid_session(value: str | None) -> bool:
    secret = auth_secret()
    if not value or not secret:
        return False
    try:
        encoded_payload, encoded_signature = value.split(".", 1)
        payload = _unb64(encoded_payload)
        expected = hmac.new(secret.encode(), payload, hashlib.sha256).digest()
        if not hmac.compare_digest(_unb64(encoded_signature), expected):
            return False
        issued_text, nonce = payload.decode("ascii").split(".", 1)
        issued = int(issued_text)
        return bool(nonce) and 0 <= time.time() - issued <= SESSION_TTL_SECONDS
    except (ValueError, TypeError, OverflowError, UnicodeDecodeError):
        return False


def secret_matches(value: str | None) -> bool:
    if value is None or not auth_secret():
        return False
    return hmac.compare_digest(value.encode(), auth_secret().encode())


def _headers(scope: dict) -> dict[str, str]:
    return {
        key.decode("latin1").lower(): value.decode("latin1")
        for key, value in scope.get("headers", [])
    }


def cookies(scope: dict) -> dict[str, str]:
    parsed = SimpleCookie()
    parsed.load(_headers(scope).get("cookie", ""))
    return {key: morsel.value for key, morsel in parsed.items()}


def authenticate_scope(scope: dict) -> tuple[bool, bool]:
    """Return ``(authenticated, uses_cookie)`` without disclosing why failed."""
    session = cookies(scope).get(SESSION_COOKIE)
    return valid_session(session), True


def _is_allowed_origin(value: str | None) -> bool:
    return bool(value and value in allowed_origins())


def csrf_valid(scope: dict) -> bool:
    """Validate Origin and double-submit token for cookie-authenticated writes."""
    headers = _headers(scope)
    origin = headers.get("origin")
    token = headers.get(CSRF_HEADER)
    cookie_token = cookies(scope).get(CSRF_COOKIE)
    # Browsers send Origin for JSON state changes. The local no-Origin case is
    # retained for same-origin command-line/test clients; an explicit foreign
    # Origin is never accepted. Public deployments always require Origin.
    origin_ok = _is_allowed_origin(origin) or (origin is None and _env_mode() not in PUBLIC_MODES)
    return origin_ok and bool(token and cookie_token) and hmac.compare_digest(token, cookie_token)


def _is_public_http(scope: dict) -> bool:
    return scope.get("method") == "OPTIONS" or (
        scope.get("path") == "/api/health" and scope.get("method") == "GET"
    ) or (
        scope.get("path") == "/api/auth/login" and scope.get("method") == "POST"
    )


def _is_api(scope: dict) -> bool:
    return scope.get("path", "").startswith("/api/")


class AuthMiddleware:
    """Authenticate all API HTTP/WebSocket traffic at one central boundary."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in {"http", "websocket"} or not _is_api(scope):
            await self.app(scope, receive, send)
            return

        if scope["type"] == "http" and _is_public_http(scope):
            await self.app(scope, receive, send)
            return

        authenticated, uses_cookie = authenticate_scope(scope)
        if not authenticated:
            if scope["type"] == "websocket":
                await send({"type": "websocket.close", "code": 4401, "reason": "authentication required"})
            else:
                await JSONResponse({"detail": "Authentication required"}, status_code=401)(scope, receive, send)
            return

        if scope["type"] == "websocket":
            origin = _headers(scope).get("origin")
            origin_allowed = _is_allowed_origin(origin)
            # A browser WebSocket carries the session cookie automatically, so
            # its Origin must be one of the explicitly trusted frontend
            # origins. Local non-browser tooling may omit Origin; public mode
            # rejects that case rather than accepting an unverifiable cookie.
            if (origin is not None and not origin_allowed) or (origin is None and public_mode()):
                await send({"type": "websocket.close", "code": 4403, "reason": "origin not allowed"})
                return

        if scope["type"] == "http" and scope.get("method") in {"POST", "PUT", "PATCH", "DELETE"}:
            if uses_cookie and not csrf_valid(scope):
                await JSONResponse({"detail": "CSRF validation failed"}, status_code=403)(scope, receive, send)
                return

        await self.app(scope, receive, send)
