"""FII/DII API — daily institutional flow tracker."""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from backend.fii_dii import (
    get_today_data,
    get_recent_history,
    get_market_bias,
    manual_entry,
    get_data_for_date,
)

router = APIRouter(prefix="/api/fii-dii", tags=["fii-dii"])


class ManualEntryRequest(BaseModel):
    date: str  # YYYY-MM-DD
    fii_net: float  # Rs. Crores (negative = selling)
    dii_net: float
    fii_buy: float | None = None
    fii_sell: float | None = None
    dii_buy: float | None = None
    dii_sell: float | None = None


@router.get("/today")
def today(force_refresh: bool = Query(False, description="Bypass cache and re-fetch")):
    """Get today's FII/DII data (cached for 1 hour, refresh fetches new)."""
    data = get_today_data(force_refresh=force_refresh)
    if not data:
        return {"ok": False, "error": "Could not fetch FII/DII data — try again later or enter manually"}
    return {"ok": True, **data}


@router.get("/history")
def history(days: int = Query(10, ge=1, le=60)):
    """Get FII/DII history for the last N days."""
    return {"history": get_recent_history(days)}


@router.get("/bias")
def bias():
    """Get current market bias based on FII/DII flows.

    Used by the recommendation engine to adjust signal scores.
    """
    return get_market_bias()


@router.post("/manual")
def add_manual_entry(req: ManualEntryRequest):
    """Manually enter FII/DII data (used when scraping fails)."""
    return manual_entry(
        date_str=req.date,
        fii_net=req.fii_net,
        dii_net=req.dii_net,
        fii_buy=req.fii_buy,
        fii_sell=req.fii_sell,
        dii_buy=req.dii_buy,
        dii_sell=req.dii_sell,
    )


@router.get("/{date}")
def get_for_date(date: str):
    """Get FII/DII data for a specific date (YYYY-MM-DD)."""
    data = get_data_for_date(date)
    if not data:
        return {"ok": False, "error": f"No data for {date}"}
    return {"ok": True, **data}
