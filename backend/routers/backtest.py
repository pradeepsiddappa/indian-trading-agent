"""Backtest endpoints — run historical backtests with P&L tracking."""

import os
import uuid
import threading
import asyncio
from datetime import datetime
from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, field_validator, model_validator
from typing import Optional
from backend.ws import manager
from backend.db import (
    save_backtest_run,
    save_backtest_trade,
    get_backtest_run,
    get_backtest_trades,
    get_backtest_history,
)
from backend.backtest_engine import run_backtest, get_trading_dates
from tradingagents.utils.ticker import normalize_ticker
from tradingagents.default_config import DEFAULT_CONFIG

router = APIRouter(prefix="/api/backtest", tags=["backtest"])

# Every backtest date is a full paid AI analysis (roughly Rs.15-60 each), so a
# mistyped range must not be able to turn into thousands of LLM runs.
DEFAULT_MAX_BACKTEST_DATES = 60
MAX_BACKTEST_SPAN_DAYS = 20 * 366
_backtest_slot = threading.BoundedSemaphore(1)


def max_backtest_dates() -> int:
    try:
        return max(1, int(os.getenv("TRADINGAGENTS_MAX_BACKTEST_DATES", DEFAULT_MAX_BACKTEST_DATES)))
    except ValueError:
        return DEFAULT_MAX_BACKTEST_DATES


class BacktestRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=40)
    start_date: str
    end_date: str
    interval_days: int = Field(5, ge=1, le=365)
    initial_capital: float = Field(100000, gt=0)
    position_size_pct: float = Field(10, gt=0, le=100)
    enable_learning: bool = False

    @field_validator("start_date", "end_date")
    @classmethod
    def _iso_date(cls, value: str) -> str:
        datetime.strptime(value, "%Y-%m-%d")
        return value

    @model_validator(mode="after")
    def _ordered_range(self):
        start = datetime.strptime(self.start_date, "%Y-%m-%d")
        end = datetime.strptime(self.end_date, "%Y-%m-%d")
        if end < start:
            raise ValueError("end_date must be on or after start_date")
        if (end - start).days > MAX_BACKTEST_SPAN_DAYS:
            raise ValueError("A backtest can't span more than 20 years")
        return self


def _run_backtest_thread(backtest_id: str, req: BacktestRequest, dates: list[str]):
    """Run one backtest, then free the single backtest slot."""
    try:
        _execute_backtest(backtest_id, req, dates)
    finally:
        _backtest_slot.release()


def _execute_backtest(backtest_id: str, req: BacktestRequest, dates: list[str]):
    """Run backtest in a background thread, streaming progress via WebSocket."""
    loop = asyncio.new_event_loop()
    ticker = normalize_ticker(req.ticker)

    if not dates:
        loop.run_until_complete(manager.send_event(backtest_id, {
            "type": "error", "message": "No trading dates found in the given range",
        }))
        loop.close()
        return

    # Save initial run
    save_backtest_run(backtest_id, {
        "ticker": ticker,
        "initial_capital": req.initial_capital,
        "position_size_pct": req.position_size_pct,
        "enable_learning": req.enable_learning,
        "status": "running",
    })

    loop.run_until_complete(manager.send_event(backtest_id, {
        "type": "status",
        "message": f"Starting backtest: {ticker} | {len(dates)} dates | ₹{req.initial_capital:,.0f} capital",
        "total_dates": len(dates),
    }))

    config = DEFAULT_CONFIG.copy()

    def on_trade(trade):
        save_backtest_trade(backtest_id, trade)
        loop.run_until_complete(manager.send_event(backtest_id, {
            "type": "trade",
            **trade,
        }))

    def on_status(msg):
        loop.run_until_complete(manager.send_event(backtest_id, {
            "type": "status", "message": msg,
        }))

    try:
        summary, trades = run_backtest(
            ticker=req.ticker,
            dates=dates,
            initial_capital=req.initial_capital,
            position_size_pct=req.position_size_pct,
            enable_learning=req.enable_learning,
            config=config,
            on_trade_complete=on_trade,
            on_status=on_status,
        )

        # Update run with final stats
        save_backtest_run(backtest_id, summary)

        loop.run_until_complete(manager.send_event(backtest_id, {
            "type": "complete",
            **summary,
        }))

    except Exception as e:
        save_backtest_run(backtest_id, {
            "ticker": ticker,
            "initial_capital": req.initial_capital,
            "position_size_pct": req.position_size_pct,
            "enable_learning": req.enable_learning,
            "status": "error",
        })
        loop.run_until_complete(manager.send_event(backtest_id, {
            "type": "error", "message": str(e),
        }))
    finally:
        loop.close()


@router.post("/run")
def start_backtest(req: BacktestRequest):
    """Start a backtest. Returns backtest_id for WebSocket streaming."""
    ticker = normalize_ticker(req.ticker)
    dates = get_trading_dates(req.start_date, req.end_date, req.interval_days)
    limit = max_backtest_dates()
    if len(dates) > limit:
        raise HTTPException(
            status_code=400,
            detail=(
                f"This backtest would run {len(dates)} paid AI analyses; the limit is {limit}. "
                "Shorten the date range or increase the interval "
                "(or set TRADINGAGENTS_MAX_BACKTEST_DATES)."
            ),
        )
    if not _backtest_slot.acquire(blocking=False):
        raise HTTPException(status_code=409, detail="Another AI backtest is still running. Wait for it to finish.")

    backtest_id = str(uuid.uuid4())[:8]
    thread = threading.Thread(
        target=_run_backtest_thread,
        args=(backtest_id, req, dates),
        daemon=True,
    )
    try:
        thread.start()
    except Exception:
        _backtest_slot.release()
        raise

    return {
        "backtest_id": backtest_id,
        "status": "started",
        "ticker": ticker,
        "total_dates": len(dates),
        "dates": dates,
    }


@router.websocket("/ws/{backtest_id}")
async def backtest_websocket(websocket: WebSocket, backtest_id: str):
    """WebSocket for streaming backtest progress."""
    await manager.connect(websocket, backtest_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, backtest_id)


@router.get("/{backtest_id}")
def get_backtest_result(backtest_id: str):
    """Get backtest results."""
    run = get_backtest_run(backtest_id)
    if not run:
        return {"error": "Backtest not found"}

    trades = get_backtest_trades(backtest_id)
    return {**run, "trades": trades}


@router.get("/history/list")
def list_backtests(limit: int = 20):
    """List past backtest runs."""
    return get_backtest_history(limit)
