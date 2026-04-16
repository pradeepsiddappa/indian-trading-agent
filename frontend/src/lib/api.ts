const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
  } catch {
    throw new Error(`Cannot connect to backend at ${API_BASE}. Is it running?`);
  }
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

// Market Data
export const searchStocks = (query: string) => fetchAPI(`/api/market-data/search?q=${encodeURIComponent(query)}`);
export const getQuote = (ticker: string) => fetchAPI(`/api/market-data/quote/${ticker}`);
export const getChartData = (ticker: string, period = "3mo", interval = "1d") =>
  fetchAPI(`/api/market-data/chart/${ticker}?period=${period}&interval=${interval}`);
export const getIndicators = (ticker: string) => fetchAPI(`/api/market-data/indicators/${ticker}`);
export const getFundamentals = (ticker: string) => fetchAPI(`/api/market-data/fundamentals/${ticker}`);
export const getStockNews = (ticker: string) => fetchAPI(`/api/market-data/news/${ticker}`);
export const getMarketStatus = () => fetchAPI(`/api/market-data/market-status`);

// Analysis
export const runAnalysis = (data: {
  ticker: string;
  trade_date: string;
  analysts?: string[];
  max_debate_rounds?: number;
  max_risk_discuss_rounds?: number;
  output_language?: string;
}) => fetchAPI(`/api/analysis/run`, { method: "POST", body: JSON.stringify(data) });
export const getAnalysisResult = (taskId: string) => fetchAPI(`/api/analysis/${taskId}`);
export const getAnalysisHistory = (limit = 50) => fetchAPI(`/api/analysis/history/list?limit=${limit}`);
export const updatePnL = (taskId: string, data: { entry_price: number; exit_price: number; reflect?: boolean }) =>
  fetchAPI(`/api/analysis/${taskId}/pnl`, { method: "PUT", body: JSON.stringify(data) });
export const getMemoryStats = () => fetchAPI(`/api/analysis/memory/stats`);

// Watchlist
export const getWatchlist = () => fetchAPI(`/api/watchlist`);
export const addToWatchlist = (ticker: string) =>
  fetchAPI(`/api/watchlist`, { method: "POST", body: JSON.stringify({ ticker }) });
export const removeFromWatchlist = (ticker: string) =>
  fetchAPI(`/api/watchlist/${ticker}`, { method: "DELETE" });

// Config
export const getConfig = () => fetchAPI(`/api/config`);

// Settings — API Keys & LLM Config
export const getApiKeys = () => fetchAPI(`/api/settings/api-keys`);
export const saveApiKey = (provider: string, key: string) =>
  fetchAPI(`/api/settings/api-keys`, {
    method: "PUT",
    body: JSON.stringify({ provider, key }),
  });
export const deleteApiKey = (provider: string) =>
  fetchAPI(`/api/settings/api-keys/${provider}`, { method: "DELETE" });
export const testApiKey = (provider: string, key?: string) =>
  fetchAPI(`/api/settings/api-keys/test`, {
    method: "POST",
    body: JSON.stringify({ provider, key: key || null }),
  });
