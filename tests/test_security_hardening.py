"""Regression tests for the security-audit fixes (network-free)."""

import os
import stat
import tempfile
import threading
import unittest
from unittest.mock import MagicMock, patch

from starlette.websockets import WebSocketDisconnect

from tests._support import IsolatedStateTestCase, csrf_headers, fresh_test_client, login


OPEN_MODE_ENV = {
    "TRADINGAGENTS_AUTH_MODE": "local",
    "TRADINGAGENTS_ENV": "local",
    "TRADINGAGENTS_AUTH_SECRET": "",
    "TRADINGAGENTS_AUTH_PASSWORD": "",
    "TRADINGAGENTS_AUTH_USERNAME": "",
    "TRADINGAGENTS_LOCAL_AUTH_SECRET": "",
    "TRADINGAGENTS_ALLOWED_HOSTS": "",
    "CORS_ORIGINS": "",
    "FRONTEND_URL": "http://localhost:3000",
}

RSS = (
    b'<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>'
    b"<item><title>Good</title><link>https://news.example/a</link></item>"
    b"<item><title>Evil</title><link>javascript:alert(1)</link></item>"
    b"</channel></rss>"
)


def open_mode_client():
    from fastapi.testclient import TestClient
    from backend.app import app

    return TestClient(app, base_url="http://localhost:8000")


def fake_dns(mapping):
    def resolve(host, port, *args, **kwargs):
        return [(2, 1, 6, "", (mapping[host], port))]
    return resolve


def fake_response(status=200, body=b"", headers=None):
    headers = headers or {}
    response = MagicMock()
    response.status_code = status
    response.headers = headers
    response.is_redirect = status in (301, 302, 303, 307, 308) and "Location" in headers
    response.iter_content = lambda chunk_size=65536: iter([body])
    return response


class TickerValidationTests(unittest.TestCase):
    def test_real_symbols_are_accepted(self):
        from tradingagents.utils.ticker import normalize_ticker

        cases = {
            "reliance": "RELIANCE.NS",
            "M&M": "M&M.NS",
            "BAJAJ-AUTO": "BAJAJ-AUTO.NS",
            "500325.BO": "500325.BO",
            "^NSEI": "^NSEI",
            "NIFTY 50": "^NSEI",
            "NIFTY_FIN_SERVICE.NS": "NIFTY_FIN_SERVICE.NS",
        }
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertEqual(normalize_ticker(raw), expected)

    def test_path_like_symbols_are_rejected(self):
        from tradingagents.utils.ticker import InvalidTickerError, normalize_ticker

        for raw in ("../../tmp/evil.NS", "a/b", "a\\b", "..", "X..Y.NS", "", "   ", "TATA MOTORS", "A^B"):
            with self.subTest(raw=raw):
                with self.assertRaises(InvalidTickerError):
                    normalize_ticker(raw)

    def test_safe_path_component_never_leaves_its_directory(self):
        from tradingagents.utils.ticker import safe_path_component

        self.assertEqual(safe_path_component("RELIANCE.NS"), "RELIANCE.NS")
        self.assertEqual(safe_path_component("M&M.NS"), "M&M.NS")
        for raw in ("../../etc/passwd", "..", ".", "a/../b", "..\\..\\x", "", "\x00"):
            with self.subTest(raw=raw):
                cleaned = safe_path_component(raw)
                self.assertTrue(cleaned)
                self.assertNotIn("/", cleaned)
                self.assertNotIn("\\", cleaned)
                self.assertNotIn("..", cleaned)

    def test_price_cache_file_stays_inside_the_cache_dir(self):
        import pandas as pd
        from tradingagents.dataflows import stockstats_utils

        frame = pd.DataFrame(
            {"Open": [1.0], "High": [1.0], "Low": [1.0], "Close": [1.0], "Volume": [1]},
            index=pd.DatetimeIndex(["2025-01-02"], name="Date"),
        )
        with tempfile.TemporaryDirectory() as root:
            cache = os.path.join(root, "cache")
            with (
                patch.object(stockstats_utils, "get_config", return_value={"data_cache_dir": cache}),
                patch.object(stockstats_utils.yf, "download", return_value=frame),
            ):
                stockstats_utils.load_ohlcv("../escape.NS", "2025-01-10")
            written = [os.path.join(d, n) for d, _, names in os.walk(root) for n in names]

        self.assertEqual(len(written), 1)
        self.assertEqual(os.path.dirname(written[0]), cache)

    def test_analysis_log_stays_inside_results_dir(self):
        from tradingagents.graph.trading_graph import TradingAgentsGraph

        debate = dict.fromkeys(("bull_history", "bear_history", "history", "current_response", "judge_decision"), "")
        risk = dict.fromkeys(("aggressive_history", "conservative_history", "neutral_history", "history", "judge_decision"), "")
        final_state = {
            "company_of_interest": "X", "trade_date": "2025-01-10",
            "market_report": "", "sentiment_report": "", "news_report": "", "fundamentals_report": "",
            "investment_debate_state": debate, "trader_investment_plan": "",
            "risk_debate_state": risk, "investment_plan": "", "final_trade_decision": "",
        }
        with tempfile.TemporaryDirectory() as root:
            results = os.path.join(root, "results")
            graph = TradingAgentsGraph.__new__(TradingAgentsGraph)
            graph.config = {"results_dir": results}
            graph.ticker = "../../escape.NS"
            graph.log_states_dict = {}
            graph._log_state("2025-01-10", final_state)
            written = [os.path.join(d, n) for d, _, names in os.walk(root) for n in names]

        self.assertEqual(len(written), 1)
        self.assertEqual(os.path.commonpath([written[0], results]), results)


