"""FastAPI application for the Indian Market Trading Agent."""

import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"), override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from backend.db import ensure_db
from backend.routers import market_data, analysis, watchlist, backtest, strategies, scanner, performance, recommender, settings as settings_router, news as news_router, simulation as simulation_router, insights as insights_router, fii_dii as fii_dii_router, calendar as calendar_router, concentration as concentration_router
from backend.settings_manager import load_api_keys_into_env, apply_llm_config_to_default


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_db()
    # Load API keys from DB (UI takes priority over .env)
    load_api_keys_into_env()
    # Apply saved LLM config to DEFAULT_CONFIG
    apply_llm_config_to_default()
    yield


app = FastAPI(
    title="Indian Market Trading Agent",
    description="AI-powered short-term trading decisions for NSE/BSE",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(market_data.router)
app.include_router(analysis.router)
app.include_router(watchlist.router)
app.include_router(backtest.router)
app.include_router(strategies.router)
app.include_router(scanner.router)
app.include_router(performance.router)
app.include_router(recommender.router)
app.include_router(settings_router.router)
app.include_router(news_router.router)
app.include_router(simulation_router.router)
app.include_router(insights_router.router)
app.include_router(fii_dii_router.router)
app.include_router(calendar_router.router)
app.include_router(concentration_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "indian-trading-agent"}


@app.get("/api/config")
def get_config():
    from tradingagents.default_config import DEFAULT_CONFIG
    safe_keys = [
        "llm_provider", "deep_think_llm", "quick_think_llm",
        "market", "default_exchange", "trading_style",
        "max_debate_rounds", "max_risk_discuss_rounds",
        "dry_run", "order_execution_enabled",
        "max_position_value", "max_loss_per_trade", "max_daily_loss",
        "max_open_positions",
    ]
    return {k: DEFAULT_CONFIG.get(k) for k in safe_keys}
