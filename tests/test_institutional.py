import unittest
from unittest.mock import MagicMock, patch

from tests._support import IsolatedStateTestCase, csrf_headers, fresh_test_client, login
from backend.fii_dii import get_today_data, get_market_bias, fetch_from_nse, fetch_from_moneycontrol
from backend.institutional_tracker import (
    fetch_block_deals,
    fetch_promoter_activity,
    get_delivery_stats,
    get_institutional_summary,
)


class InstitutionalTrackerTests(IsolatedStateTestCase, unittest.TestCase):
    def test_fii_dii_fetchers(self):
        # Mock NSE response
        mock_nse = [
            {"category": "FII/FPI", "buyValue": "10000", "sellValue": "12000", "netValue": "-2000", "date": "25-Sep-2026"},
            {"category": "DII", "buyValue": "15000", "sellValue": "11000", "netValue": "4000", "date": "25-Sep-2026"},
        ]
        with patch("requests.get") as mock_get:
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = mock_nse
            mock_get.return_value = mock_resp

            res = fetch_from_nse()
            self.assertIsNotNone(res)
            self.assertEqual(res["fii_net"], -2000.0)
            self.assertEqual(res["dii_net"], 4000.0)
            self.assertEqual(res["source"], "nse")

    def test_institutional_api_endpoints(self):
        with fresh_test_client() as client:
            login(client)

            # Test Summary endpoint
            res_summary = client.get("/api/institutional/summary")
            self.assertEqual(res_summary.status_code, 200)
            data = res_summary.json()
            self.assertIn("fii_dii", data)
            self.assertIn("bulk_deals", data)
            self.assertIn("promoter_activity", data)

            # Test Bulk Deals endpoint
            res_bulk = client.get("/api/institutional/bulk-deals")
            self.assertEqual(res_bulk.status_code, 200)
            self.assertIn("deals", res_bulk.json())

            # Test Promoter Activity endpoint
            res_promoter = client.get("/api/institutional/promoter-activity")
            self.assertEqual(res_promoter.status_code, 200)
            self.assertIn("activity", res_promoter.json())

            # Test Delivery stats endpoint
            res_deliv = client.get("/api/institutional/delivery/RELIANCE")
            self.assertEqual(res_deliv.status_code, 200)
            self.assertEqual(res_deliv.json()["symbol"], "RELIANCE")


if __name__ == "__main__":
    unittest.main()
