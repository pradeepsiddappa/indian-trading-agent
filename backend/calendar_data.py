"""Earnings + Economic Calendar.

Tracks upcoming events that materially impact Indian markets:

1. Stock-specific:
   - Earnings reports (per ticker via yfinance)
   - Ex-dividend dates
   - Corporate actions (splits, bonuses)

2. Market-wide:
   - RBI Monetary Policy Committee meetings
   - Union Budget
   - GST Council meetings
   - US Fed FOMC meetings (impacts Indian markets via global cues)
   - Major data releases (CPI, GDP)

The recommendation engine uses this to:
- Skip recommending stocks with earnings in next 2 days
- Reduce confidence on RBI policy mornings
- Flag risky entries before major data releases
"""

import yfinance as yf
from datetime import datetime, date, timedelta
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed
from backend.db import get_db
from tradingagents.utils.ticker import normalize_ticker


# ============================================================
# MARKET-WIDE EVENTS (hardcoded — published by central banks/govt a year ahead)
# ============================================================

# RBI Monetary Policy Committee meeting dates (announcement day)
# Source: RBI website annual MPC schedule
RBI_POLICY_DATES = [
    # 2025
    "2025-02-07", "2025-04-09", "2025-06-06", "2025-08-08", "2025-10-09", "2025-12-05",
    # 2026 (estimates based on typical bi-monthly schedule)
    "2026-02-06", "2026-04-09", "2026-06-05", "2026-08-07", "2026-10-08", "2026-12-04",
]

# Union Budget — always Feb 1
UNION_BUDGET_DATES = [
    "2025-02-01", "2026-02-01", "2027-02-01",
]

# US Fed FOMC meeting dates (impacts Indian markets significantly)
FED_FOMC_DATES = [
    # 2025
    "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30",
    "2025-09-17", "2025-10-29", "2025-12-10",
    # 2026 (estimated)
    "2026-01-28", "2026-03-18", "2026-05-06", "2026-06-17", "2026-07-29",
    "2026-09-16", "2026-10-28", "2026-12-09",
]

# Index expiry days (last Thursday of each month for monthly NIFTY/BANKNIFTY F&O)
# These cause unusual volatility; system should be cautious
def get_monthly_expiry_dates(year: int) -> list[str]:
    """Generate last Thursday of each month for a given year."""
    dates = []
    for month in range(1, 13):
        # Find last Thursday
        if month == 12:
            next_month = date(year + 1, 1, 1)
        else:
            next_month = date(year, month + 1, 1)
        d = next_month - timedelta(days=1)
        # Roll back to Thursday
        while d.weekday() != 3:
            d -= timedelta(days=1)
        dates.append(d.strftime("%Y-%m-%d"))
    return dates


def get_market_events_in_range(start_date: date, end_date: date) -> list[dict]:
    """Get all market-wide events between two dates."""
    events = []

    def in_range(date_str: str) -> bool:
        try:
            d = datetime.strptime(date_str, "%Y-%m-%d").date()
            return start_date <= d <= end_date
        except Exception:
            return False

    for d in RBI_POLICY_DATES:
        if in_range(d):
            events.append({
                "date": d,
                "type": "RBI_POLICY",
                "name": "RBI Monetary Policy Decision",
                "impact": "HIGH",
                "category": "central_bank",
                "description": "Rate decision and policy outlook. Bank stocks especially volatile. Avoid new positions in financials before announcement.",
            })

    for d in UNION_BUDGET_DATES:
        if in_range(d):
            events.append({
                "date": d,
                "type": "BUDGET",
                "name": "Union Budget",
                "impact": "VERY_HIGH",
                "category": "fiscal",
                "description": "Annual budget — sectoral implications across all stocks. Markets typically volatile for 2-3 days before and after.",
            })

    for d in FED_FOMC_DATES:
        if in_range(d):
            events.append({
                "date": d,
                "type": "FOMC",
                "name": "US Fed FOMC Meeting",
                "impact": "HIGH",
                "category": "global",
                "description": "US rate decision impacts Indian markets via global flows and INR. IT and exporters especially affected.",
            })

    # F&O expiry days (within range)
    for year in range(start_date.year, end_date.year + 1):
        for d in get_monthly_expiry_dates(year):
            if in_range(d):
                events.append({
                    "date": d,
                    "type": "FNO_EXPIRY",
                    "name": "Monthly F&O Expiry",
                    "impact": "MEDIUM",
                    "category": "derivatives",
                    "description": "Last Thursday — heavy volatility, unusual price action. Avoid swing entries; intraday only.",
                })

    events.sort(key=lambda x: x["date"])
    return events