class TickerApiTests(IsolatedStateTestCase, unittest.TestCase):
    def test_bad_ticker_is_a_400_and_nothing_runs(self):
        with fresh_test_client() as client:
            login(client)
            with patch("backend.routers.analysis._run_analysis_sync") as run:
                response = client.post(
                    "/api/analysis/run",
                    json={"ticker": "../../tmp/evil.NS", "trade_date": "2025-01-10"},
                    headers=csrf_headers(client),
                )

        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("Invalid ticker", response.json()["detail"])
        run.assert_not_called()


class BacktestLimitTests(IsolatedStateTestCase, unittest.TestCase):
    def _post(self, client, **overrides):
        body = {"ticker": "RELIANCE", "start_date": "2025-03-03", "end_date": "2025-03-12", "interval_days": 5}
        body.update(overrides)
        return client.post("/api/backtest/run", json=body, headers=csrf_headers(client))

    def test_too_many_paid_dates_is_rejected_before_anything_runs(self):
        from backend.routers import backtest

        with fresh_test_client() as client, patch.dict(os.environ, {"TRADINGAGENTS_MAX_BACKTEST_DATES": ""}):
            login(client)
            with patch.object(backtest, "_execute_backtest") as execute:
                response = self._post(client, start_date="2020-01-01", end_date="2024-12-31", interval_days=1)

        self.assertEqual(response.status_code, 400, response.text)
        self.assertIn("the limit is 60", response.json()["detail"])
        execute.assert_not_called()

    def test_invalid_ranges_are_rejected(self):
        with fresh_test_client() as client:
            login(client)
            for overrides in (
                {"interval_days": 0},
                {"start_date": "2025-03-12", "end_date": "2025-03-03"},
                {"start_date": "03/03/2025"},
                {"start_date": "1990-01-01", "end_date": "2025-01-01", "interval_days": 365},
                {"position_size_pct": 150},
                {"initial_capital": -5},
            ):
                with self.subTest(overrides=overrides):
                    self.assertEqual(self._post(client, **overrides).status_code, 422)

    def test_only_one_backtest_runs_at_a_time(self):
        from backend.routers import backtest

        with fresh_test_client() as client:
            login(client)
            self.assertTrue(backtest._backtest_slot.acquire(blocking=False))
            try:
                busy = self._post(client)
            finally:
                backtest._backtest_slot.release()

        self.assertEqual(busy.status_code, 409, busy.text)

    def test_small_backtest_starts_and_frees_its_slot(self):
        from backend.routers import backtest

        ran = threading.Event()
        with fresh_test_client() as client:
            login(client)
            with patch.object(backtest, "_execute_backtest", side_effect=lambda *args: ran.set()):
                response = self._post(client)
                self.assertTrue(ran.wait(5))

        self.assertEqual(response.status_code, 200, response.text)
        self.assertGreater(response.json()["total_dates"], 0)
        self.assertTrue(backtest._backtest_slot.acquire(timeout=5))
        backtest._backtest_slot.release()

    def test_limit_is_configurable(self):
        from backend.routers import backtest

        with patch.dict(os.environ, {"TRADINGAGENTS_MAX_BACKTEST_DATES": "5"}):
            self.assertEqual(backtest.max_backtest_dates(), 5)
        with patch.dict(os.environ, {"TRADINGAGENTS_MAX_BACKTEST_DATES": "junk"}):
            self.assertEqual(backtest.max_backtest_dates(), 60)


