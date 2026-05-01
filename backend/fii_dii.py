"""FII/DII Daily Flow Tracker.

Fetches FII (Foreign Institutional Investor) and DII (Domestic Institutional Investor)
daily buy/sell data — the single biggest predictor of next-day market direction in Indian markets.

Data sources (with fallback chain):
1. NSE India official API (requires cookies + headers)
2. Moneycontrol scraper (fallback)
3. Manual entry via API (admin override)

Caches results in DB to avoid hammering external sources.
"""

import requests
import time
from datetime import datetime, date, timedelta
from typing import Optional
from backend.db import get_db


# Headers that mimic a real browser (NSE blocks most requests without these)
NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.nseindia.com/reports/fii-dii",
    "Connection": "keep-alive",
}


def _ensure_table():
    """Create fii_dii_history table if it doesn't exist."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS fii_dii_history (
                date TEXT PRIMARY KEY,
                fii_buy REAL,
                fii_sell REAL,
                fii_net REAL,
                dii_buy REAL,
                dii_sell REAL,
                dii_net REAL,
                source TEXT,
                fetched_at TEXT DEFAULT (datetime('now'))
            )
        """)


def _get_nse_session() -> requests.Session:
    """Create a session with NSE cookies set."""
    session = requests.Session()
    session.headers.update(NSE_HEADERS)
    try:
        # First hit the main page to get cookies
        session.get("https://www.nseindia.com/reports/fii-dii", timeout=10)
        time.sleep(0.5)
    except Exception:
        pass
    return session


def fetch_from_nse() -> Optional[dict]:
    """Fetch latest FII/DII data from NSE via nsepython library.

    Returns:
        Dict with date, fii_buy/sell/net, dii_buy/sell/net — or None if failed.
    """
    try:
        from nsepython import nse_fiidii

        raw = nse_fiidii()

        # nse_fiidii returns a stringified table — parse it
        entries = []
        if isinstance(raw, str):
            lines = [l for l in raw.strip().split("\n") if l.strip()]
            if len(lines) < 2:
                return None

            # Skip header line, parse data rows like:
            # "0      DII  30-Apr-2026  18252.89  14765.79    3487.1"
            for line in lines[1:]:
                parts = line.split()
                # Drop leading index if it's a digit
                if parts and parts[0].isdigit():
                    parts = parts[1:]
                if len(parts) < 5:
                    continue
                try:
                    cat = parts[0]
                    date_str = parts[1]
                    buy_val = float(parts[2])
                    sell_val = float(parts[3])
                    net_val = float(parts[4])
                    entries.append({
                        "category": cat,
                        "date": date_str,
                        "buyValue": buy_val,
                        "sellValue": sell_val,
                        "netValue": net_val,
                    })
                except (ValueError, IndexError):
                    continue
        elif hasattr(raw, "to_dict"):
            entries = raw.to_dict("records")
        elif isinstance(raw, list):
            entries = raw
        else:
            return None

        if not entries:
            return None

        result = {"fii_buy": 0, "fii_sell": 0, "fii_net": 0, "dii_buy": 0, "dii_sell": 0, "dii_net": 0}
        date_str = None

        for entry in entries:
            cat = (entry.get("category") or "").upper()
            buy = float(entry.get("buyValue", 0) or 0)
            sell = float(entry.get("sellValue", 0) or 0)
            net = float(entry.get("netValue", 0) or 0)
            d = entry.get("date")
            if d and not date_str:
                date_str = d

            if "FII" in cat or "FPI" in cat:
                result["fii_buy"] = buy
                result["fii_sell"] = sell
                result["fii_net"] = net
            elif "DII" in cat:
                result["dii_buy"] = buy
                result["dii_sell"] = sell
                result["dii_net"] = net

        if date_str:
            try:
                parsed = datetime.strptime(date_str, "%d-%b-%Y")
                result["date"] = parsed.strftime("%Y-%m-%d")
            except Exception:
                result["date"] = date.today().strftime("%Y-%m-%d")
        else:
            result["date"] = date.today().strftime("%Y-%m-%d")

        result["source"] = "nse"
        return result
    except Exception as e:
        print(f"[FII/DII] NSE fetch failed: {e}", flush=True)
        return None


def fetch_from_moneycontrol() -> Optional[dict]:
    """Fallback: scrape moneycontrol's FII/DII data."""
    try:
        url = "https://www.moneycontrol.com/stocks/marketstats/fii_dii_activity/index.php"
        resp = requests.get(url, headers={"User-Agent": NSE_HEADERS["User-Agent"]}, timeout=15)
        if resp.status_code != 200:
            return None

        # Simple pattern match for the values (this is fragile but works as fallback)
        # Production version would use BeautifulSoup
        text = resp.text
        # Look for patterns like "FII"..."Net"..."-2,453.45" etc.
        # For now, return None and let manual entry handle it
        return None
    except Exception:
        return None


def get_today_data(force_refresh: bool = False) -> Optional[dict]:
    """Get today's FII/DII data — checks cache first, then fetches if needed."""
    _ensure_table()
    today_str = date.today().strftime("%Y-%m-%d")

    if not force_refresh:
        with get_db() as conn:
            row = conn.execute(
                "SELECT * FROM fii_dii_history WHERE date = ?", (today_str,)
            ).fetchone()
            if row:
                d = dict(row)
                # If fetched within last hour, use cache
                fetched = datetime.fromisoformat(d["fetched_at"])
                if (datetime.now() - fetched).total_seconds() < 3600:
                    return d

    # Fetch fresh
    data = fetch_from_nse()
    if not data:
        data = fetch_from_moneycontrol()

    if data:
        save_data(data)
        return get_data_for_date(data["date"])

    return None


