"""Institutional Tracker API Router."""

from fastapi import APIRouter, HTTPException, Query
from backend.institutional_tracker import (
    fetch_block_deals,
    fetch_promoter_activity,
    get_delivery_stats,
    get_institutional_summary,
)

router = APIRouter(prefix="/api/institutional", tags=["Institutional Tracker"])


@get_router_summary := router.get("/summary")
def get_summary():
    """Get combined FII/DII, Bulk Deals, and Promoter activity summary."""
    try:
        return get_institutional_summary()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@get_router_bulk_deals := router.get("/bulk-deals")
def get_bulk_deals():
    """Fetch recent Bulk and Block deals."""
    try:
        return {"deals": fetch_block_deals()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@get_router_promoter := router.get("/promoter-activity")
def get_promoter():
    """Fetch recent Promoter and Insider transactions."""
    try:
        return {"activity": fetch_promoter_activity()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@get_router_delivery := router.get("/delivery/{ticker}")
def get_delivery(ticker: str):
    """Fetch Delivery % and Accumulation stats for a stock ticker."""
    try:
        return get_delivery_stats(ticker)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
