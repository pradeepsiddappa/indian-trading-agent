import unittest
from unittest.mock import patch

from tests._support import IsolatedStateTestCase, csrf_headers, fresh_test_client, login


def manual_position(symbol: str, exchange: str = "NSE", **overrides) -> dict:
    position = {
        "tradingsymbol": symbol,
        "exchange": exchange,
        "quantity": 10,
        "average_price": 100,
        "last_price": 125,
        "notes": "outside Kite",
    }
    position.update(overrides)
    return position


class PositionsTests(IsolatedStateTestCase, unittest.TestCase):
    def test_manual_position_crud_preserves_exchange_identity(self):
        with fresh_test_client() as client:
            login(client)
            headers = csrf_headers(client)

            nse = client.post("/api/positions", json=manual_position("RELIANCE"), headers=headers)
            bse = client.post(
                "/api/positions",
                json=manual_position("RELIANCE", "BSE", quantity=4, average_price=200),
                headers=headers,
            )
            self.assertEqual(nse.status_code, 200, nse.text)
            self.assertEqual(bse.status_code, 200, bse.text)

            listed = client.get("/api/positions")
            self.assertEqual(listed.status_code, 200, listed.text)
            self.assertEqual(listed.json()["count"], 2)
            by_exchange = {
                row["exchange"]: row for row in listed.json()["positions"]
            }
            self.assertEqual(by_exchange["NSE"]["quantity"], 10)
            self.assertEqual(by_exchange["BSE"]["quantity"], 4)
            self.assertEqual(by_exchange["NSE"]["source"], "manual")
            self.assertEqual(by_exchange["BSE"]["source"], "manual")

            updated = client.put(
                "/api/positions/BSE/RELIANCE",
                json={"quantity": 7, "last_price": 220},
                headers=headers,
            )
            self.assertEqual(updated.status_code, 200, updated.text)
            self.assertEqual(updated.json()["position"]["exchange"], "BSE")
            self.assertEqual(updated.json()["position"]["quantity"], 7)

            deleted = client.delete("/api/positions/NSE/RELIANCE", headers=headers)
            self.assertEqual(deleted.status_code, 200, deleted.text)
            remaining = client.get("/api/positions").json()["positions"]
            self.assertEqual([(p["exchange"], p["quantity"]) for p in remaining], [("BSE", 7)])

    def test_listing_positions_does_not_implicitly_fetch_kite(self):
        with (
            fresh_test_client() as client,
            patch("backend.brokers.kite.fetch_equity_holdings") as fetch,
        ):
            login(client)
            response = client.get("/api/positions")

        self.assertEqual(response.status_code, 200, response.text)
        fetch.assert_not_called()

    def test_explicit_kite_sync_preserves_manual_rows_and_reconciles_kite_rows(self):
        with fresh_test_client() as client:
            login(client)
            headers = csrf_headers(client)
            manual = client.post(
                "/api/positions",
                json=manual_position("MANUALONLY", notes="must survive sync"),
                headers=headers,
            )
            self.assertEqual(manual.status_code, 200, manual.text)

            first_holdings = [{
                "tradingsymbol": "RELIANCE",
                "exchange": "NSE",
                "quantity": 3,
                "average_price": 100,
                "last_price": 110,
                "invested_value": 300,
                "current_value": 330,
                "pnl": 30,
                "pnl_pct": 10,
                "day_change": 1,
                "day_change_pct": 0.9,
                "source": "kite",
            }]
            with patch(
                "backend.brokers.kite.fetch_equity_holdings",
                return_value=first_holdings,
            ) as fetch:
                synced = client.post("/api/positions/sync", headers=headers)

            self.assertEqual(synced.status_code, 200, synced.text)
            fetch.assert_called_once_with()
            self.assertEqual(synced.json()["added"], 1)
            self.assertEqual(synced.json()["removed"], 0)

            second_holdings = [{
                **first_holdings[0],
                "last_price": 115,
                "current_value": 345,
                "pnl": 45,
                "pnl_pct": 15,
            }]
            with patch(
                "backend.brokers.kite.fetch_equity_holdings",
                return_value=second_holdings,
            ):
                synced_again = client.post("/api/positions/sync", headers=headers)

            self.assertEqual(synced_again.status_code, 200, synced_again.text)
            self.assertEqual(synced_again.json()["updated"], 1)

            positions = {
                p["tradingsymbol"]: p
                for p in client.get("/api/positions").json()["positions"]
            }
            self.assertEqual(positions["MANUALONLY"]["source"], "manual")
            self.assertEqual(positions["MANUALONLY"]["notes"], "must survive sync")
            self.assertEqual(positions["RELIANCE"]["source"], "kite")
            self.assertEqual(positions["RELIANCE"]["last_price"], 115)

    def test_invalid_manual_position_is_rejected_without_network_access(self):
        with (
            fresh_test_client() as client,
            patch("backend.brokers.kite.fetch_equity_holdings") as fetch,
        ):
            login(client)
            response = client.post(
                "/api/positions",
                json=manual_position("", quantity=0),
                headers=csrf_headers(client),
            )

        self.assertEqual(response.status_code, 400, response.text)
        fetch.assert_not_called()

    def test_local_positions_feed_concentration_checks(self):
        from backend.concentration import get_open_positions, get_sector_allocation

        with fresh_test_client() as client:
            login(client)
            response = client.post(
                "/api/positions",
                json=manual_position("RELIANCE", quantity=2, last_price=150),
                headers=csrf_headers(client),
            )

        self.assertEqual(response.status_code, 200, response.text)
        local = [position for position in get_open_positions() if position["source"] == "local_position"]
        self.assertEqual(len(local), 1)
        self.assertEqual(local[0]["position_value"], 300)
        allocation = get_sector_allocation(total_capital=1000)
        self.assertEqual(allocation["total_allocated"], 300)


if __name__ == "__main__":
    unittest.main()
