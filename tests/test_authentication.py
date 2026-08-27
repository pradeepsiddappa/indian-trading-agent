import os
import subprocess
import sys
import unittest
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

from starlette.websockets import WebSocketDisconnect

from tests._support import (
    AUTH_LOGIN_PATH,
    AUTH_SECRET,
    AUTH_USERNAME,
    CSRF_COOKIE,
    SESSION_COOKIE,
    IsolatedStateTestCase,
    csrf_headers,
    fresh_test_client,
    login,
)


class AuthenticationTests(IsolatedStateTestCase, unittest.TestCase):
    def test_health_is_available_without_credentials(self):
        with fresh_test_client() as client:
            response = client.get("/api/health")

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["status"], "ok")

    def test_cors_preflight_is_available_without_credentials(self):
        with fresh_test_client() as client:
            for origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
                response = client.options(
                    "/api/settings/api-keys",
                    headers={
                        "Origin": origin,
                        "Access-Control-Request-Method": "GET",
                        "Access-Control-Request-Headers": "content-type",
                    },
                )

                self.assertEqual(response.status_code, 200, response.text)
                self.assertEqual(response.headers.get("access-control-allow-origin"), origin)

    def test_local_mode_with_a_secret_still_requires_authentication(self):
        with fresh_test_client() as client:
            status = client.get("/api/auth/status")
            response = client.get("/api/settings/api-keys")

        self.assertFalse(status.json()["authenticated"])
        self.assertIn(response.status_code, (401, 403))

    def test_local_mode_without_a_secret_leaves_the_app_open(self):
        from fastapi.testclient import TestClient
        from backend.app import app

        with patch.dict(os.environ, {
            "TRADINGAGENTS_AUTH_MODE": "local",
            "TRADINGAGENTS_ENV": "local",
            "TRADINGAGENTS_AUTH_SECRET": "",
            "TRADINGAGENTS_AUTH_PASSWORD": "",
            "TRADINGAGENTS_AUTH_USERNAME": "",
            "TRADINGAGENTS_LOCAL_AUTH_SECRET": "",
            "FRONTEND_URL": "http://localhost:3000",
        }):
            with TestClient(app) as client:
                status = client.get("/api/auth/status")
                protected = client.get("/api/settings/api-keys")
                write = client.post(
                    "/api/positions",
                    json={
                        "tradingsymbol": "OPENMODE",
                        "quantity": 1,
                        "average_price": 100,
                    },
                )
                with client.websocket_connect("/api/analysis/ws/open-mode") as websocket:
                    websocket.close()

        self.assertEqual(status.status_code, 200, status.text)
        self.assertEqual(status.json(), {"authenticated": True, "csrf_token": None})
        self.assertEqual(protected.status_code, 200, protected.text)
        self.assertEqual(write.status_code, 200, write.text)

    def test_invalid_credentials_are_rejected(self):
        with fresh_test_client() as client:
            response = client.post(
                AUTH_LOGIN_PATH,
                json={"username": AUTH_USERNAME, "password": "wrong-secret"},
            )

        self.assertIn(response.status_code, (401, 403))
        self.assertNotIn(SESSION_COOKIE, client.cookies)

    def test_valid_login_issues_http_only_session_and_csrf_cookies(self):
        with fresh_test_client() as client:
            response = client.post(
                AUTH_LOGIN_PATH,
                json={"username": AUTH_USERNAME, "password": AUTH_SECRET},
            )
            status = client.get("/api/auth/status")

        self.assertIn(response.status_code, (200, 201), response.text)
        self.assertIn(SESSION_COOKIE, client.cookies)
        self.assertIn(CSRF_COOKIE, client.cookies)
        set_cookie = response.headers.get("set-cookie", "").lower()
        self.assertIn(f"{SESSION_COOKIE}=", set_cookie)
        self.assertIn("httponly", set_cookie)
        self.assertIn("samesite=lax", set_cookie)
        self.assertNotIn(AUTH_SECRET.lower(), response.text.lower())
        self.assertEqual(status.status_code, 200, status.text)
        self.assertTrue(status.json()["authenticated"])
        self.assertEqual(status.json()["csrf_token"], client.cookies.get(CSRF_COOKIE))

    def test_logout_revokes_a_copied_session_cookie(self):
        with fresh_test_client() as client:
            login(client)
            copied_session = client.cookies.get(SESSION_COOKIE)
            logout = client.post("/api/auth/logout", headers=csrf_headers(client))
            client.cookies.clear()
            client.cookies.set(SESSION_COOKIE, copied_session)
            replay = client.get("/api/settings/api-keys")

        self.assertEqual(logout.status_code, 200, logout.text)
        self.assertEqual(replay.status_code, 401, replay.text)

    def test_authenticated_get_works_but_state_change_requires_csrf(self):
        with fresh_test_client() as client:
            login(client)
            read_response = client.get("/api/settings/api-keys")
            missing_csrf = client.post("/api/kite/logout")
            invalid_csrf = client.post(
                "/api/kite/logout", headers={"X-CSRF-Token": "not-the-cookie"}
            )
            valid_csrf = client.post("/api/kite/logout", headers=csrf_headers(client))

        self.assertNotIn(read_response.status_code, (401, 403), read_response.text)
        self.assertIn(missing_csrf.status_code, (401, 403))
        self.assertIn(invalid_csrf.status_code, (401, 403))
        self.assertNotIn(valid_csrf.status_code, (401, 403), valid_csrf.text)

    def test_every_openapi_api_route_except_health_and_login_requires_authentication(self):
        from backend.app import app

        api_paths = app.openapi()["paths"]
        exempt = {"/api/health", AUTH_LOGIN_PATH, "/api/auth/status"}

        with fresh_test_client() as client:
            for path, operations in api_paths.items():
                if not path.startswith("/api/") or path in exempt:
                    continue
                concrete = path
                for parameter in (
                    "ticker", "task_id", "backtest_id", "id", "review_id",
                    "name", "symbol", "exchange", "provider", "index",
                ):
                    concrete = concrete.replace("{" + parameter + "}", "test")
                for method in operations:
                    if method not in {"get", "post", "put", "patch", "delete"}:
                        continue
                    response = client.request(method.upper(), concrete)
                    self.assertIn(
                        response.status_code,
                        (401, 403),
                        f"{method.upper()} {path} was not centrally protected: "
                        f"{response.status_code} {response.text[:200]}",
                    )

    def test_authentication_configuration_fails_closed_in_public_mode(self):
        code = """
from fastapi.testclient import TestClient
from backend.app import app
with TestClient(app) as client:
    assert client.get('/api/health').status_code == 200
    assert client.get('/api/auth/status').json()['authenticated'] is False
    assert client.get('/api/settings/api-keys').status_code in (401, 403)
"""
        env = os.environ.copy()
        env.update({
            "TRADINGAGENTS_ENV": "public",
            "TRADINGAGENTS_AUTH_SECRET": "",
            "TRADINGAGENTS_AUTH_PASSWORD": "",
            "TRADINGAGENTS_AUTH_USERNAME": "",
            "FRONTEND_URL": "https://portfolio.example",
            "TRADINGAGENTS_HOME": self.home.name,
            "TRADINGAGENTS_DB_PATH": self.db_path,
        })
        result = subprocess.run(
            [sys.executable, "-c", code],
            cwd=os.getcwd(),
            env=env,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_public_mode_requires_an_https_frontend_url(self):
        from backend.auth import frontend_url

        with patch.dict(os.environ, {
            "TRADINGAGENTS_AUTH_MODE": "public",
            "TRADINGAGENTS_ENV": "public",
            "FRONTEND_URL": "http://portfolio.example",
        }):
            with self.assertRaises(ValueError):
                frontend_url()

    def test_public_mode_rejects_a_cookie_forged_with_an_empty_secret(self):
        import base64
        import hashlib
        import hmac
        import time
        from fastapi.testclient import TestClient
        from backend.app import app

        payload = f"{int(time.time())}.forged".encode("ascii")
        encode = lambda value: base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")
        signature = hmac.new(b"", payload, hashlib.sha256).digest()
        forged_cookie = f"{encode(payload)}.{encode(signature)}"
        with patch.dict(os.environ, {
            "TRADINGAGENTS_AUTH_MODE": "public",
            "TRADINGAGENTS_ENV": "public",
            "TRADINGAGENTS_AUTH_SECRET": "",
            "TRADINGAGENTS_AUTH_PASSWORD": "",
            "TRADINGAGENTS_AUTH_USERNAME": "",
            "FRONTEND_URL": "https://portfolio.example",
        }):
            with TestClient(app) as client:
                client.cookies.set(SESSION_COOKIE, forged_cookie)
                response = client.get("/api/settings/api-keys")

        self.assertEqual(response.status_code, 401)

    def test_public_mode_requires_the_configured_username_with_password(self):
        from fastapi.testclient import TestClient
        from backend.app import app

        with patch.dict(os.environ, {
            "TRADINGAGENTS_AUTH_MODE": "public",
            "TRADINGAGENTS_ENV": "public",
            "TRADINGAGENTS_AUTH_SECRET": "",
            "TRADINGAGENTS_AUTH_PASSWORD": "public-password",
            "TRADINGAGENTS_AUTH_USERNAME": "public-user",
            "FRONTEND_URL": "https://portfolio.example",
        }):
            with TestClient(app) as client:
                valid = client.post(
                    AUTH_LOGIN_PATH,
                    json={"username": "public-user", "password": "public-password"},
                )
                client.cookies.clear()
                missing_username = client.post(
                    AUTH_LOGIN_PATH,
                    json={"secret": "public-password"},
                )

        self.assertEqual(valid.status_code, 200, valid.text)
        self.assertEqual(missing_username.status_code, 401, missing_username.text)

    def test_public_mode_rejects_secret_only_login_when_username_is_unconfigured(self):
        from fastapi.testclient import TestClient
        from backend.app import app

        with patch.dict(os.environ, {
            "TRADINGAGENTS_AUTH_MODE": "public",
            "TRADINGAGENTS_ENV": "public",
            "TRADINGAGENTS_AUTH_SECRET": "",
            "TRADINGAGENTS_AUTH_PASSWORD": "public-password",
            "TRADINGAGENTS_AUTH_USERNAME": "",
            "FRONTEND_URL": "https://portfolio.example",
        }):
            with TestClient(app) as client:
                response = client.post(AUTH_LOGIN_PATH, json={"secret": "public-password"})

        self.assertEqual(response.status_code, 401, response.text)


class OAuthRedirectTests(IsolatedStateTestCase, unittest.TestCase):
    def _location(self, response):
        self.assertIn(response.status_code, (302, 303, 307, 308), response.text)
        location = response.headers.get("location")
        self.assertIsNotNone(location)
        return location

    def _oauth_state(self, client):
        with patch(
            "backend.routers.kite.get_login_url",
            return_value="https://kite.example/connect/login?api_key=test-key",
        ):
            response = client.get("/api/kite/login-url")
        self.assertEqual(response.status_code, 200, response.text)
        login_url = response.json()["login_url"]
        state = parse_qs(urlsplit(login_url).query).get("state", [None])[0]
        self.assertTrue(state)
        return state

    def test_callback_uses_configured_https_frontend_url_not_host_header(self):
        configured = "https://portfolio.example/equity-portfolio-analysis"
        with (
            fresh_test_client() as client,
            patch.dict(os.environ, {"FRONTEND_URL": configured}),
        ):
            login(client)
            state = self._oauth_state(client)
            with patch(
                "backend.routers.kite.exchange_request_token",
                return_value={"connected_today": True},
            ) as exchange:
                response = client.get(
                    f"/api/kite/callback?request_token=request-123&state={state}",
                    headers={"host": "attacker.example"},
                    follow_redirects=False,
                )

        location = self._location(response)
        parsed = urlsplit(location)
        self.assertEqual(parsed.scheme, "https")
        self.assertEqual(parsed.netloc, "portfolio.example")
        self.assertTrue(parsed.path.endswith("/equity-portfolio-analysis"))
        self.assertNotIn("attacker.example", location)
        self.assertEqual(parse_qs(parsed.query)["kite"], ["connected"])
        exchange.assert_called_once_with("request-123")

    def test_callback_defaults_to_localhost_and_does_not_trust_host(self):
        with fresh_test_client() as client:
            os.environ.pop("FRONTEND_URL", None)
            login(client)
            state = self._oauth_state(client)
            response = client.get(
                f"/api/kite/callback?request_token=request-123&state={state}",
                headers={"host": "attacker.example"},
                follow_redirects=False,
            )

        location = self._location(response)
        parsed = urlsplit(location)
        self.assertEqual(parsed.scheme, "http")
        self.assertEqual(parsed.netloc, "localhost:3000")
        self.assertNotIn("attacker.example", location)

    def test_callback_rejects_missing_or_invalid_state_without_exchanging_token(self):
        with fresh_test_client() as client:
            login(client)
            with patch(
                "backend.routers.kite.exchange_request_token",
                return_value={"connected_today": True},
            ) as exchange:
                missing = client.get(
                    "/api/kite/callback?request_token=request-123",
                    follow_redirects=False,
                )
                invalid = client.get(
                    "/api/kite/callback?request_token=request-123&state=forged",
                    follow_redirects=False,
                )

        for response in (missing, invalid):
            location = self._location(response)
            self.assertEqual(parse_qs(urlsplit(location).query)["kite"], ["error"])
        exchange.assert_not_called()

    def test_oauth_state_is_single_use_and_replay_is_rejected(self):
        with fresh_test_client() as client:
            login(client)
            with patch(
                "backend.routers.kite.get_login_url",
                return_value="https://kite.example/connect/login?api_key=test-key",
            ):
                login_url_response = client.get("/api/kite/login-url")
            self.assertEqual(login_url_response.status_code, 200, login_url_response.text)
            login_url = login_url_response.json()["login_url"]
            state = parse_qs(urlsplit(login_url).query).get("state", [None])[0]
            self.assertTrue(state)

            with patch(
                "backend.routers.kite.exchange_request_token",
                return_value={"connected_today": True},
            ) as exchange:
                first = client.get(
                    f"/api/kite/callback?request_token=request-123&state={state}",
                    follow_redirects=False,
                )
                replay = client.get(
                    f"/api/kite/callback?request_token=request-456&state={state}",
                    follow_redirects=False,
                )

        self.assertEqual(parse_qs(urlsplit(self._location(first)).query)["kite"], ["connected"])
        replay_query = parse_qs(urlsplit(self._location(replay)).query)
        self.assertEqual(replay_query["kite"], ["error"])
        exchange.assert_called_once_with("request-123")

    def test_invalid_oauth_state_does_not_consume_pending_state(self):
        from backend.brokers.kite import consume_oauth_state, create_oauth_state

        with fresh_test_client():
            state = create_oauth_state()
            self.assertFalse(consume_oauth_state("forged-state"))
            self.assertTrue(consume_oauth_state(state))

    def test_oauth_state_can_only_be_consumed_once_concurrently(self):
        from backend.brokers.kite import consume_oauth_state, create_oauth_state

        with fresh_test_client():
            state = create_oauth_state()
            with ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(consume_oauth_state, (state, state)))

        self.assertEqual(sorted(results), [False, True])

    def test_multiple_pending_oauth_starts_remain_valid(self):
        from backend.brokers.kite import consume_oauth_state, create_oauth_state

        with fresh_test_client():
            first = create_oauth_state()
            second = create_oauth_state()
            self.assertTrue(consume_oauth_state(first))
            self.assertTrue(consume_oauth_state(second))

    def test_callback_error_query_is_encoded_and_cannot_inject_headers_or_markup(self):
        attack = "<script>alert(1)</script>\r\nLocation: https://attacker.example"
        with fresh_test_client() as client:
            os.environ.pop("FRONTEND_URL", None)
            login(client)
            state = self._oauth_state(client)
            response = client.get(
                "/api/kite/callback",
                params={"status": attack, "state": state},
                headers={"host": "attacker.example"},
                follow_redirects=False,
            )

        location = self._location(response)
        self.assertNotIn("\r", location)
        self.assertNotIn("\n", location)
        parsed = urlsplit(location)
        self.assertEqual(parsed.netloc, "localhost:3000")
        self.assertEqual(parse_qs(parsed.query)["message"], [attack])


class WebSocketAuthenticationTests(IsolatedStateTestCase, unittest.TestCase):
    def test_analysis_and_backtest_websockets_reject_before_accept_without_credentials(self):
        from starlette.websockets import WebSocketDisconnect

        with fresh_test_client() as client:
            for path in ("/api/analysis/ws/task-1", "/api/backtest/ws/run-1"):
                with self.assertRaises((WebSocketDisconnect, RuntimeError)) as raised:
                    with client.websocket_connect(path):
                        self.fail(f"unauthenticated websocket was accepted: {path}")
                if isinstance(raised.exception, WebSocketDisconnect):
                    self.assertIn(raised.exception.code, (1008, 4401, 4403))

    def test_authenticated_websocket_rejects_foreign_origin(self):
        with fresh_test_client() as client:
            login(client)
            with self.assertRaises((WebSocketDisconnect, RuntimeError)) as raised:
                with client.websocket_connect(
                    "/api/analysis/ws/task-1",
                    headers={"Origin": "https://attacker.example"},
                ):
                    self.fail("websocket with a foreign origin was accepted")

        if isinstance(raised.exception, WebSocketDisconnect):
            self.assertIn(raised.exception.code, (1008, 4403))


if __name__ == "__main__":
    unittest.main()
