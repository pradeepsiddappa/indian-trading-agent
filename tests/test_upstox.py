import unittest
from unittest.mock import MagicMock, patch

from tests._support import IsolatedStateTestCase, csrf_headers, fresh_test_client, login


class UpstoxIntegrationTests(IsolatedStateTestCase, unittest.TestCase):
    def test_upstox_status_credentials_login_url_and_logout(self):
        with fresh_test_client() as client:
            login(client)
            headers = csrf_headers(client)

            # Initial status
            status = client.get("/api/upstox/status")
            self.assertEqual(status.status_code, 200, status.text)
            self.assertFalse(status.json()["configured"])
            self.assertFalse(status.json()["connected_today"])

            # Login URL without configuration fails
            no_creds_url = client.get("/api/upstox/login-url")
            self.assertEqual(no_creds_url.status_code, 400, no_creds_url.text)

            # Save credentials (PUT)
            save_resp = client.put(
                "/api/upstox/credentials",
                json={"api_key": "test_upstox_key", "api_secret": "test_upstox_secret"},
                headers=headers,
            )
            self.assertEqual(save_resp.status_code, 200, save_resp.text)

            # Check configured status
            status_configured = client.get("/api/upstox/status")
            self.assertTrue(status_configured.json()["configured"])

            # Get login URL
            login_url_resp = client.get("/api/upstox/login-url")
            self.assertEqual(login_url_resp.status_code, 200, login_url_resp.text)
            self.assertIn("https://api.upstox.com/v2/login/authorization/dialog", login_url_resp.json()["login_url"])
            self.assertIn("client_id=test_upstox_key", login_url_resp.json()["login_url"])

            # Logout / clear session
            logout_resp = client.post("/api/upstox/logout", headers=headers)
            self.assertEqual(logout_resp.status_code, 200, logout_resp.text)
            self.assertFalse(client.get("/api/upstox/status").json()["connected_today"])

    def test_upstox_oauth_callback_flow(self):
        with fresh_test_client() as client:
            login(client)
            headers = csrf_headers(client)

            # Save credentials (PUT)
            client.put(
                "/api/upstox/credentials",
                json={"api_key": "test_key", "api_secret": "test_secret"},
                headers=headers,
            )

            # Initiate login URL to generate OAuth state
            login_url_resp = client.get("/api/upstox/login-url")
            self.assertEqual(login_url_resp.status_code, 200, login_url_resp.text)

            mock_token_response = MagicMock()
            mock_token_response.status_code = 200
            mock_token_response.json.return_value = {
                "access_token": "mock_upstox_access_token",
                "user_name": "Test Upstox User",
                "user_id": "UPSTOX123",
            }

            mock_profile_response = MagicMock()
            mock_profile_response.status_code = 200
            mock_profile_response.json.return_value = {
                "status": "success",
                "data": {
                    "user_name": "Test Upstox User",
                    "user_id": "UPSTOX123",
                    "email": "test@upstox.com",
                },
            }

            mock_httpx = MagicMock()
            mock_httpx.__enter__.return_value.post.return_value = mock_token_response
            mock_httpx.__enter__.return_value.get.return_value = mock_profile_response

            with patch("httpx.Client", return_value=mock_httpx):
                callback_resp = client.get("/api/upstox/callback?code=mock_auth_code", follow_redirects=False)

            self.assertEqual(callback_resp.status_code, 307, callback_resp.text)
            self.assertIn("/equity-portfolio-analysis?upstox=connected", callback_resp.headers["location"])

            # Check connected status
            status_resp = client.get("/api/upstox/status")
            self.assertTrue(status_resp.json()["connected_today"])
            self.assertEqual(status_resp.json()["profile"]["user_name"], "Test Upstox User")

    def test_sync_positions_from_upstox(self):
        with fresh_test_client() as client:
            login(client)
            headers = csrf_headers(client)

            # Setup Upstox holdings response mock
            mock_holdings_response = MagicMock()
            mock_holdings_response.status_code = 200
            mock_holdings_response.json.return_value = {
                "status": "success",
                "data": [
                    {
                        "trading_symbol": "TATASTEEL",
                        "exchange": "NSE_EQ",
                        "quantity": 50,
                        "average_price": 140.5,
                        "last_price": 155.0,
                        "pnl": 725.0,
                    },
                    {
                        "trading_symbol": "INFY",
                        "exchange": "BSE_EQ",
                        "quantity": 10,
                        "average_price": 1450.0,
                        "last_price": 1500.0,
                        "pnl": 500.0,
                    },
                ],
            }

            from backend.brokers.upstox import (
                UPSTOX_ACCESS_TOKEN, UPSTOX_ACCESS_TOKEN_DATE, UPSTOX_PROFILE, save_upstox_credentials, _today
            )
            from backend.db import set_setting
            import json

            save_upstox_credentials("test_key", "test_secret")
            set_setting(UPSTOX_ACCESS_TOKEN, "mock_access_token")
            set_setting(UPSTOX_ACCESS_TOKEN_DATE, _today())
            set_setting(UPSTOX_PROFILE, json.dumps({"user_name": "Test User"}))

            mock_httpx = MagicMock()
            mock_httpx.__enter__.return_value.get.return_value = mock_holdings_response

            with patch("httpx.Client", return_value=mock_httpx):
                sync_resp = client.post("/api/positions/sync-upstox", headers=headers)

            self.assertEqual(sync_resp.status_code, 200, sync_resp.text)
            self.assertEqual(sync_resp.json()["added"], 2)
            self.assertEqual(sync_resp.json()["removed"], 0)

            # Check positions endpoint lists Upstox holdings with source="upstox"
            positions_resp = client.get("/api/positions")
            self.assertEqual(positions_resp.status_code, 200, positions_resp.text)
            positions = positions_resp.json()["positions"]
            self.assertEqual(len(positions), 2)
            by_symbol = {p["tradingsymbol"]: p for p in positions}
            self.assertEqual(by_symbol["TATASTEEL"]["source"], "upstox")
            self.assertEqual(by_symbol["TATASTEEL"]["exchange"], "NSE")
            self.assertEqual(by_symbol["TATASTEEL"]["quantity"], 50)
            self.assertEqual(by_symbol["INFY"]["source"], "upstox")
            self.assertEqual(by_symbol["INFY"]["exchange"], "BSE")


if __name__ == "__main__":
    unittest.main()