class FeedUrlTests(unittest.TestCase):
    def test_only_public_http_urls_are_accepted(self):
        from backend.news_sources import UnsafeFeedURL, validate_feed_url

        good = "https://www.moneycontrol.com/rss/MCtopnews.xml"
        self.assertEqual(validate_feed_url(f"  {good} "), good)
        for url in (
            "file:///etc/passwd", "/etc/passwd", "ftp://example.com/feed",
            "http://127.0.0.1/feed", "http://localhost:8000/api/health",
            "http://169.254.169.254/latest/meta-data/", "http://10.0.0.8/rss",
            "http://[::1]/feed", "https://user:pw@example.com/rss", "", None,
        ):
            with self.subTest(url=url):
                with self.assertRaises(UnsafeFeedURL):
                    validate_feed_url(url)

    def test_feed_resolving_to_a_private_address_is_never_requested(self):
        from backend import news_sources

        with (
            patch.object(news_sources.socket, "getaddrinfo", side_effect=fake_dns({"feeds.example": "127.0.0.1"})),
            patch.object(news_sources.requests, "get") as get,
        ):
            articles = news_sources._parse_rss("k", {"url": "https://feeds.example/rss"})

        self.assertEqual(articles, [])
        get.assert_not_called()

    def test_redirect_to_a_private_address_is_not_followed(self):
        from backend import news_sources

        hop = fake_response(302, headers={"Location": "http://internal.example/secret"})
        dns = fake_dns({"feeds.example": "93.184.216.34", "internal.example": "10.0.0.5"})
        with (
            patch.object(news_sources.socket, "getaddrinfo", side_effect=dns),
            patch.object(news_sources.requests, "get", return_value=hop) as get,
        ):
            articles = news_sources._parse_rss("k", {"url": "https://feeds.example/rss"})

        self.assertEqual(articles, [])
        self.assertEqual(get.call_count, 1)

    def test_public_feed_is_parsed_and_unsafe_links_are_dropped(self):
        from backend import news_sources

        with (
            patch.object(news_sources.socket, "getaddrinfo", side_effect=fake_dns({"feeds.example": "93.184.216.34"})),
            patch.object(news_sources.requests, "get", return_value=fake_response(200, RSS, {"Content-Type": "application/rss+xml"})),
        ):
            articles = news_sources._parse_rss("k", {"url": "https://feeds.example/rss"})

        self.assertEqual([a["title"] for a in articles], ["Good", "Evil"])
        self.assertEqual([a["url"] for a in articles], ["https://news.example/a", ""])

    def test_feed_body_naming_a_local_file_is_not_opened(self):
        # feedparser opens any string or bytes that names an existing file. The
        # body must reach it as a stream, or a hostile feed could make the
        # server read (and echo back) local files.
        from backend import news_sources

        with tempfile.NamedTemporaryFile("wb", suffix=".xml", delete=False) as handle:
            handle.write(RSS)
        try:
            with (
                patch.object(news_sources.socket, "getaddrinfo", side_effect=fake_dns({"feeds.example": "93.184.216.34"})),
                patch.object(news_sources.requests, "get", return_value=fake_response(200, handle.name.encode())),
            ):
                articles = news_sources._parse_rss("k", {"url": "https://feeds.example/rss"})
        finally:
            os.unlink(handle.name)

        self.assertEqual(articles, [])


