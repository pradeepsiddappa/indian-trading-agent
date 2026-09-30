import unittest
from unittest.mock import MagicMock, patch

from tests._support import IsolatedStateTestCase, csrf_headers, fresh_test_client, login


class KotakNeoIntegrationTests(IsolatedStateTestCase, unittest.TestCase):
    def test_kotak_neo_status_credentials_login_and_logout(self):
        with fresh_test_client() as client:
            login(client)
            headers = csrf_headers(client)

            # Initial status
            status = client.get("/api/kotak-neo/status")
            self.assertEqual(status.status_code, 200, status.text)
            self.assertFalse(status.json()["configured"])
            self.assertFalse(status.json()["connected_today"])

            # Save credentials (PUT)
            save_resp = client.put(
                "/api/kotak-neo/credentials",
                json={
                    "consumer_key": "test_consumer_key",
                    "consumer_secret": "test_consumer_secret",
                    "mobile_number": "9876543210",
                    "pan_or_dob": "ABCDE1234F",
                },
                headers=headers,
            )
            self.assertEqual(save_resp.status_code, 200, save_resp.text)

            # Check configured status
            status_configured = client.get("/api/kotak-neo/status")
            self.assertTrue(status_configured.json()["configured"])

            # Session login
            login_resp = client.post(
                "/api/kotak-neo/login",
                json={"mpin_or_password": "123456"},
                headers=headers,
            )
            self.assertEqual(login_resp.status_code, 200, login_resp.text)
            self.assertTrue(login_resp.json()["connected_today"])

            # Logout / clear session
            logout_resp = client.post("/api/kotak-neo/logout", headers=headers)
            self.assertEqual(logout_resp.status_code, 200, logout_resp.text)
            self.assertFalse(client.get("/api/kotak-neo/status").json()["connected_today"])

    def test_sync_positions_from_kotak_neo(self):
        with fresh_test_client() as client:
            login(client)
            headers = csrf_headers(client)

            mock_holdings_response = MagicMock()
            mock_holdings_response.status_code = 200
            mock_holdings_response.json.return_value = {
                "status": "success",
                "data": [
                    {
                        "symbol": "KOTAKBANK",
                        "exchange": "NSE",
                        "quantity": 25,
                        "averagePrice": 1750.0,
                        "lastPrice": 1820.0,
                        "pnl": 1750.0,
                    },
                    {
                        "symbol": "TCS",
                        "exchange": "BSE",
                        "quantity": 5,
                        "averagePrice": 3800.0,
                        "lastPrice": 3950.0,
                        "pnl": 750.0,
                    },
                ],
            }

            from backend.brokers.kotak_neo import (
                KOTAK_NEO_ACCESS_TOKEN, KOTAK_NEO_ACCESS_TOKEN_DATE, KOTAK_NEO_PROFILE,
                save_kotak_neo_credentials, _today,
            )
            from backend.db import set_setting
            import json

            save_kotak_neo_credentials("key", "secret", "9876543210")
            set_setting(KOTAK_NEO_ACCESS_TOKEN, "mock_token")
            set_setting(KOTAK_NEO_ACCESS_TOKEN_DATE, _today())
            set_setting(KOTAK_NEO_PROFILE, json.dumps({"user_name": "Kotak User"}))

            mock_httpx = MagicMock()
            mock_httpx.__enter__.return_value.get.return_value = mock_holdings_response

            with patch("httpx.Client", return_value=mock_httpx):
                sync_resp = client.post("/api/positions/sync-kotak-neo", headers=headers)

            self.assertEqual(sync_resp.status_code, 200, sync_resp.text)
            self.assertEqual(sync_resp.json()["added"], 2)

            positions = client.get("/api/positions").json()["positions"]
            self.assertEqual(len(positions), 2)
            by_symbol = {p["tradingsymbol"]: p for p in positions}
            self.assertEqual(by_symbol["KOTAKBANK"]["source"], "kotak_neo")
            self.assertEqual(by_symbol["TCS"]["source"], "kotak_neo")


if __name__ == "__main__":
    unittest.main()
