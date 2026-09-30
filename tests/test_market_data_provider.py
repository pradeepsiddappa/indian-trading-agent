import unittest
from unittest.mock import MagicMock, patch

from tests._support import IsolatedStateTestCase, csrf_headers, fresh_test_client, login
from backend.db import set_setting
from backend.market_data_provider import (
    MARKET_DATA_VENDOR_KEY,
    get_vendor_status,
    resolve_active_vendor,
    set_vendor_setting,
    fetch_quote,
)


class MarketDataProviderTests(IsolatedStateTestCase, unittest.TestCase):
    def test_vendor_status_and_resolution_defaults(self):
        status = get_vendor_status()
        self.assertEqual(status["configured_vendor"], "auto")
        self.assertEqual(status["resolved_vendor"], "yfinance")
        self.assertFalse(status["is_fallback"])
        self.assertEqual(len(status["options"]), 5)

    def test_vendor_setting_put_and_get_api(self):
        with fresh_test_client() as client:
            login(client)
            headers = csrf_headers(client)

            # Get initial status
            res = client.get("/api/market-data/vendor")
            self.assertEqual(res.status_code, 200, res.text)
            self.assertEqual(res.json()["configured_vendor"], "auto")

            # Update status to yfinance
            put_res = client.put(
                "/api/market-data/vendor",
                json={"vendor": "yfinance"},
                headers=headers,
            )
            self.assertEqual(put_res.status_code, 200, put_res.text)
            self.assertEqual(put_res.json()["configured_vendor"], "yfinance")

            # Check status GET reflects updated vendor
            res2 = client.get("/api/market-data/vendor")
            self.assertEqual(res2.json()["configured_vendor"], "yfinance")

    def test_auto_resolution_with_active_broker_sessions(self):
        from backend.market_data_provider import _today

        today = _today()

        # Mock Upstox active session today
        set_setting("upstox_access_token", "test_upstox_token")
        set_setting("upstox_access_token_date", today)

        vendor, label, fallback = resolve_active_vendor()
        self.assertEqual(vendor, "upstox")
        self.assertEqual(label, "Upstox API v2")
        self.assertFalse(fallback)

        # Higher priority Kite active session today
        set_setting("kite_access_token", "test_kite_token")
        set_setting("kite_access_token_date", today)

        vendor_kite, label_kite, fallback_kite = resolve_active_vendor()
        self.assertEqual(vendor_kite, "kite")
        self.assertEqual(label_kite, "Zerodha Kite Connect")
        self.assertFalse(fallback_kite)

    def test_explicit_vendor_fallback_when_session_expired(self):
        # Explicitly configure upstox, but no session today
        set_vendor_setting("upstox")

        vendor, label, fallback = resolve_active_vendor()
        self.assertEqual(vendor, "yfinance")
        self.assertTrue(fallback)
        self.assertIn("Upstox Expired", label)

    def test_fetch_quote_fallback_to_yfinance(self):
        mock_yfinance_quote = {
            "ticker": "RELIANCE.NS",
            "name": "Reliance Industries",
            "price": 2800.0,
            "change": 15.0,
            "change_percent": 0.54,
            "volume": 5000000,
            "high": 2820.0,
            "low": 2780.0,
            "open": 2790.0,
            "prev_close": 2785.0,
            "vendor_used": "Yahoo Finance (yfinance)",
        }

        with patch("backend.market_data_provider._fetch_yfinance_quote", return_value=mock_yfinance_quote):
            quote = fetch_quote("RELIANCE.NS")
            self.assertEqual(quote["ticker"], "RELIANCE.NS")
            self.assertEqual(quote["price"], 2800.0)
            self.assertEqual(quote["vendor_used"], "Yahoo Finance (yfinance)")


if __name__ == "__main__":
    unittest.main()