# ============================================================
# STOCK-SPECIFIC EVENTS (earnings via yfinance)
# ============================================================

def _ensure_table():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS earnings_calendar (
                ticker TEXT NOT NULL,
                event_date TEXT NOT NULL,
                event_type TEXT DEFAULT 'earnings',
                description TEXT,
                fetched_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (ticker, event_date, event_type)
            )
        """)


def fetch_earnings_for_ticker(ticker: str) -> Optional[dict]:
    """Fetch next earnings date for a ticker via yfinance."""
    try:
        symbol = normalize_ticker(ticker)
        t = yf.Ticker(symbol)
        cal = t.calendar
        if not cal or not isinstance(cal, dict):
            return None

        earnings_date = cal.get("Earnings Date")
        if not earnings_date:
            return None

        # earnings_date is a list of dates (range)
        if isinstance(earnings_date, list):
            earnings_date = earnings_date[0] if earnings_date else None

        if not earnings_date:
            return None

        # Convert to string
        if hasattr(earnings_date, "strftime"):
            date_str = earnings_date.strftime("%Y-%m-%d")
        else:
            date_str = str(earnings_date)[:10]

        return {
            "ticker": ticker.upper(),
            "event_date": date_str,
            "event_type": "earnings",
            "description": f"{ticker.upper()} earnings report",
        }
    except Exception:
        return None


def refresh_earnings_calendar(tickers: list[str]) -> dict:
    """Fetch earnings dates for multiple tickers in parallel and cache in DB."""
    _ensure_table()
    fetched = []

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(fetch_earnings_for_ticker, t): t for t in tickers}
        for f in as_completed(futures):
            result = f.result()
            if result:
                fetched.append(result)

    # Save to DB
    with get_db() as conn:
        for e in fetched:
            try:
                conn.execute(
                    """INSERT OR REPLACE INTO earnings_calendar
                    (ticker, event_date, event_type, description, fetched_at)
                    VALUES (?, ?, ?, ?, datetime('now'))""",
                    (e["ticker"], e["event_date"], e["event_type"], e["description"]),
                )
            except Exception:
                pass

    return {"fetched": len(fetched), "tickers_checked": len(tickers)}


def get_earnings_in_range(start_date: date, end_date: date,
                          tickers: list[str] | None = None) -> list[dict]:
    """Get earnings events in a date range, optionally filtered by tickers."""
    _ensure_table()
    with get_db() as conn:
        if tickers:
            placeholders = ",".join("?" * len(tickers))
            rows = conn.execute(
                f"""SELECT * FROM earnings_calendar
                    WHERE event_date >= ? AND event_date <= ?
                    AND ticker IN ({placeholders})
                    ORDER BY event_date""",
                (start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d"), *[t.upper() for t in tickers]),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM earnings_calendar
                   WHERE event_date >= ? AND event_date <= ?
                   ORDER BY event_date""",
                (start_date.strftime("%Y-%m-%d"), end_date.strftime("%Y-%m-%d")),
            ).fetchall()
        return [dict(r) for r in rows]


