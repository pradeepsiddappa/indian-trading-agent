"""Shadow trades API — counterfactual tracking of every STRONG BUY / HIGH-conf BUY
the recommender produces, regardless of whether the user clicked Track."""

from fastapi import APIRouter

from backend.shadow_trades import (
    list_shadow_trades,
    refresh_shadow_prices,
    shadow_vs_user_comparison,
)

router = APIRouter(prefix="/api/shadow-trades", tags=["shadow-trades"])


@router.get("/")
def list_all(window_days: int = 90, only_ripe: bool = False):
    """All shadow trades in the lookback window with their ripe P&L."""
    trades = list_shadow_trades(window_days=window_days, only_ripe=only_ripe)
    return {"window_days": window_days, "count": len(trades), "trades": trades}


@router.get("/comparison")
def comparison(window_days: int = 90):
    """Shadow win-rate vs user-tracked win-rate (false-negative detector)."""
    return shadow_vs_user_comparison(window_days=window_days)


@router.post("/refresh")
def refresh():
    """Backfill 1/3/5/10-day prices + P&L for shadow trades."""
    return refresh_shadow_prices()
