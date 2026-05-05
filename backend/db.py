"""SQLite database for watchlist, analysis history, backtests, and settings."""

import sqlite3
import os
import json
from datetime import datetime
from contextlib import contextmanager

DB_PATH = os.path.join(os.path.expanduser("~"), ".tradingagents", "trading_agent.db")


def ensure_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS watchlist (
                ticker TEXT PRIMARY KEY,
                exchange TEXT DEFAULT 'NSE',
                name TEXT,
                added_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS analysis_history (
                task_id TEXT PRIMARY KEY,
                ticker TEXT NOT NULL,
                trade_date TEXT NOT NULL,
                signal TEXT,
                market_report TEXT,
                sentiment_report TEXT,
                news_report TEXT,
                fundamentals_report TEXT,
                investment_plan TEXT,
                trader_investment_plan TEXT,
                final_trade_decision TEXT,
                bull_history TEXT,
                bear_history TEXT,
                risk_aggressive_history TEXT,
                risk_conservative_history TEXT,
                risk_neutral_history TEXT,
                stats TEXT,
                duration_seconds REAL,
                entry_price REAL,
                exit_price REAL,
                pnl_amount REAL,
                pnl_pct REAL,
                pnl_status TEXT DEFAULT 'pending',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS backtest_runs (
                backtest_id TEXT PRIMARY KEY,
                ticker TEXT NOT NULL,
                initial_capital REAL DEFAULT 100000,
                position_size_pct REAL DEFAULT 10,
                enable_learning BOOLEAN DEFAULT 0,
                total_trades INTEGER DEFAULT 0,
                winning_trades INTEGER DEFAULT 0,
                losing_trades INTEGER DEFAULT 0,
                total_return_pct REAL DEFAULT 0,
                max_drawdown_pct REAL DEFAULT 0,
                final_portfolio_value REAL,
                status TEXT DEFAULT 'running',
                created_at TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS backtest_trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                backtest_id TEXT NOT NULL,
                trade_date TEXT NOT NULL,
                ticker TEXT NOT NULL,
                signal TEXT,
                entry_price REAL,
                exit_price REAL,
                pnl_amount REAL,
                pnl_pct REAL,
                cumulative_pnl REAL,
                portfolio_value REAL,
                duration_seconds REAL,
                FOREIGN KEY (backtest_id) REFERENCES backtest_runs(backtest_id)
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            -- Paper trading: virtual trades opened from recommendations
            CREATE TABLE IF NOT EXISTS paper_trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticker TEXT NOT NULL,
                source TEXT,                        -- "recommendation" | "manual" | "scanner" | "ai_analysis"
                strategy TEXT,                      -- Human-readable: "Recommendation Engine", "Gap Scanner", "AI Pipeline", etc.
                direction TEXT,                     -- "LONG" | "SHORT"
                signal TEXT,                        -- BUY, STRONG BUY, etc.
                score REAL,                         -- from recommendation engine
                confidence TEXT,                    -- HIGH | MEDIUM | LOW
                success_probability INTEGER,
                triggered_signals TEXT,             -- JSON: list of specific signal names that fired
                entry_price REAL NOT NULL,
                entry_date TEXT DEFAULT (date('now')),
                entry_datetime TEXT DEFAULT (datetime('now')),
                price_1d REAL,                      -- price 1 trading day later
                price_3d REAL,
                price_5d REAL,
                price_10d REAL,
                pnl_1d_pct REAL,
                pnl_3d_pct REAL,
                pnl_5d_pct REAL,
                pnl_10d_pct REAL,
                status TEXT DEFAULT 'active',       -- active | expired | manually_closed
                notes TEXT,
                updated_at TEXT DEFAULT (datetime('now'))
            );

            -- Daily Verdict snapshots — measures whether the verdict actually predicted Nifty's move
            CREATE TABLE IF NOT EXISTS verdict_history (
                snapshot_date TEXT PRIMARY KEY,         -- YYYY-MM-DD (one row per day)
                verdict TEXT NOT NULL,                  -- GREEN | YELLOW | RED
                label TEXT,
                action TEXT,
                caution_count INTEGER,
                favorable_count INTEGER,
                caution_flags TEXT,                     -- JSON list
                favorable_flags TEXT,                   -- JSON list
                position_size_pct REAL,
                max_trades_today INTEGER,
                min_conviction TEXT,
                nifty_close REAL,                       -- Nifty close on snapshot_date
                nifty_close_1d REAL,                    -- Nifty close 1 trading day later
                nifty_close_3d REAL,
                nifty_close_5d REAL,
                nifty_return_1d_pct REAL,
                nifty_return_3d_pct REAL,
                nifty_return_5d_pct REAL,
                outcome_1d TEXT,                        -- predicted_correctly | predicted_wrong | neutral
                outcome_3d TEXT,
                outcome_5d TEXT,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );

            -- Historical backtest of the recommendation engine
            CREATE TABLE IF NOT EXISTS recommender_backtests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                trade_date TEXT NOT NULL,
                ticker TEXT NOT NULL,
                signal TEXT,
                score REAL,
                confidence TEXT,
                success_probability INTEGER,
                entry_price REAL,
                return_1d REAL,
                return_3d REAL,
                return_5d REAL,
                return_10d REAL,
                outcome_1d TEXT,                    -- win | loss | breakeven
                outcome_5d TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
        """)


@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


# --- Watchlist ---

def get_watchlist() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM watchlist ORDER BY added_at DESC").fetchall()
        return [dict(r) for r in rows]


def add_to_watchlist(ticker: str, exchange: str = "NSE", name: str = None):
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO watchlist (ticker, exchange, name) VALUES (?, ?, ?)",
            (ticker.upper(), exchange, name),
        )


def remove_from_watchlist(ticker: str):
    with get_db() as conn:
        conn.execute("DELETE FROM watchlist WHERE ticker = ?", (ticker.upper(),))


# --- Analysis History ---

def save_analysis(task_id: str, data: dict):
    with get_db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO analysis_history
            (task_id, ticker, trade_date, signal, market_report, sentiment_report,
             news_report, fundamentals_report, investment_plan, trader_investment_plan,
             final_trade_decision, bull_history, bear_history,
             risk_aggressive_history, risk_conservative_history, risk_neutral_history,
             stats, duration_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                task_id,
                data.get("ticker"),
                data.get("trade_date"),
                data.get("signal"),
                data.get("market_report"),
                data.get("sentiment_report"),
                data.get("news_report"),
                data.get("fundamentals_report"),
                data.get("investment_plan"),
                data.get("trader_investment_plan"),
                data.get("final_trade_decision"),
                data.get("bull_history"),
                data.get("bear_history"),
                data.get("risk_aggressive_history"),
                data.get("risk_conservative_history"),
                data.get("risk_neutral_history"),
                json.dumps(data.get("stats")) if data.get("stats") else None,
                data.get("duration_seconds"),
            ),
        )


def update_analysis_pnl(task_id: str, entry_price: float, exit_price: float, pnl_amount: float, pnl_pct: float, pnl_status: str):
    with get_db() as conn:
        conn.execute(
            "UPDATE analysis_history SET entry_price=?, exit_price=?, pnl_amount=?, pnl_pct=?, pnl_status=? WHERE task_id=?",
            (entry_price, exit_price, pnl_amount, pnl_pct, pnl_status, task_id),
        )


def get_analysis(task_id: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM analysis_history WHERE task_id = ?", (task_id,)).fetchone()
        if row:
            d = dict(row)
            if d.get("stats"):
                d["stats"] = json.loads(d["stats"])
            return d
        return None


def get_analysis_history(limit: int = 50, offset: int = 0) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            """SELECT task_id, ticker, trade_date, signal, duration_seconds,
                      entry_price, exit_price, pnl_pct, pnl_status, created_at
               FROM analysis_history ORDER BY created_at DESC LIMIT ? OFFSET ?""",
            (limit, offset),
        ).fetchall()
        return [dict(r) for r in rows]


# --- Backtest ---

def save_backtest_run(backtest_id: str, data: dict):
    with get_db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO backtest_runs
            (backtest_id, ticker, initial_capital, position_size_pct, enable_learning,
             total_trades, winning_trades, losing_trades, total_return_pct,
             max_drawdown_pct, final_portfolio_value, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                backtest_id,
                data.get("ticker"),
                data.get("initial_capital"),
                data.get("position_size_pct"),
                data.get("enable_learning"),
                data.get("total_trades", 0),
                data.get("winning_trades", 0),
                data.get("losing_trades", 0),
                data.get("total_return_pct", 0),
                data.get("max_drawdown_pct", 0),
                data.get("final_portfolio_value"),
                data.get("status", "running"),
            ),
        )


def save_backtest_trade(backtest_id: str, trade: dict):
    with get_db() as conn:
        conn.execute(
            """INSERT INTO backtest_trades
            (backtest_id, trade_date, ticker, signal, entry_price, exit_price,
             pnl_amount, pnl_pct, cumulative_pnl, portfolio_value, duration_seconds)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                backtest_id,
                trade.get("trade_date"),
                trade.get("ticker"),
                trade.get("signal"),
                trade.get("entry_price"),
                trade.get("exit_price"),
                trade.get("pnl_amount"),
                trade.get("pnl_pct"),
                trade.get("cumulative_pnl"),
                trade.get("portfolio_value"),
                trade.get("duration_seconds"),
            ),
        )


