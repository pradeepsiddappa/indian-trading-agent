"""Market data endpoints — stock quotes, charts, indicators, fundamentals, news."""

from functools import lru_cache

from fastapi import APIRouter, Query
import yfinance as yf
from datetime import datetime, timedelta
from tradingagents.utils.ticker import normalize_ticker

router = APIRouter(prefix="/api/market-data", tags=["market-data"])


@lru_cache(maxsize=256)
def _yahoo_nse_search(query: str) -> list:
    """Look up NSE-listed equities by name or ticker via Yahoo's search (same
    source as price data). Cached to limit repeated calls while typing."""
    search = yf.Search(query, max_results=10)
    results, seen = [], set()
    for quote in (search.quotes or []):
        if quote.get("quoteType") != "EQUITY":
            continue
        symbol = quote.get("symbol", "")
        # NSE only (matches the app's .NS default)
        if quote.get("exchange") != "NSI" and not symbol.endswith(".NS"):
            continue
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        name = quote.get("longname") or quote.get("shortname") or symbol
        ticker = symbol[:-3] if symbol.endswith(".NS") else symbol
        results.append({"ticker": ticker, "name": name, "symbol": symbol, "score": 100})
    return results


from pydantic import BaseModel

from backend.market_data_provider import (
    fetch_quote,
    get_vendor_status,
    set_vendor_setting,
)


class VendorSettingRequest(BaseModel):
    vendor: str


@router.get("/vendor")
def get_market_data_vendor():
    """Get market data vendor setting, active provider, and broker session states."""
    return get_vendor_status()


@router.put("/vendor")
def update_market_data_vendor(req: VendorSettingRequest):
    """Set market data vendor ('auto', 'yfinance', 'kite', 'upstox', 'kotak_neo')."""
    return set_vendor_setting(req.vendor)


@router.get("/search")
def search_stocks(q: str = Query("", description="Search query — ticker or company name")):
    """Typeahead search via Yahoo Finance — no local stock list, always current.

    Falls back to a small curated list only if the Yahoo lookup fails/offline.
    """
    query = q.strip()
    if not query:
        return []
    try:
        results = _yahoo_nse_search(query)
        if results:
            return results
    except Exception:
        pass
    from backend.stock_list import search_stocks as _search
    return _search(query)


@router.get("/quote/{ticker}")
def get_quote(ticker: str):
    """Get real-time quote for a ticker using the configured/resolved vendor."""
    try:
        return fetch_quote(ticker)
    except Exception as e:
        return {"error": f"Failed to fetch quote for {ticker}: {str(e)}"}


@router.get("/chart/{ticker}")
def get_chart_data(
    ticker: str,
    period: str = Query("3mo", description="1d, 5d, 1mo, 3mo, 6mo, 1y, 2y"),
    interval: str = Query("1d", description="1m, 5m, 15m, 1h, 1d, 1wk"),
):
    """Get OHLCV chart data for a ticker."""
    symbol = normalize_ticker(ticker)
    t = yf.Ticker(symbol)
    hist = t.history(period=period, interval=interval)

    if hist.empty:
        return {"error": f"No data for {symbol}", "data": []}

    data = []
    for idx, row in hist.iterrows():
        ts = idx.strftime("%Y-%m-%d") if interval in ("1d", "1wk", "1mo") else idx.isoformat()
        data.append({
            "time": ts,
            "open": round(row["Open"], 2),
            "high": round(row["High"], 2),
            "low": round(row["Low"], 2),
            "close": round(row["Close"], 2),
            "volume": int(row["Volume"]),
        })

    return {"ticker": symbol, "period": period, "interval": interval, "data": data}


@router.get("/indicators/{ticker}")
def get_indicators(
    ticker: str,
    indicators: str = Query("rsi,macd,boll_ub,boll_lb,close_10_ema,close_50_sma,atr,vwma"),
    lookback_days: int = Query(60),
):
    """Get technical indicators for a ticker."""
    from tradingagents.dataflows.interface import route_to_vendor

    symbol = normalize_ticker(ticker)
    end_date = datetime.now().strftime("%Y-%m-%d")

    results = {}
    for indicator in indicators.split(","):
        indicator = indicator.strip()
        try:
            result = route_to_vendor("get_indicators", symbol, indicator, end_date, lookback_days)
            results[indicator] = result
        except Exception as e:
            results[indicator] = f"Error: {str(e)}"

    return {"ticker": symbol, "indicators": results}


@router.get("/fundamentals/{ticker}")
def get_fundamentals(ticker: str):
    """Get company fundamentals."""
    symbol = normalize_ticker(ticker)
    t = yf.Ticker(symbol)
    info = t.info

    return {
        "ticker": symbol,
        "name": info.get("shortName", symbol),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "forward_pe": info.get("forwardPE"),
        "pb_ratio": info.get("priceToBook"),
        "dividend_yield": info.get("dividendYield"),
        "eps": info.get("trailingEps"),
        "roe": info.get("returnOnEquity"),
        "debt_to_equity": info.get("debtToEquity"),
        "revenue": info.get("totalRevenue"),
        "profit_margin": info.get("profitMargins"),
        "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
        "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
        "avg_volume": info.get("averageVolume"),
        "beta": info.get("beta"),
    }


@router.get("/news/{ticker}")
def get_news(ticker: str, count: int = Query(10)):
    """Get latest news for a ticker."""
    symbol = normalize_ticker(ticker)
    t = yf.Ticker(symbol)
    news = t.get_news(count=count)

    articles = []
    for article in (news or []):
        if "content" in article:
            content = article["content"]
            articles.append({
                "title": content.get("title", ""),
                "summary": content.get("summary", ""),
                "publisher": content.get("provider", {}).get("displayName", "Unknown"),
                "url": (content.get("canonicalUrl") or content.get("clickThroughUrl") or {}).get("url", ""),
                "published_at": content.get("pubDate", ""),
            })
        else:
            articles.append({
                "title": article.get("title", ""),
                "summary": "",
                "publisher": article.get("publisher", "Unknown"),
                "url": article.get("link", ""),
                "published_at": "",
            })

    return {"ticker": symbol, "news": articles}


@router.get("/market-status")
def get_market_status():
    """Get current Indian market status (NIFTY, BANKNIFTY, session)."""
    from tradingagents.utils.market_calendar import get_market_session, is_trading_day

    nifty = yf.Ticker("^NSEI")
    banknifty = yf.Ticker("^NSEBANK")

    nifty_hist = nifty.history(period="2d")
    banknifty_hist = banknifty.history(period="2d")

    def extract_quote(hist, info_ticker):
        if hist.empty:
            return {"price": 0, "change": 0, "change_percent": 0}
        current = hist.iloc[-1]
        prev = hist.iloc[-2]["Close"] if len(hist) > 1 else current["Close"]
        price = current["Close"]
        change = price - prev
        return {
            "price": round(price, 2),
            "change": round(change, 2),
            "change_percent": round(change / prev * 100, 2) if prev else 0,
        }

    return {
        "session": get_market_session(),
        "is_trading_day": is_trading_day(),
        "nifty": extract_quote(nifty_hist, nifty),
        "banknifty": extract_quote(banknifty_hist, banknifty),
    }
