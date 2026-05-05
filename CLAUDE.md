# Indian Market Trading Agent

AI-powered multi-agent trading decision system for Indian markets (NSE/BSE).
Built on [TradingAgents](https://github.com/TauricResearch/TradingAgents) framework with LangGraph.

## Architecture

```
frontend/ (Next.js 16 + Tailwind + shadcn/ui + Open Sans)  :3000
    |
backend/ (FastAPI + WebSocket)                             :8000
    |
tradingagents/ (LangGraph multi-agent pipeline)
    |
yfinance + RSS feeds (NSE/BSE data + news)
```

## Quick Start

```bash
# 1. Install Python deps
python3 -m venv venv && source venv/bin/activate
pip install -e .
pip install fastapi uvicorn websockets aiosqlite numpy feedparser

# 2. Configure API keys (2 options)
# Option A: via .env
echo 'ANTHROPIC_API_KEY=your_key' > .env
# Option B: via Settings page in the UI (stored in SQLite, takes priority)

# 3. Start backend
uvicorn backend.app:app --reload --port 8000

# 4. Start frontend (separate terminal)
cd frontend && npm install && npm run dev

# 5. Open http://localhost:3000
```

## Information Architecture

The UI is organized by daily workflow (not by technical feature):

```
🏠 Today              — Daily starting page with auto-loaded top picks + workflow guide

DISCOVER
  ✨ Top Picks         — AI-free unified recommendation engine (combines all signals)
  📡 Market Scan       — Gap / Volume / Breakout scanner
  🎯 Strategies        — S/R, Pivot Points, Cyclical Patterns (seasonality, sector rotation)
  📰 News Feed         — Aggregated Indian market news (RSS + yfinance, customizable)

ANALYZE
  🔍 Deep Analysis     — AI-powered 10-agent pipeline (paid ~Rs.15-60)
  📊 Charts            — Candlestick charts with volume

VALIDATE
  🏆 Performance       — Historical win rate of each strategy (FREE)
  🧪 Simulation        — Paper trading + historical recommender backtest (FREE)
  🧠 Learning Insights — Pattern analysis of YOUR past trades (FREE, no ML)
  📈 Signal Performance — Per-signal win rate + auto-tune recommender (FREE)
  🎯 Verdict Calibration — Is the daily verdict actually predictive? (FREE)
  🔬 AI Backtest       — Run AI pipeline on past dates (paid)
  📋 My Trades         — History with P&L tracking + "Teach the agent" reflection

⚙️ Settings           — API keys (UI), LLM provider switcher, model selection, cost guide
```

## Features

### FREE Features (no API cost)
- **Top Picks / Recommendations** — Combines 10+ signals (gap, volume, breakout, S/R, RSI, cyclical, trend) into ranked trade ideas with success probability %
- **Market Scanner** — Finds stocks with gap up/down, volume spikes, 20-day breakouts
- **Support/Resistance** — S1-S3 / R1-R3 levels from historical price action + daily Pivot Points
- **Cyclical Patterns** — Monthly seasonality, day-of-week patterns, sector rotation (9 sectors)
- **Seasonal Backtest** — "Buy in January, sell in March" strategy testing with pure price math
- **Performance Tracker** — Historical win rate of Gap/Volume/Breakout/S/R-Bounce strategies over 30/60/90 days
- **News Feed** — Aggregated from 7 Indian RSS sources (MoneyControl, ET, LiveMint, Business Standard, NDTV Profit) + yfinance search queries. Fully customizable (add/remove/edit sources).
- **Charts** — Interactive candlestick with volume (TradingView lightweight-charts)
- **Watchlist** — Persistent across sessions (SQLite)
- **Workflow Guide** — 3-step visual guide on Dashboard

### Paid Features (AI API cost)
- **Deep Analysis** — Full 10-agent pipeline with customization:
  - **Analyst selection** — pick Market/Social/News/Fundamentals (min 1)
  - **Research depth** — Shallow (1 round) / Medium (2) / Deep (3)
  - **Output language** — English / Hindi
  - **Live cost estimate** before you run
  - **Stats tracking** — exact tokens, LLM calls, cost in Rs./USD after completion
  - Per-model breakdown of token usage
  - Cost: ~Rs.8-70 depending on config (Haiku+Sonnet mix)
- **AI Backtest** — Runs Deep Analysis on past dates with P&L tracking + optional learning

### Agent Learning System
- **Memory persistence** — All 5 agent memories (Bull, Bear, Trader, Judge, Portfolio Manager) auto-save to `~/.tradingagents/memory/*.json`
- **Auto-load** on every backend startup
- **Reflect & Remember from History** — After a trade closes, click "Log P&L" on the trade:
  - Enter entry/exit prices → calculates P&L
  - Optional "Teach the agent" checkbox → runs reflection
  - 5 agents reflect on what went right/wrong
  - Lessons added to memory, used in future analyses
  - Shows "Agent Memory: N lessons learned" badge on History page
- **Important**: The LLM itself is NOT fine-tuned — memory is keyword-retrieved via BM25 and injected into future prompts as context

### Paper Trading Simulation (FREE)
- **Paper Trades** — Click "Track" on any Top Pick or Recommendation → opens virtual position at current market price
- **Multi-horizon tracking** — auto-fetches actual prices at 1/3/5/10 trading days later
- **Captures full context** — source (recommendation/scanner/manual), strategy name, triggered signals, confidence, score
- **Performance by Strategy** — compare win rates across sources (e.g., Recommendations vs Manual vs AI Analysis)
- **Historical Recommender Backtest** — replay recommendation engine on past 60 days, measure actual 5-day outcomes
  - Validates engine quality before risking real money
  - FREE (pure price math, no AI API calls)
  - Persists to `recommender_backtests` table so you can re-view past runs

### Learning Insights (FREE, no ML)
- **Pattern analysis** of all closed trades (paper + real with logged P&L)
- 7 insight categories:
  - Signal Type (STRONG BUY vs BUY vs SELL win rates)
  - Confidence Level (are HIGH picks actually better?)
  - Strategy (which source performs best for you)
  - Seasonality (which months you trade well)
  - Ticker (which stocks you read well/poorly)
  - Indicator (which specific signals work for your style)
  - Direction (long vs short bias)
- Classifies each insight: Strong edge / Works / Average / Marginal / Avoid
- Generates specific actionable tips per insight
- Minimum 3 closed trades required; best with 20+
- **Purpose**: helps YOU learn to filter the agent's output, not train the agent itself

### Settings Management (UI-based)
- **API Keys** — Store multiple provider keys in local SQLite (priority over .env)
  - Supports Anthropic, OpenAI, Google, xAI, DeepSeek, Qwen
  - Masked display (shows only last 4 chars)
  - Test button to verify keys work
  - Delete button (falls back to .env if set)
- **LLM Provider** — Switch between providers from UI
- **Model Selection** — Pick deep-think and quick-think models per provider
- **News Sources** — Enable/disable RSS feeds, add custom URLs, edit search queries
- **API Cost Guide** — Compares costs across providers

## Project Structure

### `tradingagents/` — Core AI Pipeline
- **agents/analysts/** — Market, News, Social, Fundamentals analysts (tool-calling agents)
- **agents/researchers/** — Bull & Bear researchers (debate agents)
- **agents/managers/** — Research Manager (debate judge) + Portfolio Manager (final decision)
- **agents/trader/** — Trader (converts plan to transaction proposal)
- **agents/risk_mgmt/** — Aggressive, Conservative, Neutral risk debaters
- **agents/utils/memory.py** — BM25 memory with **disk persistence** (JSON per agent)
- **agents/utils/** — LangChain `@tool` definitions, agent states
- **dataflows/** — Vendor-abstracted data layer (`interface.py` routes to yfinance/alpha_vantage/nse)
- **graph/** — LangGraph orchestration: `setup.py`, `trading_graph.py`, `propagation.py`, `signal_processing.py`, `reflection.py`
- **llm_clients/** — Multi-provider LLM factory (Anthropic, OpenAI, Google, xAI, DeepSeek, Qwen, etc.)
- **utils/** — `ticker.py` (NSE/BSE normalization), `market_calendar.py` (IST hours, holidays)
- **default_config.py** — Default configuration

### `backend/` — FastAPI REST + WebSocket API
- **app.py** — FastAPI app with CORS, loads API keys from DB + applies LLM config at startup
- **db.py** — SQLite schema: watchlist, analysis_history (with P&L cols), backtest_runs, backtest_trades, settings, paper_trades, recommender_backtests
- **ws.py** — WebSocket connection manager
- **models.py** — Pydantic request/response models (includes analyst selection, depth, language)
- **settings_manager.py** — API key storage + LLM config management (DB priority over .env)
- **stats_callback.py** — LangChain callback to track tokens + cost per analysis (supports Anthropic/OpenAI/Google/Gemini model pricing)
- **scanner.py** — Market scanner engine (Gap / Volume / Breakout detection)
- **stock_list.py** — 200+ NSE stock ticker → company name mapping for typeahead search
- **recommender.py** — Unified recommendation engine (combines ALL signals with weights)
- **performance.py** — Historical strategy performance measurement
- **cyclical.py** — Monthly seasonality, day-of-week, sector rotation analysis
- **backtest_engine.py** — AI-based backtesting loop with P&L calculation (paid)
- **simulation.py** — Paper trading + historical recommender backtest (FREE)
- **insights.py** — Learning insights: pattern analysis across trade categories
- **news_sources.py** — RSS + yfinance aggregator, customizable feeds
- **routers/**
  - `analysis.py` — `POST /api/analysis/run` (with customization) + `WS /api/analysis/ws/{task_id}` (streams heartbeats + stats) + `PUT /{task_id}/pnl` (with reflect option) + `GET /memory/stats`
  - `market_data.py` — Quotes, charts, indicators, fundamentals, news, market status, stock search
  - `watchlist.py` — Watchlist CRUD
  - `strategies.py` — S/R, Pivot Points, Cyclical endpoints
  - `scanner.py` — Market scanner (synchronous)
  - `recommender.py` — Unified recommendations
  - `performance.py` — Strategy win rate measurement
  - `backtest.py` — AI-based backtest run + WebSocket streaming (paid)
  - `simulation.py` — Paper trade CRUD + refresh prices + historical recommender backtest (FREE)
  - `insights.py` — Learning insights (pattern analysis on past trades)
  - `settings.py` — API key CRUD + LLM provider management
  - `news.py` — News feed aggregator + custom source management

### `frontend/` — Next.js 16 Trading Terminal
- **Font**: Open Sans (via `next/font/google`)
- **Theme**: Light mode (default)
- **app/**
  - `layout.tsx` — Root layout with sidebar, Open Sans font
  - `page.tsx` — Dashboard (Today): greeting + market status + auto-loaded top picks + sector heatmap + workflow guide + watchlist + quick actions (incl. position size calc)
  - `recommendations/page.tsx` — Unified recommendation engine UI with "Track" button to open paper trades
  - `analysis/page.tsx` — Run AI analysis with customization panel, live heartbeat, stats card, position size calc
  - `analysis/[id]/page.tsx` — View past analysis
  - `scanner/page.tsx` — Market scanner with 3 tabs (Gap has UP/DOWN filter)
  - `strategies/page.tsx` — Strategy Hub (cards)
  - `strategies/support-resistance/page.tsx` — S/R + Pivot Points
  - `strategies/cyclical/page.tsx` — Cyclical patterns with insights, entry/exit windows, seasonal backtest
  - `performance/page.tsx` — Historical strategy win rates
  - `simulation/page.tsx` — Paper trading + historical recommender backtest (FREE)
  - `insights/page.tsx` — Learning insights (pattern analysis on your trades)
  - `backtest/page.tsx` — AI-based backtest with P&L tracking (paid)
  - `charts/page.tsx` — Candlestick charts
  - `history/page.tsx` — Past analyses with Open/Closed tabs, "Log P&L" button per row, agent memory badge
  - `settings/page.tsx` — API keys, LLM config, system config, cost guide
  - `news/page.tsx` — News Feed tab + Customize Sources tab
- **components/**
  - `layout/Sidebar.tsx` — Grouped navigation (Discover/Analyze/Validate) with hints
  - `dashboard/` — MarketOverview, Watchlist (with alerts), RecentAnalyses, TodayPicks (with Track button + watchlist match highlights), WorkflowGuide, QuickActions (incl. Position Calc), SectorHeatmap
  - `analysis/` — AgentProgress, ReportPanel (controlled tabs, auto-advance), DebateView, DecisionCard, AnalysisOptions (customization panel), StatsCard (token + cost display)
  - `history/PnLDialog.tsx` — P&L entry dialog with "Mark as Open" + "Teach the agent" checkbox
  - `settings/` — ApiKeysManager, LLMSettings
  - `TickerSearch.tsx` — Typeahead stock search (name → ticker)
  - `PositionSizeCalculator.tsx` — Standalone dialog: capital, risk %, entry/SL/target → shares + R:R
  - `HelpSection.tsx` — Collapsible FAQ on every page
  - `NextStep.tsx` — Workflow continuity buttons across pages
- **lib/**
  - `api.ts` — REST + WebSocket client (includes stats, news, memory endpoints)
  - `store.ts` — Zustand global store for analysis state (stats + heartbeat + survives page navigation)
  - `types.ts` — TypeScript types
  - `help-content.ts` — All help text centralized

## Agent Pipeline Flow

```
Market Analyst → Social Analyst → News Analyst → Fundamentals Analyst
    ↓  (any subset can be enabled/disabled via UI)
Bull Researcher ←→ Bear Researcher (debate, 1-3 rounds)
    ↓
Research Manager (judge: Buy/Sell/Hold + trading plan)
    ↓
Trader (entry/SL/target/position size/time horizon)
    ↓
Aggressive ←→ Conservative ←→ Neutral (risk debate, 1-3 rounds)
    ↓
Portfolio Manager (final: Strong Buy/Buy/Hold/Sell/Short)
    ↓
[Optional after trade closes]
Reflect & Remember → 5 agent memories updated with P&L outcome
```

## Configuration

Default config in `tradingagents/default_config.py`. Runtime overrides in SQLite (via Settings UI):

| Key | Default | Description |
|-----|---------|-------------|
| `llm_provider` | `anthropic` | LLM provider (switch via Settings) |
| `deep_think_llm` | `claude-sonnet-4-20250514` | Complex reasoning (2 agents) |
| `quick_think_llm` | `claude-haiku-4-5-20251001` | Fast tasks (13 agents) |
| `market` | `india` | Market region |
| `default_exchange` | `NSE` | Default exchange |
| `trading_style` | `short_term` | short_term / swing / positional |
| `max_debate_rounds` | `1` | Bull/bear debate iterations (overridable per request) |
| `output_language` | `English` | Report language (English/Hindi) |
| `data_vendors` | `yfinance` | Data source |
| `dry_run` | `True` | Order safety — never executes real orders |
| `memory_dir` | `~/.tradingagents/memory` | Where BM25 memories are persisted |

### Per-Analysis Overrides (from `/analysis` page)
- `analysts: list[str]` — subset of ["market", "social", "news", "fundamentals"]
- `max_debate_rounds: int` — 1 (Shallow), 2 (Medium), or 3 (Deep)
- `max_risk_discuss_rounds: int` — same as debate
- `output_language: str` — "English" or "Hindi"

## Cost & Performance

Actual costs measured by `StatsCallback` per analysis:

| Config | LLM Calls | Tokens | Est. Cost | Duration |
|--------|-----------|--------|-----------|----------|
| Minimal (Market only, Shallow, English) | ~6 | ~20K | ~Rs.8-12 | 1 min |
| Balanced (all 4 analysts, Shallow) | ~17 | ~200K | ~Rs.15-25 | 2-3 min |
| Full (all 4 analysts, Deep) | ~25 | ~400K | ~Rs.50-70 | 4-6 min |
| + Reflect after P&L | +5 | +15K | +Rs.5-10 | +30s |

## Data Layer

`dataflows/interface.py` routes all data calls through `route_to_vendor()`:

- **yfinance** (default) — Free, NSE with `.NS` suffix. OHLCV, fundamentals, news
- **alpha_vantage** — Alternative with API key, auto-fallback
- **nse** — FII/DII activity, bulk deals, delivery % (stubs)

Ticker normalization: `RELIANCE` → `RELIANCE.NS`, `NIFTY50` → `^NSEI`

### News Sources (configurable via `/news` page)
Default RSS feeds:
- MoneyControl (Top News + Business)
- Economic Times (Markets + IPO)
- LiveMint Markets
- Business Standard Markets
- NDTV Profit

Plus custom yfinance search queries (default: "Nifty Sensex", "RBI monetary policy", "FII DII activity", "India GDP inflation", "India rupee forex")

All configurable: enable/disable, add custom RSS URLs, edit queries.

## Recommendation Engine Scoring

The unified engine (`recommender.py`) uses weighted scoring:

**Bullish signals (add points):**
- Volume-confirmed breakout: +3.0 (best signal, 71% historical win rate)
- Volume spike bullish: +2.0
- Near major support: +2.0
- Gap filled (reversal): +1.5
- RSI oversold: +1.5
- Cyclical bullish month: +1.5
- Strong uptrend: +1.0

**Bearish signals (subtract points):**
- Breakdown below support: -2.5
- Volume spike bearish: -2.0
- Near major resistance: -1.5
- Cyclical bearish month: -1.5
- RSI overbought: -1.0
- Strong downtrend: -1.0
- Gap up/down unfilled: -0.5 (historical fade signal)

**Ratings:**
- Score ≥ +4: STRONG BUY
- Score +2 to +4: BUY
- Score -2 to -4: SELL
- Score ≤ -4: STRONG SELL

**Confidence:** based on aligned signal count (HIGH: 4+, MEDIUM: 2-3, LOW: 1)
**Success Probability:** 50% baseline + 4% per score point + 2% per aligned signal (capped 85%)

## Key Patterns

- **Agent creation**: `create_X(llm, memory?) → node_function(state) → dict`
- **Tool routing**: `@tool` wrappers call `route_to_vendor()`
- **State**: `AgentState` TypedDict with all reports, debate states, final decision
- **Memory**: BM25-based similarity matching with **disk persistence** (auto load/save)
- **Stats tracking**: `StatsCallback` extends `BaseCallbackHandler` to track tokens/cost across LangChain/LangGraph calls
- **Streaming**: Graph `stream_mode="values"` → WebSocket events with heartbeats + stats

## Safety

- `dry_run: True` by default — orders are logged, never executed
- `order_execution_enabled: False` — master switch
- Max position value, max loss per trade, max daily loss limits
- Stop-loss required for all trades
- Exchange whitelist (NSE only by default)

## Storage Paths

- SQLite DB: `~/.tradingagents/trading_agent.db` — tables:
  - `watchlist` — saved tickers
  - `analysis_history` — AI analyses with P&L columns
  - `backtest_runs` + `backtest_trades` — AI backtest runs
  - `paper_trades` — virtual trades with multi-horizon P&L + triggered_signals JSON
  - `recommender_backtests` — historical recommender engine replay results
  - `settings` — API keys + LLM config + news sources
- Agent memories: `~/.tradingagents/memory/{bull,bear,trader,invest_judge,portfolio_manager}_memory.json`
- Analysis logs: `~/.tradingagents/logs/` (per-analysis JSON state dumps)

## Data Flow Across Features

```
Recommendations (FREE)
    ↓ "Track" button
Paper Trades (FREE, tracks at 1/3/5/10 days)
    ↓ time passes + refresh prices
Simulation / Learning Insights (FREE)
    ↓ patterns surface
You filter better → take real trades
    ↓ "Log P&L" with reflection
Real trades + agent memory growth
    ↓
Learning Insights updates with combined data
```

## Smart Filters on Recommendations

### FII/DII Flow Bias (NEW)
- Live NSE data via `nsepython` (cached 1 hour in `fii_dii_history` table)
- `backend/fii_dii.py` — fetcher + manual entry fallback
- `get_market_bias()` returns score adjustment -1.5 to +1.5 based on FII/DII net values
- Recommender's `_apply_market_bias()` adjusts every stock score before classifying
- Dashboard shows banner: today's FII/DII net + 5-day trend + reasoning
- API: `/api/fii-dii/today`, `/history`, `/bias`, `/manual`

### Earnings + Economic Calendar (NEW)
- `backend/calendar_data.py` — hardcoded RBI/Budget/Fed/F&O dates + yfinance earnings fetch
- `get_event_filter_for_ticker()` returns score adjustment for upcoming events
- Recommender's `_apply_event_filter()` penalizes stocks with imminent events
- Earnings (≤2 days): -2.5 | Budget (≤1 day): -2.0 | RBI today: -1.5 | FOMC today: -1.0 | F&O expiry today: -0.5
- Dashboard banner shows today's events + 14-day forecast
- API: `/api/calendar/today`, `/upcoming`, `/ticker/{ticker}`, `/refresh-earnings`

### Sector Concentration Checker (NEW)
- `backend/concentration.py` — reverse-maps tickers to sectors, tracks open positions
- `get_open_positions()` — aggregates active paper trades + open analysis trades
- `get_concentration_summary()` — risk level (HIGH/MEDIUM/LOW) + per-sector breakdown
- `check_new_trade_concentration()` — penalty if a new trade would breach limits
- Default limits: max 3 positions/sector, max 30% capital/sector
- Recommender's `_apply_concentration_filter()` only applied to BULLISH signals
- Dashboard widget with stacked bar showing sector allocation
- API: `/api/concentration/summary`, `/allocation`, `/check/{ticker}`, `/positions`

### Signal Performance Tracker (NEW)
- `backend/signal_performance.py` — analyzer + auto-tuner for recommender weights
- Reads `paper_trades` with `pnl_5d_pct IS NOT NULL`, explodes the `triggered_signals` JSON, credits/blames each signal that fired
- Win logic: BULLISH signal wins when 5d P&L > 0; BEARISH/FADE wins when < 0 (multi-attribution — every signal in a trade gets one observation)
- Wilson lower bound at 80% CI used for honest small-sample estimates (avoids over-reacting to lucky streaks)
- `compute_signal_performance(window_days=90)` returns per-signal: n, wins, losses, win_rate, wilson_lower_80, avg_return_5d_pct, current_weight, suggested_weight, delta, verdict (TUNE_UP / TUNE_DOWN / KEEP / INSUFFICIENT_DATA)
- `apply_tuned_weights()` persists suggestions to `settings.recommender_tuned_weights` (JSON dict)
- `recommender.py` calls `_refresh_active_weights()` at start of every `recommend()` — merges DEFAULT_WEIGHTS with tuned overrides into module-level `_ACTIVE_WEIGHTS`. All scoring inside `_analyze_stock` reads from `_ACTIVE_WEIGHTS`, so the engine literally rewrites itself from real outcomes
- Min sample size: 10 trades per signal before any change is suggested
- Suggestion formula: `new_mag = abs(current) * clamp((wilson_lower - 0.30) / 0.20, 0, 2.5)`, sign preserved, clipped to [0, 3.5]
- Frontend: `/signals` page — full per-signal table with current vs suggested weights, "Apply Suggested Weights" button, "Reset to Defaults"
- API: `GET /api/signal-performance/?window_days=N`, `GET /active-weights`, `POST /apply`, `POST /reset`

### Verdict Calibration (NEW)
- `backend/verdict_calibration.py` — measures whether the daily verdict actually predicts Nifty
- `verdict_history` table in `backend/db.py` — one row per snapshot day with verdict, flags, Nifty close, forward closes at 1/3/5 trading days, and outcome classification
- `snapshot_today()` saves today's verdict + Nifty close (idempotent — skips if already taken). Called automatically inside the `/api/daily-verdict/` route so loading the dashboard captures the snapshot
- `backfill_outcomes()` fills in forward Nifty closes when ripe (1/3/5 trading days passed) and classifies each horizon
- Outcome rules:
  - GREEN: correct if Nifty return > +0.10%, wrong if < -0.10%, neutral otherwise
  - RED: correct if Nifty return < -0.10%, wrong if > +0.10%, neutral otherwise
  - YELLOW: correct if abs(return) <= 0.50% (a quiet day matches the call), else wrong
- Accuracy = correct / (correct + wrong); neutrals excluded so noise doesn't pollute
- `compute_calibration(window_days=90)` returns per-verdict counts, avg returns at each horizon, accuracy %, and recent snapshot history
- Frontend: `/verdict-calibration` page — accuracy table by verdict + recent snapshots with per-horizon outcome icons (✓/✗/—)
- API: `GET /api/verdict-calibration/?window_days=N`, `POST /snapshot`, `POST /backfill`

### Daily Trading Verdict (NEW)
- `backend/daily_verdict.py` — synthesizes all 4 filters into ONE decision
- Inputs (each contributes a caution flag, favorable flag, or nothing):
  1. FII/DII bias — caution if BEARISH, favorable if BULLISH (HIGH confidence amplifies)
  2. Calendar events (next 3 days) — caution for FOMC ≤2 days, RBI ≤1 day, Budget ≤1 day, F&O expiry today, earnings ≤2 days
  3. Sector concentration — caution if HIGH/MEDIUM risk on open positions
  4. Live HIGH-conviction setup count (NIFTY 50 recommend) — favorable if ≥3, caution if 0
- Decision table (caution count → favorable count → outcome):
  - `caution ≥3` → RED skip-day (0% size, 0 trades, HIGH only)
  - `caution = 2` → RED stand-down (0% size, 0 trades, HIGH only)
  - `caution = 1, fav = 0` → YELLOW selective (50% size, 2 trades, HIGH only)
  - `caution = 1, fav ≥1` → YELLOW selective (75% size, 3 trades, HIGH only)
  - `caution = 0, fav ≥2` → GREEN aggressive (100% size, 5 trades, MEDIUM ok)
  - `caution = 0, fav = 1` → GREEN normal (100% size, 4 trades, MEDIUM ok)
  - `caution = 0, fav = 0` → YELLOW quiet-day (75% size, 2 trades, HIGH only)
- Caution is weighted over favorability — code at `backend/daily_verdict.py:130-178`
- Output shape: `{verdict, label, action, caution_flags[], favorable_flags[], recommended_position_size_pct, max_trades_today, min_conviction_required, reasoning, filter_results}`
- Headline card at TOP of Dashboard (between Market Status and FII/DII banner)
- API: `GET /api/daily-verdict/`

## Remaining Phases (Unimplemented)

### Pre-Kite Hardening
- ✅ Sector concentration checker — prevents over-exposure to single sector
- ✅ Daily Verdict synthesizer — single trade-or-skip decision
- **Phase 4a: Kite read-only sync** — live portfolio + margin visibility (no order risk)
- **Phase 4b: Kite order placement** — one-click bracket orders with safety checks

### Future Big Features
- **Options/Futures Phase 3** — Derivatives analyst, option chains, Greeks, PCR, lot sizes
- **Real-time signal loop Phase 5** — Intraday scanning during market hours

### Nice-to-haves
- News sentiment analysis (auto-score articles as bullish/bearish)
- Stock-specific news on Analysis page
- Promoter activity tracker (NSE bulk/block deals)
- Comparative analysis (side-by-side stock comparison)
- Export analysis reports as PDF
- Dark mode toggle
- Multi-stock batch analysis queue
