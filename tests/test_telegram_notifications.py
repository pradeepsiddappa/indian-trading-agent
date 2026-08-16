import unittest
import io
import urllib.error
from unittest.mock import patch

from tests._support import IsolatedStateTestCase, csrf_headers, fresh_test_client, login


class TelegramNotificationTests(IsolatedStateTestCase, unittest.TestCase):
    def test_telegram_status_masks_token_and_chat_id(self):
        from backend.notifications.telegram import get_telegram_status, save_telegram_settings

        save_telegram_settings("123456789:AATESTTOKEN", "987654321")
        status = get_telegram_status()

        self.assertTrue(status["configured"])
        self.assertTrue(status["enabled"])
        self.assertNotIn("AATESTTOKEN", str(status))
        self.assertNotIn("987654321", str(status))
        self.assertEqual(status["masked_chat_id"], "****")

    def test_portfolio_review_message_contains_summary_and_flags(self):
        from backend.notifications.telegram import build_portfolio_review_message

        review = {
            "review_date": "2026-07-09",
            "summary": {
                "total_current": 150000,
                "total_invested": 120000,
                "total_pnl": 30000,
                "total_pnl_pct": 25,
                "total_day_pnl": -1000,
                "day_pnl_pct": -0.66,
            },
            "insights": {
                "portfolio_status": "REVIEW_NEEDED",
                "plain_summary": "Portfolio is up 25.00% overall. 1 holding needs review.",
                "high_risk_holdings": [{
                    "tradingsymbol": "TCS",
                    "action": "REVIEW",
                    "pnl_pct": -16.5,
                    "allocation_pct": 12.4,
                    "reasons": ["Drawdown is -16.5%."],
                }],
                "concentration_warnings": ["RELIANCE is 24.0% of portfolio."],
            },
        }

        text = build_portfolio_review_message(
            review,
            app_url="https://frontend.example/equity-portfolio-analysis",
        )

        self.assertIn("<b>Equity Portfolio Review</b> - 2026-07-09", text)
        self.assertIn("<b>Status:</b> REVIEW_NEEDED", text)
        self.assertIn("<b>TCS</b>: REVIEW", text)
        self.assertIn("RELIANCE is 24.0% of portfolio", text)
        self.assertIn("https://frontend.example/equity-portfolio-analysis", text)

    def test_latest_review_send_route_uses_latest_review_public_seam(self):
        review = {
            "review_id": "abc123",
            "review_date": "2026-07-09",
            "holdings": [],
            "summary": {
                "total_current": 0,
                "total_invested": 0,
                "total_pnl": 0,
                "total_pnl_pct": 0,
            },
            "insights": {
                "portfolio_status": "EMPTY",
                "plain_summary": "No equity holdings found in Kite.",
            },
            "model_metadata": {"mode": "test"},
        }
        self.db.save_equity_portfolio_review(review)

        with (
            fresh_test_client() as client,
            patch(
                "backend.routers.equity_portfolio.send_html_message_with_optional_buttons",
                return_value={"ok": True, "result": {"message_id": 42}},
            ),
        ):
            login(client)
            response = client.post(
                "/api/equity-portfolio/reviews/latest/send-telegram",
                headers=csrf_headers(client),
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["review_id"], "abc123")
        self.assertEqual(response.json()["message_id"], 42)

    def test_kite_login_reminder_route_sends_button_message_without_external_call(self):
        with (
            fresh_test_client() as client,
            patch(
                "backend.routers.telegram.send_html_message_with_optional_buttons",
                return_value={"ok": True, "result": {"message_id": 7}},
            ) as send,
        ):
            login(client)
            response = client.post(
                "/api/telegram/kite-login-reminder",
                headers=csrf_headers(client),
            )

        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["message_id"], 7)
        self.assertEqual(
            send.call_args.kwargs["reply_markup"]["inline_keyboard"][0][0]["text"],
            "Open portfolio page",
        )

    def test_run_and_send_route_rejects_an_empty_local_portfolio(self):
        with fresh_test_client() as client:
            login(client)
            response = client.post(
                "/api/equity-portfolio/reviews/run-and-send-telegram",
                headers=csrf_headers(client),
            )

        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("No positions stored", response.json()["detail"])

    def test_html_send_falls_back_without_buttons_when_telegram_rejects_url(self):
        from backend.notifications.telegram import (
            TelegramSendError,
            send_html_message_with_optional_buttons,
        )

        with patch(
            "backend.notifications.telegram.send_html_message",
            side_effect=[
                TelegramSendError(
                    '{"ok":false,"description":"Bad Request: BUTTON_URL_INVALID"}'
                ),
                {"ok": True, "result": {"message_id": 9}},
            ],
        ) as send:
            result = send_html_message_with_optional_buttons(
                "<b>hello</b>",
                reply_markup={"inline_keyboard": [[{"text": "Open", "url": "http://bad"}]]},
            )

        self.assertEqual(result["result"]["message_id"], 9)
        self.assertIsNone(send.call_args_list[1].kwargs["reply_markup"])

    def test_real_telegram_button_error_is_classified_for_safe_fallback(self):
        from backend.notifications.telegram import send_html_message_with_optional_buttons

        provider_error = urllib.error.HTTPError(
            "https://api.telegram.org/bottoken/sendMessage",
            400,
            "Bad Request",
            {},
            io.BytesIO(b'{"ok":false,"description":"Bad Request: BUTTON_URL_INVALID"}'),
        )

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return b'{"ok":true,"result":{"message_id":10}}'

        with (
            patch("backend.notifications.telegram._settings", return_value=("token", "chat")),
            patch(
                "backend.notifications.telegram.urllib.request.urlopen",
                side_effect=[provider_error, Response()],
            ) as urlopen,
        ):
            result = send_html_message_with_optional_buttons(
                "<b>hello</b>",
                reply_markup={"inline_keyboard": [[{"text": "Open", "url": "http://bad"}]]},
            )

        self.assertEqual(result["result"]["message_id"], 10)
        self.assertEqual(urlopen.call_count, 2)


if __name__ == "__main__":
    unittest.main()
