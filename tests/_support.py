"""Shared test fixtures for isolated, network-free behavior tests."""

from __future__ import annotations

import os
import tempfile
from contextlib import contextmanager
from typing import Iterator
from urllib.parse import urlsplit


AUTH_LOGIN_PATH = "/api/auth/login"
AUTH_SECRET = "test-auth-secret-not-for-production"
AUTH_USERNAME = "test-user"
SESSION_COOKIE = "trading_agent_session"
CSRF_COOKIE = "trading_agent_csrf"
CSRF_HEADER = "X-CSRF-Token"


class IsolatedStateTestCase:
    """Mixin that gives each test a fresh SQLite database and home directory."""

    def setUp(self):  # noqa: N802 - unittest protocol
        self._old_env = {
            key: os.environ.get(key)
            for key in (
                "TRADINGAGENTS_HOME",
                "TRADINGAGENTS_DB_PATH",
                "TRADINGAGENTS_ENV",
                "TRADINGAGENTS_AUTH_MODE",
                "APP_ENV",
                "TRADINGAGENTS_AUTH_SECRET",
                "TRADINGAGENTS_AUTH_PASSWORD",
                "TRADINGAGENTS_AUTH_USERNAME",
                "TRADINGAGENTS_LOCAL_AUTH_SECRET",
                "FRONTEND_URL",
                "TRADINGAGENTS_FRONTEND_URL",
                "KITE_API_KEY",
                "KITE_API_SECRET",
                "KITE_ACCESS_TOKEN",
                "KITE_ACCESS_TOKEN_DATE",
                "CORS_ORIGINS",
            )
        }
        self.home = tempfile.TemporaryDirectory(prefix="tradingagents-test-home-")
        self.db_path = os.path.join(self.home.name, "trading_agent.db")
        os.environ["TRADINGAGENTS_HOME"] = self.home.name
        os.environ["TRADINGAGENTS_DB_PATH"] = self.db_path
        os.environ.pop("KITE_API_KEY", None)
        os.environ.pop("KITE_API_SECRET", None)
        os.environ.pop("KITE_ACCESS_TOKEN", None)
        os.environ.pop("KITE_ACCESS_TOKEN_DATE", None)

        import backend.db as db

        self.db = db
        self._old_db_path = db.DB_PATH
        db.DB_PATH = self.db_path
        db.ensure_db()

    def tearDown(self):  # noqa: N802 - unittest protocol
        self.db.DB_PATH = self._old_db_path
        for key, value in self._old_env.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        self.home.cleanup()


def configure_local_auth_environment() -> None:
    """Configure the deliberately explicit local-only auth test mode."""

    os.environ["TRADINGAGENTS_ENV"] = "local"
    os.environ["TRADINGAGENTS_AUTH_SECRET"] = AUTH_SECRET
    os.environ["TRADINGAGENTS_AUTH_USERNAME"] = AUTH_USERNAME
    os.environ.pop("TRADINGAGENTS_AUTH_PASSWORD", None)
    os.environ.pop("TRADINGAGENTS_LOCAL_AUTH_SECRET", None)


def csrf_headers(client) -> dict[str, str]:
    token = client.cookies.get(CSRF_COOKIE)
    if not token:
        raise AssertionError(
            f"authenticated session did not issue the {CSRF_COOKIE!r} cookie"
        )
    frontend = os.getenv("FRONTEND_URL", "http://localhost:3000")
    parsed = urlsplit(frontend)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    return {CSRF_HEADER: token, "Origin": origin}


def login(client):
    response = client.post(
        AUTH_LOGIN_PATH,
        json={"username": AUTH_USERNAME, "password": AUTH_SECRET},
    )
    if response.status_code >= 400:
        raise AssertionError(
            f"test auth login failed: {response.status_code} {response.text}"
        )
    return response


@contextmanager
def fresh_test_client() -> Iterator:
    """Create the application client after test auth configuration is present."""

    configure_local_auth_environment()
    from fastapi.testclient import TestClient
    from backend.app import app

    with TestClient(app) as client:
        yield client
