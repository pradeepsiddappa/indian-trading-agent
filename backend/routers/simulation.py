"""Simulation API — paper trading + historical recommender backtest."""

from fastapi import APIRouter, Query
from pydantic import BaseModel
from backend.simulation import (
    open_paper_trade,
    refresh_paper_trade_prices,
    paper_trading_stats,
    run_recommender_backtest,
)
from backend.db import (
    list_paper_trades,
    update_paper_trade_status,
    delete_paper_trade,
    get_recommender_backtest,
    list_recommender_backtest_runs,
)

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


class OpenTradeRequest(BaseModel):
    ticker: str
    source: str = "manual"
    strategy: str | None = None
    signal: str | None = None
    score: float | None = None
    confidence: str | None = None
    success_probability: int | None = None
    triggered_signals: list[dict] | None = None
    notes: str | None = None


@router.post("/paper-trade")
def open_trade(req: OpenTradeRequest):
    """Open a virtual paper trade at current market price."""
    return open_paper_trade(
        ticker=req.ticker,
        source=req.source,
        strategy=req.strategy,
        signal=req.signal,
        score=req.score,
        confidence=req.confidence,
        success_probability=req.success_probability,
        triggered_signals=req.triggered_signals,
        notes=req.notes,
    )


@router.get("/paper-trades")
def list_trades(status: str | None = Query(None, description="active | expired | manually_closed")):
    """List paper trades (optionally filter by status)."""
    trades = list_paper_trades(status=status)
    return {"trades": trades, "count": len(trades)}


@router.post("/paper-trades/refresh")
def refresh_prices():
    """Re-fetch current prices for all active paper trades and compute P&L."""
    return refresh_paper_trade_prices()


@router.get("/paper-trades/stats")
def get_stats():
    """Get aggregate stats across all paper trades."""
    return paper_trading_stats()


@router.delete("/paper-trades/{trade_id}")
def delete_trade(trade_id: int):
    delete_paper_trade(trade_id)
    return {"status": "deleted"}


@router.put("/paper-trades/{trade_id}/close")
def close_trade(trade_id: int):
    update_paper_trade_status(trade_id, "manually_closed")
    return {"status": "closed"}


# --- Recommender Historical Backtest ---

@router.post("/recommender-backtest")
def run_backtest(
    universe: str = Query("nifty50"),
    start_date: str | None = Query(None),
    end_date: str | None = Query(None),
    interval_days: int = Query(5),
):
    """Run recommendation engine on historical dates and measure actual outcomes. FREE."""
    return run_recommender_backtest(
        universe=universe,
        start_date=start_date,
        end_date=end_date,
        interval_days=interval_days,
    )


@router.get("/recommender-backtest/{run_id}")
def get_backtest(run_id: str):
    """Get detailed results from a specific backtest run."""
    rows = get_recommender_backtest(run_id)
    return {"run_id": run_id, "rows": rows, "count": len(rows)}


@router.get("/recommender-backtest-history")
def list_backtests():
    """List all historical backtest runs."""
    return list_recommender_backtest_runs()