def get_next_earnings_date(ticker: str) -> Optional[str]:
    """Get the next upcoming earnings date for a ticker (cached or fresh)."""
    _ensure_table()
    today = date.today().strftime("%Y-%m-%d")
    with get_db() as conn:
        row = conn.execute(
            """SELECT event_date FROM earnings_calendar
               WHERE ticker = ? AND event_date >= ? AND event_type = 'earnings'
               ORDER BY event_date LIMIT 1""",
            (ticker.upper(), today),
        ).fetchone()
        if row:
            return row["event_date"]

    # Try to fetch fresh
    result = fetch_earnings_for_ticker(ticker)
    if result and result["event_date"] >= today:
        with get_db() as conn:
            conn.execute(
                """INSERT OR REPLACE INTO earnings_calendar
                (ticker, event_date, event_type, description, fetched_at)
                VALUES (?, ?, ?, ?, datetime('now'))""",
                (result["ticker"], result["event_date"], result["event_type"], result["description"]),
            )
        return result["event_date"]
    return None


# ============================================================
# COMBINED VIEW: Today + Upcoming
# ============================================================

def get_today_events() -> list[dict]:
    """Get all events happening today."""
    today = date.today()
    return get_market_events_in_range(today, today)


def get_upcoming_events(days_ahead: int = 7) -> dict:
    """Get all events in next N days, separated by type."""
    today = date.today()
    end = today + timedelta(days=days_ahead)

    market_events = get_market_events_in_range(today, end)
    earnings = get_earnings_in_range(today, end)

    return {
        "from_date": today.strftime("%Y-%m-%d"),
        "to_date": end.strftime("%Y-%m-%d"),
        "market_events": market_events,
        "earnings": earnings,
        "total": len(market_events) + len(earnings),
    }


# ============================================================
# RECOMMENDER INTEGRATION: Check if a stock has imminent events
# ============================================================

def get_event_filter_for_ticker(ticker: str, days_ahead: int = 2) -> dict:
    """Check if a ticker has events in the next N days that should affect trading.

    Returns:
        {
            "has_event": bool,
            "score_adjustment": float (negative for risky events),
            "events": list of event dicts,
            "warning": str (human-readable warning)
        }
    """
    today = date.today()
    end = today + timedelta(days=days_ahead)

    warnings = []
    score_adj = 0.0
    events_found = []

    # Check stock-specific earnings
    earnings = get_earnings_in_range(today, end, tickers=[ticker])
    for e in earnings:
        e_date = datetime.strptime(e["event_date"], "%Y-%m-%d").date()
        days_until = (e_date - today).days
        if days_until <= 2:
            warnings.append(f"Earnings in {days_until} day{'s' if days_until != 1 else ''}")
            score_adj -= 2.5  # Strong penalty — earnings are a coinflip
            events_found.append({**e, "days_until": days_until})

    # Check market-wide events
    market = get_market_events_in_range(today, end)
    for e in market:
        e_date = datetime.strptime(e["date"], "%Y-%m-%d").date()
        days_until = (e_date - today).days

        if e["type"] == "BUDGET" and days_until <= 1:
            warnings.append(f"Budget in {days_until} day(s) — extreme volatility")
            score_adj -= 2.0
            events_found.append({**e, "days_until": days_until})
        elif e["type"] == "RBI_POLICY" and days_until == 0:
            warnings.append("RBI policy decision today")
            score_adj -= 1.5
            events_found.append({**e, "days_until": days_until})
        elif e["type"] == "FOMC" and days_until == 0:
            warnings.append("Fed FOMC decision today")
            score_adj -= 1.0
            events_found.append({**e, "days_until": days_until})
        elif e["type"] == "FNO_EXPIRY" and days_until == 0:
            warnings.append("F&O expiry today — high volatility")
            score_adj -= 0.5
            events_found.append({**e, "days_until": days_until})

    return {
        "has_event": len(events_found) > 0,
        "score_adjustment": round(score_adj, 2),
        "events": events_found,
        "warning": " · ".join(warnings) if warnings else None,
    }