def get_backtest_run(backtest_id: str) -> dict | None:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM backtest_runs WHERE backtest_id = ?", (backtest_id,)).fetchone()
        return dict(row) if row else None


def get_backtest_trades(backtest_id: str) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM backtest_trades WHERE backtest_id = ? ORDER BY trade_date",
            (backtest_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def get_backtest_history(limit: int = 20) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM backtest_runs ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]


# --- Settings ---

def get_setting(key: str) -> str | None:
    with get_db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else None


def set_setting(key: str, value: str | None):
    with get_db() as conn:
        if value is None or value == "":
            conn.execute("DELETE FROM settings WHERE key = ?", (key,))
        else:
            conn.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                (key, value),
            )


def get_all_settings() -> dict:
    with get_db() as conn:
        rows = conn.execute("SELECT key, value FROM settings").fetchall()
        return {r["key"]: r["value"] for r in rows}


# --- Paper Trades ---

def add_paper_trade(data: dict) -> int:
    """Open a new paper trade. Returns the new row ID."""
    # Migrate: add columns if missing (safe no-op if they already exist)
    _migrate_paper_trades_columns()

    triggered = data.get("triggered_signals")
    if triggered is not None and not isinstance(triggered, str):
        triggered = json.dumps(triggered)

    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO paper_trades
            (ticker, source, strategy, direction, signal, score, confidence,
             success_probability, triggered_signals, entry_price, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.get("ticker"),
                data.get("source", "manual"),
                data.get("strategy"),
                data.get("direction", "LONG"),
                data.get("signal"),
                data.get("score"),
                data.get("confidence"),
                data.get("success_probability"),
                triggered,
                data.get("entry_price"),
                data.get("notes"),
            ),
        )
        return cursor.lastrowid