class FeedSettingsApiTests(IsolatedStateTestCase, unittest.TestCase):
    def test_unsafe_feed_url_is_rejected_and_not_saved(self):
        from backend.news_sources import get_news_sources_config

        with fresh_test_client() as client:
            login(client)
            response = client.put(
                "/api/news/sources",
                json={"rss_feeds": {"evil": {"name": "x", "url": "file:///etc/passwd", "enabled": True}}},
                headers=csrf_headers(client),
            )
            config = get_news_sources_config()

        self.assertEqual(response.status_code, 400, response.text)
        self.assertNotIn("evil", config["rss_feeds"])


class OpenModeRequestTests(IsolatedStateTestCase, unittest.TestCase):
    def test_this_machines_own_requests_are_allowed(self):
        with patch.dict(os.environ, OPEN_MODE_ENV), open_mode_client() as client:
            no_origin = client.post("/api/kite/logout")
            frontend = client.post("/api/kite/logout", headers={"Origin": "http://localhost:3000"})
            same_origin_docs = client.post("/api/kite/logout", headers={"Origin": "http://localhost:8000"})
            loopback_ip = client.get("/api/health", headers={"Host": "127.0.0.1:8000"})

        for response in (no_origin, frontend, same_origin_docs, loopback_ip):
            self.assertEqual(response.status_code, 200, response.text)

    def test_dns_rebinding_host_is_rejected(self):
        with patch.dict(os.environ, OPEN_MODE_ENV), open_mode_client() as client:
            response = client.get("/api/settings/api-keys", headers={"Host": "attacker.example:8000"})

        self.assertEqual(response.status_code, 400, response.text)

    def test_other_websites_cannot_call_in(self):
        with patch.dict(os.environ, OPEN_MODE_ENV), open_mode_client() as client:
            for origin in ("https://attacker.example", "null"):
                with self.subTest(origin=origin):
                    response = client.post("/api/signal-performance/reset", headers={"Origin": origin})
                    self.assertEqual(response.status_code, 403, response.text)

    def test_other_websites_cannot_open_websockets(self):
        # websocket_connect ignores base_url, so use a full local URL; otherwise
        # the Host check (not the Origin check) would be what rejects it.
        url = "ws://localhost:8000/api/analysis/ws/x"
        with patch.dict(os.environ, OPEN_MODE_ENV), open_mode_client() as client:
            with self.assertRaises(WebSocketDisconnect) as raised:
                with client.websocket_connect(url, headers={"Origin": "https://attacker.example"}):
                    self.fail("foreign-origin websocket was accepted")
            with client.websocket_connect(url, headers={"Origin": "http://localhost:3000"}) as websocket:
                websocket.close()

        self.assertEqual(raised.exception.code, 4403)
        self.assertEqual(raised.exception.reason, "Origin not allowed")

    def test_extra_hosts_can_be_allowed_explicitly(self):
        env = {**OPEN_MODE_ENV, "TRADINGAGENTS_ALLOWED_HOSTS": "trading.lan"}
        with patch.dict(os.environ, env), open_mode_client() as client:
            response = client.get("/api/health", headers={"Host": "trading.lan:8000"})

        self.assertEqual(response.status_code, 200, response.text)