def save_data(data: dict):
    """Save FII/DII data to DB."""
    _ensure_table()
    with get_db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO fii_dii_history
            (date, fii_buy, fii_sell, fii_net, dii_buy, dii_sell, dii_net, source, fetched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
            (
                data.get("date"),
                data.get("fii_buy"),
                data.get("fii_sell"),
                data.get("fii_net"),
                data.get("dii_buy"),
                data.get("dii_sell"),
                data.get("dii_net"),
                data.get("source", "manual"),
            ),
        )


def manual_entry(date_str: str, fii_net: float, dii_net: float,
                 fii_buy: float = None, fii_sell: float = None,
                 dii_buy: float = None, dii_sell: float = None) -> dict:
    """Manually enter FII/DII data for a date (used when scraping fails)."""
    if fii_buy is None:
        # If only net given, estimate buy/sell as +/- net
        fii_buy = abs(fii_net) if fii_net > 0 else 0
        fii_sell = abs(fii_net) if fii_net < 0 else 0
    if dii_buy is None:
        dii_buy = abs(dii_net) if dii_net > 0 else 0
        dii_sell = abs(dii_net) if dii_net < 0 else 0

    data = {
        "date": date_str,
        "fii_buy": fii_buy,
        "fii_sell": fii_sell,
        "fii_net": fii_net,
        "dii_buy": dii_buy,
        "dii_sell": dii_sell,
        "dii_net": dii_net,
        "source": "manual",
    }
    save_data(data)
    return data


def get_data_for_date(date_str: str) -> Optional[dict]:
    """Get FII/DII data for a specific date."""
    _ensure_table()
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM fii_dii_history WHERE date = ?", (date_str,)
        ).fetchone()
        return dict(row) if row else None


def get_recent_history(days: int = 10) -> list[dict]:
    """Get FII/DII data for the last N days."""
    _ensure_table()
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM fii_dii_history ORDER BY date DESC LIMIT ?", (days,)
        ).fetchall()
        return [dict(r) for r in rows]


def get_market_bias() -> dict:
    """Compute market bias based on recent FII/DII flows.

    Returns a structured assessment used by the recommendation engine.
    """
    history = get_recent_history(days=5)
    if not history:
        return {
            "bias": "NEUTRAL",
            "confidence": "NONE",
            "score_adjustment": 0,
            "reasoning": "No FII/DII data available",
            "today_fii_net": None,
            "today_dii_net": None,
        }

    today = history[0]
    fii_today = today.get("fii_net") or 0
    dii_today = today.get("dii_net") or 0

    # 5-day FII trend
    fii_5d = sum((d.get("fii_net") or 0) for d in history)
    dii_5d = sum((d.get("dii_net") or 0) for d in history)

    # Determine bias
    bias = "NEUTRAL"
    confidence = "LOW"
    score_adj = 0
    reasoning_parts = []

    # Strong FII selling (>2000 Cr) — bearish
    if fii_today < -2000:
        bias = "BEARISH"
        confidence = "HIGH"
        score_adj = -1.5
        reasoning_parts.append(f"FIIs selling heavily today (Rs.{fii_today:,.0f} Cr)")
    elif fii_today < -1000:
        bias = "BEARISH"
        confidence = "MEDIUM"
        score_adj = -1.0
        reasoning_parts.append(f"FIIs net sellers today (Rs.{fii_today:,.0f} Cr)")
    elif fii_today > 2000:
        bias = "BULLISH"
        confidence = "HIGH"
        score_adj = +1.5
        reasoning_parts.append(f"FIIs buying aggressively today (+Rs.{fii_today:,.0f} Cr)")
    elif fii_today > 1000:
        bias = "BULLISH"
        confidence = "MEDIUM"
        score_adj = +1.0
        reasoning_parts.append(f"FIIs net buyers today (+Rs.{fii_today:,.0f} Cr)")

    # DII offset
    if bias == "BEARISH" and dii_today > abs(fii_today) * 0.7:
        # DIIs absorbing the FII selling
        bias = "MIXED"
        score_adj = score_adj * 0.5  # reduce penalty
        reasoning_parts.append(f"DIIs absorbing some selling (+Rs.{dii_today:,.0f} Cr)")
    elif bias == "BULLISH" and dii_today < -abs(fii_today) * 0.5:
        bias = "MIXED"
        score_adj = score_adj * 0.5
        reasoning_parts.append(f"But DIIs selling (Rs.{dii_today:,.0f} Cr)")

    # 5-day trend
    if fii_5d < -5000:
        reasoning_parts.append(f"FIIs sold Rs.{abs(fii_5d):,.0f} Cr over 5 days — sustained outflow")
        if bias == "NEUTRAL":
            bias = "BEARISH"
            confidence = "MEDIUM"
            score_adj = -0.5
    elif fii_5d > 5000:
        reasoning_parts.append(f"FIIs bought Rs.{fii_5d:,.0f} Cr over 5 days — sustained inflow")
        if bias == "NEUTRAL":
            bias = "BULLISH"
            confidence = "MEDIUM"
            score_adj = +0.5

    if not reasoning_parts:
        reasoning_parts.append("FII/DII flows are neutral today")

    return {
        "bias": bias,
        "confidence": confidence,
        "score_adjustment": round(score_adj, 2),
        "reasoning": ". ".join(reasoning_parts),
        "today_fii_net": round(fii_today, 0),
        "today_dii_net": round(dii_today, 0),
        "fii_5d_net": round(fii_5d, 0),
        "dii_5d_net": round(dii_5d, 0),
        "data_date": today.get("date"),
    }
