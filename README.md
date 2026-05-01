# Indian Market Trading Agent

> AI-powered multi-agent trading decision system for Indian markets (NSE/BSE).
> Built on top of [TauricResearch/TradingAgents](https://github.com/TauricResearch/TradingAgents), adapted for Indian stocks with a full web UI, market scanner, strategy toolkit, and performance tracking.

![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)
![Python](https://img.shields.io/badge/python-3.10+-green.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)

> **Disclaimer**: This tool provides AI-generated analysis for educational and research purposes only. It is NOT financial advice. Trading involves substantial risk of loss. Always do your own research, consult qualified professionals, and never trade money you can't afford to lose. The authors and contributors accept no responsibility for any financial losses incurred from using this software.

---

## Attribution

This project is built on top of the excellent [TradingAgents](https://github.com/TauricResearch/TradingAgents) framework by TauricResearch. The core multi-agent LLM pipeline — including the LangGraph orchestration, agent prompts, memory/reflection system, and data vendor abstraction — is directly derived from their work under the Apache 2.0 license.

**Original paper**: [TradingAgents: Multi-Agents LLM Financial Trading Framework](https://arxiv.org/abs/2412.20138) (Xiao et al., 2024)

**What's adapted for Indian markets in this fork:**
- NSE/BSE ticker support (`.NS` / `.BO` suffixes)
- Indian market news queries (RBI policy, FII/DII, NIFTY)
- IST market hours + NSE holidays calendar
- Indian risk factors in agent prompts (circuit limits, FII/DII flows, SGX cues)
- Short-term trading focus (vs long-term in original)

**What's added on top:**
- Full Next.js web UI (trading terminal) — the original ships a CLI only
- FastAPI backend with WebSocket streaming
- Market Scanner (Gap / Volume / Breakout detection)
- Unified Recommendation Engine (combines 10+ signals into ranked trade ideas)
- **FII/DII Daily Flow Tracker** — live institutional buy/sell data adjusts all recommendations
- **Earnings + Economic Calendar** — RBI policy, Budget, FOMC, F&O expiry, per-stock earnings dates filter recommendations
- Support/Resistance & Pivot Point calculator
- Cyclical Pattern analysis (monthly seasonality, sector rotation, day-of-week)
- Strategy Performance Tracker (measures historical win rates)
- Paper Trading Simulation (multi-horizon P&L tracking, no API cost)
- Historical Recommender Backtest (replay engine on past 60 days)
- Learning Insights (pattern analysis on YOUR trades, no ML)
- Seasonal Backtest (no AI cost)
- Position Size Calculator
- P&L Tracking + "Reflect & Remember" (feed outcomes to agent memory)
- Memory Persistence (agents learn across sessions)
- Customizable News Feed (RSS + yfinance)
- API key management via UI
- Multi-provider LLM support with real-time cost tracking

Please consider starring the [original repo](https://github.com/TauricResearch/TradingAgents) if you find value in this work.

---

## Demo

```
🏠 Today              — Daily workflow dashboard with auto-loaded top picks,
                        FII/DII flow banner, calendar warnings, sector heatmap

DISCOVER
  ✨ Top Picks         — AI-free unified recommendations (FREE)
                        Auto-adjusts for FII/DII bias + upcoming events
  📡 Market Scan       — Gap / Volume / Breakout (FREE)
  🎯 Strategies        — S/R, Pivot, Cyclical patterns (FREE)
  📰 News Feed         — RSS + yfinance, customizable (FREE)

ANALYZE
  🔍 Deep Analysis     — AI-powered 10-agent pipeline (~Rs.15-60)
  📊 Charts            — Candlestick charts (FREE)

VALIDATE
  🏆 Performance       — Strategy win rates (FREE)
  🧪 Simulation        — Paper trading + historical backtest (FREE)
  🧠 Learning Insights — Pattern analysis of YOUR trades (FREE)
  🔬 Backtest          — AI on past dates (paid)
  📋 My Trades         — P&L tracking + agent learning
```

---

## Quick Start

### Prerequisites
- **Python 3.10+**
- **Node.js 20+**
- An LLM API key (Anthropic/OpenAI/Google — Anthropic Haiku is the cheapest default)

### 1. Clone and install Python deps

```bash
git clone https://github.com/YOUR_USERNAME/indian-trading-agent.git
cd indian-trading-agent

python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

pip install -e .
pip install fastapi uvicorn websockets aiosqlite numpy feedparser
```

### 2. Configure API key (pick ONE method)

**Option A: via UI** (recommended — easier, no env setup)

Start the app, then go to **Settings** → API Keys → paste your key → Test → Save.
Keys are stored in your local SQLite DB (`~/.tradingagents/trading_agent.db`).

**Option B: via `.env` file**

```bash
cp .env.example .env
# Edit .env and add your key:
#   ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 3. Start the backend

```bash
uvicorn backend.app:app --reload --port 8000
```

### 4. Start the frontend (in a new terminal)

```bash
cd frontend
npm install
npm run dev
```

### 5. Open the app

Visit [http://localhost:3000](http://localhost:3000)

---

## How It Works

### The Multi-Agent Pipeline

```
Market Analyst → Social Analyst → News Analyst → Fundamentals Analyst
    ↓  (any subset can be enabled/disabled)
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
Reflect & Remember → 5 agent memories updated with actual P&L outcome
```

### Features — Free vs LLM API Cost

> **Note on costs**: The software itself is free and open source. "Cost" below refers to the **LLM API usage fees** you pay directly to your chosen AI provider (Anthropic, OpenAI, Google, etc.) for the features that call their APIs. You bring your own API key. Nothing is charged by this project or its authors — all billing is between you and your LLM provider.

| Feature | Uses LLM API? | Est. Cost per Run | What it does |
|---------|---------------|-------------------|--------------|
| **Top Picks** | No | FREE | Ranks NIFTY 50/100/BSE 250 stocks by combined signal strength |
| **Market Scan** | No | FREE | Finds stocks with gap ups/downs, volume spikes, breakouts |
| **Strategies** | No | FREE | S/R levels, Pivot Points, Cyclical patterns |
| **Performance Tracker** | No | FREE | Measures historical win rate of each strategy |
| **Seasonal Backtest** | No | FREE | Tests "buy in month X, sell in month Y" strategies |
| **News Feed** | No | FREE | Aggregates Indian market news from RSS + yfinance |
| **Charts** | No | FREE | Candlestick charts with volume |
| **Deep Analysis** | Yes | ~Rs.15-60 (~$0.18-0.72 USD) | Full AI pipeline with customizable analysts/depth/language |
| **AI Backtest** | Yes | ~Rs.15 per date (~$0.18/date) | Runs deep analysis on historical dates |
| **Reflect & Remember** | Yes | ~Rs.5-10 per trade | Agent learns from your P&L outcome |

Costs shown assume the default Anthropic Claude setup (Haiku for fast tasks + Sonnet for decisions). Switching to cheaper providers like Gemini Flash or GPT-4o-mini can reduce costs by 3-5x. See [Cost Optimization](#cost-optimization) below.

### Unified Recommendation Engine (FREE)

Scans all stocks in NIFTY 100 and scores each one:

**Bullish signals add points:**
- Volume-confirmed breakout: +3.0
- Volume spike bullish: +2.0
- Near major support: +2.0
- Gap filled (reversal): +1.5
- RSI oversold: +1.5
- Cyclical bullish month: +1.5
- Strong uptrend: +1.0

**Bearish signals subtract:**
- Breakdown below support: -2.5
- Volume spike bearish: -2.0
- Near major resistance: -1.5
- RSI overbought: -1.0
- Strong downtrend: -1.0

Ratings: STRONG BUY (score ≥ +4), BUY (+2 to +4), SELL (-2 to -4), STRONG SELL (≤ -4).

Success probability: 50% baseline + 4% per score point + 2% per aligned signal (capped at 85%).

### Smart Filters Layered on Top (FREE)

Two market-wide filters automatically adjust every recommendation before showing it to you:

**1. FII/DII Institutional Flow** — In Indian markets, the single biggest predictor of next-day direction:

| Today's Flow | Score Adjustment | Effect |
|-------------|------------------|--------|
| FII selling > Rs.2,000 Cr | -1.5 | Demotes BUYs to NEUTRAL |
| FII selling > Rs.1,000 Cr | -1.0 | Reduces conviction |
| FII buying > Rs.2,000 Cr | +1.5 | Promotes BUYs to STRONG BUY |
| FII buying > Rs.1,000 Cr | +1.0 | Adds tailwind |
| DIIs partially offsetting | +0.5x reduction | "Mixed" bias |

Live data via NSE (cached 1 hour). Falls back to manual entry if scraping fails.

**2. Earnings + Economic Calendar** — Avoids trading into known volatility:

| Event in Next N Days | Score Penalty |
|---------------------|---------------|
| Stock earnings (≤2 days) | -2.5 |
| Union Budget (≤1 day) | -2.0 |
| RBI Monetary Policy (today) | -1.5 |
| US Fed FOMC (today) | -1.0 |
| F&O monthly expiry (today) | -0.5 |

Hardcoded RBI/Budget/Fed dates (published yearly). Per-stock earnings dates pulled from yfinance.

**Real example:** On a day when FIIs sold Rs.8,000 Cr and INFY has earnings tomorrow:
- Pure technical score: STRONG BUY (+5.0)
- After FII filter: BUY (+3.5)
- After earnings filter: NEUTRAL (+1.0) — filtered out

This prevents the most common AI trading mistakes: trading against institutional flow + trading into earnings volatility.

---

## Project Structure

```
.
├── tradingagents/              # Core AI pipeline (adapted from TauricResearch/TradingAgents)
│   ├── agents/                 # Analysts, researchers, trader, risk debators, portfolio manager
│   ├── dataflows/              # yfinance, alpha_vantage, NSE data adapters
│   ├── graph/                  # LangGraph orchestration
│   ├── llm_clients/            # Multi-provider LLM factory
│   ├── utils/                  # Indian market utilities (ticker, calendar)
│   └── default_config.py
│
├── backend/                    # FastAPI REST + WebSocket API (NEW)
│   ├── app.py                  # Entry point
│   ├── db.py                   # SQLite: watchlist, history, backtests, settings
│   ├── scanner.py              # Gap / Volume / Breakout detection
│   ├── recommender.py          # Unified signal scoring engine
│   ├── performance.py          # Strategy win rate measurement
│   ├── cyclical.py             # Seasonality, sector rotation
│   ├── backtest_engine.py      # Historical P&L testing
│   ├── news_sources.py         # RSS + yfinance news aggregator
│   ├── stats_callback.py       # Token + cost tracking
│   ├── settings_manager.py     # API key storage + LLM config
│   └── routers/                # API endpoints per feature
│
├── frontend/                   # Next.js 16 trading terminal UI (NEW)
│   ├── src/app/                # Pages: dashboard, analysis, scanner, strategies, etc.
│   ├── src/components/         # UI components (shadcn/ui + custom)
│   ├── src/lib/                # API client, Zustand store, types
│   └── src/hooks/
│
├── cli/                        # Interactive CLI (from original repo)
├── README.md
├── NOTICE                      # Attribution
├── LICENSE                     # Apache 2.0
├── pyproject.toml
└── .env.example
```

---

## Tech Stack

**Backend:**
- Python 3.10+
- LangGraph (multi-agent orchestration)
- LangChain (LLM integrations)
- FastAPI + Uvicorn
- SQLite (local storage)
- yfinance (free stock data)
- feedparser (RSS parsing)

**Frontend:**
- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui (component library)
- TradingView lightweight-charts
- Zustand (state management)

**LLM Providers Supported:**
- Anthropic Claude (default — Haiku + Sonnet mix for cost efficiency)
- OpenAI GPT
- Google Gemini
- xAI Grok
- DeepSeek
- Qwen

---

## Cost Optimization

The default configuration uses a **cost-efficient model mix**:
- **Haiku 4.5** for 13 fast tasks (analyst tool-calls, debates, risk analysis)
- **Sonnet 4** for 2 critical decision points (Research Manager, Portfolio Manager)

**Typical cost per analysis:**

| Config | Cost | Duration |
|--------|------|----------|
| Minimal (Market only, Shallow, English) | ~Rs.8-12 | ~1 min |
| Balanced (all 4 analysts, Shallow) | ~Rs.15-25 | 2-3 min |
| Full (all 4 analysts, Deep 3 rounds) | ~Rs.50-70 | 4-6 min |

Switch providers (OpenAI GPT-5.4-mini, Gemini Flash) for even cheaper analyses (~Rs.3-8 per analysis).

---

## Security & Privacy

- **All data stays local**: SQLite DB at `~/.tradingagents/trading_agent.db`, memory files at `~/.tradingagents/memory/`
- **API keys never transmitted**: stored locally, sent only to your chosen LLM provider directly
- **No tracking, no telemetry, no ads**
- **Masked display**: API keys in the Settings UI show only first 10 and last 4 characters

---

## Roadmap

### Implemented ✅
- [x] Full multi-agent AI pipeline adapted for Indian markets
- [x] Web UI with Dashboard, Scanner, Strategies, Analysis, Backtest, etc.
- [x] Unified recommendation engine
- [x] **FII/DII daily flow tracker** (live NSE data, integrated as recommendation filter)
- [x] **Earnings + Economic Calendar** (RBI/Budget/Fed/expiry/earnings filters)
- [x] Strategy performance tracker
- [x] Paper trading simulation (multi-horizon P&L tracking)
- [x] Historical recommender backtest
- [x] Learning insights (pattern analysis on user trades)
- [x] Cyclical pattern analysis + seasonal backtest
- [x] P&L tracking with agent learning (Reflect & Remember)
- [x] Memory persistence across sessions
- [x] Customizable news feed (RSS + yfinance)
- [x] Position Size Calculator
- [x] Sector Heatmap
- [x] Open/Closed trades separation
- [x] Watchlist alerts on Top Picks matches
- [x] API key management via UI
- [x] Multi-LLM provider support
- [x] Cost tracking per analysis

### Pre-Kite Hardening (in progress)
- [ ] Sector concentration checker (don't open 5 trades all in IT)
- [ ] Phase 4a: Zerodha Kite read-only sync (live portfolio + margin)
- [ ] Phase 4b: One-click order placement with bracket SL/target

### Future
- [ ] Options & Futures analyzer (derivatives agent, option chains, Greeks, PCR)
- [ ] Real-time intraday signal loop (auto-scan during market hours)
- [ ] Promoter activity tracker (NSE bulk/block deals)
- [ ] Comparative analysis (side-by-side stock comparison)
- [ ] Trade journal with notes
- [ ] Mobile responsive UI
- [ ] Dark mode toggle
- [ ] Export analyses as PDF
- [ ] Daily email/Telegram briefing

---

## Contributing

Contributions welcome! Areas that need work:

- Indian market-specific data sources (NSE scraping for bulk/block deals, delivery %, promoter activity)
- Options/F&O analyzer (Phase 3)
- Kite API integration (Phase 4)
- More RSS sources, better news deduplication
- Additional strategies (VWAP, ORB intraday, momentum breakouts)
- Testing infrastructure

Please ensure:
1. No API keys or secrets committed
2. Code follows existing patterns (see `CLAUDE.md`)
3. New features have user-facing documentation (help sections)

---

## License

Apache License 2.0 — see [LICENSE](./LICENSE) file.

This project builds on the Apache 2.0-licensed [TradingAgents](https://github.com/TauricResearch/TradingAgents) framework. See [NOTICE](./NOTICE) for attribution details.

---

## Acknowledgments

- **[TauricResearch](https://github.com/TauricResearch)** for the excellent TradingAgents framework. Without their work, this project would not exist. Please star their [original repo](https://github.com/TauricResearch/TradingAgents).
- The LangChain and LangGraph teams for the agent orchestration framework.
- Yahoo Finance for providing free Indian market data via yfinance.
- All the open-source libraries that power this project.

---

## Disclaimer (again, because it matters)

This software is provided **"as-is"** without warranty of any kind. The AI models can and do make mistakes, especially around:
- Sudden market events (RBI announcements, global shocks)
- Illiquid or penny stocks
- Options/derivatives analysis
- Tax and regulatory implications

**Always**:
- Validate AI recommendations against your own research
- Use stop-losses (the AI suggests them; actually place them)
- Never risk more than 1-2% of capital per trade
- Start with paper trading or very small positions
- Consult a SEBI-registered investment advisor for personalized advice

Trading in financial markets carries substantial risk. Past performance — whether historical backtests or agent learning — does not guarantee future results.