def _migrate_paper_trades_columns():
    """Add new columns to paper_trades if they don't exist (for existing DBs)."""
    with get_db() as conn:
        existing = {row["name"] for row in conn.execute("PRAGMA table_info(paper_trades)").fetchall()}
        for col, ddl in [
            ("strategy", "TEXT"),
            ("confidence", "TEXT"),
            ("triggered_signals", "TEXT"),
        ]:
            if col not in existing:
                try:
                    conn.execute(f"ALTER TABLE paper_trades ADD COLUMN {col} {ddl}")
                except Exception:
                    pass


def list_paper_trades(status: str | None = None) -> list[dict]:
    _migrate_paper_trades_columns()
    with get_db() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM paper_trades WHERE status = ? ORDER BY entry_datetime DESC",
                (status,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM paper_trades ORDER BY entry_datetime DESC"
            ).fetchall()
        result = []
        for r in rows:
            d = dict(r)
            if d.get("triggered_signals"):
                try:
                    d["triggered_signals"] = json.loads(d["triggered_signals"])
                except Exception:
                    pass
            result.append(d)
        return result


def update_paper_trade_prices(trade_id: int, prices: dict):
    """Update tracked prices + P&L percentages for a paper trade."""
    with get_db() as conn:
        # Get current trade to calculate P&L
        row = conn.execute("SELECT * FROM paper_trades WHERE id = ?", (trade_id,)).fetchone()
        if not row:
            return
        entry = row["entry_price"]
        direction = row["direction"]
        multiplier = 1 if direction == "LONG" else -1

        def calc_pnl(exit_price):
            if not exit_price or not entry:
                return None
            return round(multiplier * (exit_price - entry) / entry * 100, 2)

        conn.execute(
            """UPDATE paper_trades SET
                price_1d = COALESCE(?, price_1d),
                price_3d = COALESCE(?, price_3d),
                price_5d = COALESCE(?, price_5d),
                price_10d = COALESCE(?, price_10d),
                pnl_1d_pct = COALESCE(?, pnl_1d_pct),
                pnl_3d_pct = COALESCE(?, pnl_3d_pct),
                pnl_5d_pct = COALESCE(?, pnl_5d_pct),
                pnl_10d_pct = COALESCE(?, pnl_10d_pct),
                updated_at = datetime('now')
               WHERE id = ?""",
            (
                prices.get("price_1d"),
                prices.get("price_3d"),
                prices.get("price_5d"),
                prices.get("price_10d"),
                calc_pnl(prices.get("price_1d")),
                calc_pnl(prices.get("price_3d")),
                calc_pnl(prices.get("price_5d")),
                calc_pnl(prices.get("price_10d")),
                trade_id,
            ),
        )