export const getLLMSettings = () => fetchAPI(`/api/settings/llm`);
export const saveLLMSettings = (data: { llm_provider?: string; deep_think_llm?: string; quick_think_llm?: string }) =>
  fetchAPI(`/api/settings/llm`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
export const getProviders = () => fetchAPI(`/api/settings/providers`);

// Learning Insights
export const getLearningInsights = () => fetchAPI(`/api/insights/`);

// News Feed
export const getNewsFeed = (maxPerSource = 10) => fetchAPI(`/api/news/?max_per_source=${maxPerSource}`);
export const getTickerNews = (ticker: string, maxItems = 15) => fetchAPI(`/api/news/ticker/${ticker}?max_items=${maxItems}`);
export const getNewsSources = () => fetchAPI(`/api/news/sources`);
export const saveNewsSources = (data: { rss_feeds?: any; yf_queries?: string[] }) =>
  fetchAPI(`/api/news/sources`, { method: "PUT", body: JSON.stringify(data) });

// Strategies
export const getSupportResistance = (ticker: string, period = "3mo", nLevels = 3) =>
  fetchAPI(`/api/strategies/support-resistance/${ticker}?period=${period}&n_levels=${nLevels}`);
export const getPivotPoints = (ticker: string) =>
  fetchAPI(`/api/strategies/pivot-points/${ticker}`);
export const getMonthlySeasonality = (ticker: string, years = 5) =>
  fetchAPI(`/api/strategies/cyclical/monthly/${ticker}?years=${years}`);
export const getDayOfWeek = (ticker: string, months = 6) =>
  fetchAPI(`/api/strategies/cyclical/day-of-week/${ticker}?months=${months}`);
export const getSectorRotation = (months = 3) =>
  fetchAPI(`/api/strategies/cyclical/sector-rotation?months=${months}`);
export const backtestSeasonal = (ticker: string, buyMonths: string, sellMonths: string, years = 5) =>
  fetchAPI(`/api/strategies/cyclical/backtest-seasonal?ticker=${ticker}&buy_months=${buyMonths}&sell_months=${sellMonths}&years=${years}`, { method: "POST" });

// Simulation (Paper Trading + Historical Backtest)
export const openPaperTrade = (data: {
  ticker: string;
  source?: string;
  signal?: string;
  score?: number;
  success_probability?: number;
  notes?: string;
}) => fetchAPI(`/api/simulation/paper-trade`, { method: "POST", body: JSON.stringify(data) });

export const listPaperTrades = (status?: string) =>
  fetchAPI(`/api/simulation/paper-trades${status ? `?status=${status}` : ""}`);

export const refreshPaperTrades = () =>
  fetchAPI(`/api/simulation/paper-trades/refresh`, { method: "POST" });

export const getPaperTradingStats = () => fetchAPI(`/api/simulation/paper-trades/stats`);

export const deletePaperTrade = (tradeId: number) =>
  fetchAPI(`/api/simulation/paper-trades/${tradeId}`, { method: "DELETE" });

export const closePaperTrade = (tradeId: number) =>
  fetchAPI(`/api/simulation/paper-trades/${tradeId}/close`, { method: "PUT" });

export const runRecommenderBacktest = (params: {
  universe?: string;
  start_date?: string;
  end_date?: string;
  interval_days?: number;
}) => {
  const q = new URLSearchParams();
  if (params.universe) q.set("universe", params.universe);
  if (params.start_date) q.set("start_date", params.start_date);
  if (params.end_date) q.set("end_date", params.end_date);
  if (params.interval_days) q.set("interval_days", String(params.interval_days));
  return fetchAPI(`/api/simulation/recommender-backtest?${q.toString()}`, { method: "POST" });
};

export const getRecommenderBacktestResult = (runId: string) =>
  fetchAPI(`/api/simulation/recommender-backtest/${runId}`);

export const listRecommenderBacktests = () =>
  fetchAPI(`/api/simulation/recommender-backtest-history`);

// Recommendations
export const getRecommendations = (universe = "nifty100", minSignals = 2) =>
  fetchAPI(`/api/recommend/?universe=${universe}&min_signals=${minSignals}`);
export const analyzeRecommendation = (ticker: string) =>
  fetchAPI(`/api/recommend/stock/${ticker}`);

// Performance
export const getPerformanceAll = (universe = "nifty50", lookbackDays = 60) =>
  fetchAPI(`/api/performance/all?universe=${universe}&lookback_days=${lookbackDays}`);
export const getPerformanceGap = (universe = "nifty50", lookbackDays = 60, threshold = 2.0) =>
  fetchAPI(`/api/performance/gap?universe=${universe}&lookback_days=${lookbackDays}&gap_threshold=${threshold}`);
export const getPerformanceVolume = (universe = "nifty50", lookbackDays = 60, multiplier = 2.0) =>
  fetchAPI(`/api/performance/volume?universe=${universe}&lookback_days=${lookbackDays}&volume_multiplier=${multiplier}`);
export const getPerformanceBreakout = (universe = "nifty50", lookbackDays = 60, window = 20) =>
  fetchAPI(`/api/performance/breakout?universe=${universe}&lookback_days=${lookbackDays}&breakout_window=${window}`);
export const getPerformanceSRBounce = (universe = "nifty50", lookbackDays = 90) =>
  fetchAPI(`/api/performance/sr-bounce?universe=${universe}&lookback_days=${lookbackDays}`);

// Scanner
export const startScan = (data: {
  universe?: string;
  strategies?: string[];
  gap_threshold?: number;
  volume_multiplier?: number;
  breakout_lookback?: number;
}) => fetchAPI(`/api/scanner/run`, { method: "POST", body: JSON.stringify(data) });

export const getScanResult = (scanId: string) => fetchAPI(`/api/scanner/${scanId}`);
export const getScannerUniverses = () => fetchAPI(`/api/scanner/universes/list`);

export function connectScannerWS(scanId: string, onEvent: (event: any) => void): WebSocket {
  const wsBase = API_BASE.replace("http", "ws");
  const ws = new WebSocket(`${wsBase}/api/scanner/ws/${scanId}`);
  ws.onmessage = (event) => {
    try { onEvent(JSON.parse(event.data)); } catch {}
  };
  return ws;
}

// Backtest
export const startBacktest = (data: {
  ticker: string;
  start_date: string;
  end_date: string;
  interval_days?: number;
  initial_capital?: number;
  position_size_pct?: number;
  enable_learning?: boolean;
}) => fetchAPI(`/api/backtest/run`, { method: "POST", body: JSON.stringify(data) });

export const getBacktestResult = (backtestId: string) => fetchAPI(`/api/backtest/${backtestId}`);
export const getBacktestHistory = (limit = 20) => fetchAPI(`/api/backtest/history/list?limit=${limit}`);

// WebSocket
export function connectAnalysisWS(taskId: string, onEvent: (event: any) => void): WebSocket {
  const wsBase = API_BASE.replace("http", "ws");
  const ws = new WebSocket(`${wsBase}/api/analysis/ws/${taskId}`);
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onEvent(data);
    } catch {}
  };
  return ws;
}

export function connectBacktestWS(backtestId: string, onEvent: (event: any) => void): WebSocket {
  const wsBase = API_BASE.replace("http", "ws");
  const ws = new WebSocket(`${wsBase}/api/backtest/ws/${backtestId}`);
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onEvent(data);
    } catch {}
  };
  return ws;
}