@unittest.skipIf(os.name == "nt", "POSIX permissions only")
class DatabasePermissionTests(IsolatedStateTestCase, unittest.TestCase):
    def test_database_file_is_private(self):
        self.assertEqual(stat.S_IMODE(os.stat(self.db_path).st_mode), 0o600)

    def test_default_home_directory_is_private(self):
        home = os.path.join(self.home.name, "default-home")
        os.makedirs(home)
        os.chmod(home, 0o755)
        with patch.object(self.db, "DEFAULT_HOME", home), patch.dict(os.environ, {"TRADINGAGENTS_HOME": home}):
            self.db.ensure_db()
            db_file = self.db.get_db_path()

        self.assertEqual(stat.S_IMODE(os.stat(home).st_mode), 0o700)
        self.assertEqual(stat.S_IMODE(os.stat(db_file).st_mode), 0o600)


class ShadowTradeRefreshTests(IsolatedStateTestCase, unittest.TestCase):
    def test_refresh_runs_and_skips_a_malformed_saved_ticker(self):
        from backend.shadow_trades import refresh_shadow_prices

        with self.db.get_db() as conn:
            conn.execute(
                "INSERT INTO shadow_trades (ticker, signal_date, entry_price) VALUES (?, ?, ?)",
                ("../escape", "2025-01-02", 100.0),
            )
        with patch("backend.simulation._price_n_days_later") as price:
            result = refresh_shadow_prices()

        self.assertIsInstance(result, dict)
        price.assert_not_called()


class CliAnnouncementTests(unittest.TestCase):
    def test_no_network_call_unless_opted_in(self):
        from cli import announcements

        with (
            patch.dict(os.environ, {"TRADINGAGENTS_CLI_ANNOUNCEMENTS": ""}),
            patch.object(announcements.requests, "get") as get,
        ):
            data = announcements.fetch_announcements()

        get.assert_not_called()
        self.assertEqual(data["announcements"], [announcements.CLI_CONFIG["announcements_fallback"]])


class CodeScanningFixTests(unittest.TestCase):
    def test_memory_name_cannot_escape_the_memory_dir(self):
        from tradingagents.agents.utils.memory import FinancialSituationMemory

        with tempfile.TemporaryDirectory() as root:
            config = {"memory_dir": os.path.join(root, "memory")}
            for bad in ("../escape", "../../etc/passwd", "a/../../b"):
                with self.subTest(name=bad):
                    with self.assertRaises(ValueError):
                        FinancialSituationMemory(bad, config)
            memory = FinancialSituationMemory("bull_memory", config)

        self.assertEqual(os.path.basename(memory.persist_path), "bull_memory.json")


class ErrorMessageTests(IsolatedStateTestCase, unittest.TestCase):
    def test_price_failure_does_not_leak_exception_text(self):
        from backend import simulation

        with patch.object(simulation.yf, "Ticker", side_effect=RuntimeError("internal detail /Users/someone/secret")):
            result = simulation.open_paper_trade("RELIANCE")

        self.assertFalse(result["ok"])
        self.assertNotIn("internal detail", result["error"])
        self.assertIn("RELIANCE.NS", result["error"])

    def test_llm_failures_get_a_friendly_message(self):
        from backend.routers.analysis import _friendly_llm_error

        AuthenticationError = type("AuthenticationError", (Exception,), {})
        RateLimitError = type("RateLimitError", (Exception,), {})
        self.assertIn("API key", _friendly_llm_error(AuthenticationError("401 invalid x-api-key sk-ant-abc")))
        self.assertIn("rate limit", _friendly_llm_error(RateLimitError("429 too many requests")))
        self.assertNotIn("boom", _friendly_llm_error(RuntimeError("boom")))


if __name__ == "__main__":
    unittest.main()