def update_paper_trade_status(trade_id: int, status: str):
    with get_db() as conn:
        conn.execute(
            "UPDATE paper_trades SET status = ?, updated_at = datetime('now') WHERE id = ?",
            (status, trade_id),
        )


def delete_paper_trade(trade_id: int):
    with get_db() as conn:
        conn.execute("DELETE FROM paper_trades WHERE id = ?", (trade_id,))


# --- Recommender Backtest ---

def save_recommender_backtest_row(data: dict):
    with get_db() as conn:
        conn.execute(
            """INSERT INTO recommender_backtests
            (run_id, trade_date, ticker, signal, score, confidence, success_probability,
             entry_price, return_1d, return_3d, return_5d, return_10d, outcome_1d, outcome_5d)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.get("run_id"),
                data.get("trade_date"),
                data.get("ticker"),
                data.get("signal"),
                data.get("score"),
                data.get("confidence"),
                data.get("success_probability"),
                data.get("entry_price"),
                data.get("return_1d"),
                data.get("return_3d"),
                data.get("return_5d"),
                data.get("return_10d"),
                data.get("outcome_1d"),
                data.get("outcome_5d"),
            ),
        )


def get_recommender_backtest(run_id: str) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM recommender_backtests WHERE run_id = ? ORDER BY trade_date, ticker",
            (run_id,),
        ).fetchall()
        return [dict(r) for r in rows]


def list_recommender_backtest_runs() -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            """SELECT run_id, trade_date,
                      COUNT(*) as signals,
                      SUM(CASE WHEN outcome_5d='win' THEN 1 ELSE 0 END) as wins,
                      SUM(CASE WHEN outcome_5d='loss' THEN 1 ELSE 0 END) as losses,
                      AVG(return_5d) as avg_return_5d,
                      MAX(created_at) as created_at
               FROM recommender_backtests
               GROUP BY run_id
               ORDER BY MAX(created_at) DESC"""
        ).fetchall()
        return [dict(r) for r in rows]
