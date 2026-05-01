"""Calendar API — earnings + economic events."""

from fastapi import APIRouter, Query
from datetime import date, timedelta, datetime
from backend.calendar_data import (
    get_today_events,
    get_upcoming_events,
    get_event_filter_for_ticker,
    refresh_earnings_calendar,
    get_market_events_in_range,
    get_earnings_in_range,
)
from backend.scanner import UNIVERSES

router = APIRouter(prefix="/api/calendar", tags=["calendar"])


@router.get("/today")
def today_events():
    """Get all events happening today (RBI, Budget, Fed, expiry, earnings)."""
    today = date.today()
    market = get_market_events_in_range(today, today)
    earnings = get_earnings_in_range(today, today)
    return {
        "date": today.strftime("%Y-%m-%d"),
        "market_events": market,
        "earnings": earnings,
        "total": len(market) + len(earnings),
    }


@router.get("/upcoming")
def upcoming(days: int = Query(7, ge=1, le=60)):
    """Get all events in the next N days."""
    return get_upcoming_events(days)


@router.get("/ticker/{ticker}")
def for_ticker(ticker: str, days: int = Query(2, ge=1, le=14)):
    """Check if a ticker has events that should affect a trade decision."""
    return get_event_filter_for_ticker(ticker, days)


@router.post("/refresh-earnings")
def refresh(universe: str = Query("nifty100")):
    """Refresh earnings calendar for all stocks in a universe (slow, run weekly)."""
    tickers = UNIVERSES.get(universe, [])
    return refresh_earnings_calendar(tickers)


@router.get("/market-events")
def market_events_in_range(
    start: str = Query(..., description="Start date YYYY-MM-DD"),
    end: str = Query(..., description="End date YYYY-MM-DD"),
):
    """Get market-wide events between two dates."""
    try:
        start_d = datetime.strptime(start, "%Y-%m-%d").date()
        end_d = datetime.strptime(end, "%Y-%m-%d").date()
    except Exception as e:
        return {"error": f"Invalid date: {e}"}
    return {"events": get_market_events_in_range(start_d, end_d)}
