"""Market Data Providerabstraction.

Routes real-time quotes, indicators, and historical data between yfinance and
connected Indian broker APIs (Zerodha Kite, Upstox, Kotak Neo) with automatic
session resolution and seamless fallback to yfinance.
"""

from __future__ import annotations

from datetime import date
from typing import Any
import httpx
import yfinance as yf

from backend.db import get_setting, set_setting
from tradingagents.utils.ticker import normalize_ticker

MARKET_DATA_VENDOR_KEY = "market_data_vendor"


def _today() -> str:
    return date.today().isoformat()


def get_active_broker_sessions() -> dict[str, bool]:
    """Check which broker sessions are active for today."""
    kite_token = get_setting("kite_access_token")
    kite_date = get_setting("kite_access_token_date")

    upstox_token = get_setting("upstox_access_token")
    upstox_date = get_setting("upstox_access_token_date")

    kotak_token = get_setting("kotak_neo_access_token")
    kotak_date = get_setting("kotak_neo_access_token_date")

    today = _today()
    return {
        "kite": bool(kite_token and kite_date == today),
        "upstox": bool(upstox_token and upstox_date == today),
        "kotak_neo": bool(kotak_token and kotak_date == today),
    }


def resolve_active_vendor() -> tuple[str, str, bool]:
    """Resolve the active market data vendor.

    Returns:
        (vendor_code, vendor_label, is_fallback)
    """
    configured = (get_setting(MARKET_DATA_VENDOR_KEY) or "auto").strip().lower()
    sessions = get_active_broker_sessions()

    labels = {
        "auto": "Auto-Detect Active Broker",
        "yfinance": "Yahoo Finance (yfinance)",
        "kite": "Zerodha Kite Connect",
        "upstox": "Upstox API v2",
        "kotak_neo": "Kotak Neo API",
    }

    if configured == "yfinance":
        return ("yfinance", labels["yfinance"], False)

    if configured == "kite":
        if sessions["kite"]:
            return ("kite", labels["kite"], False)
        return ("yfinance", "Yahoo Finance (Kite Expired)", True)

    if configured == "upstox":
        if sessions["upstox"]:
            return ("upstox", labels["upstox"], False)
        return ("yfinance", "Yahoo Finance (Upstox Expired)", True)

    if configured == "kotak_neo":
        if sessions["kotak_neo"]:
            return ("kotak_neo", labels["kotak_neo"], False)
        return ("yfinance", "Yahoo Finance (Kotak Expired)", True)

    # Auto mode: Pick highest priority active broker session
    if sessions["kite"]:
        return ("kite", labels["kite"], False)
    if sessions["upstox"]:
        return ("upstox", labels["upstox"], False)
    if sessions["kotak_neo"]:
        return ("kotak_neo", labels["kotak_neo"], False)

    return ("yfinance", labels["yfinance"], False)


def get_vendor_status() -> dict[str, Any]:
    """Get market data vendor setting status for UI/REST endpoint."""
    configured = (get_setting(MARKET_DATA_VENDOR_KEY) or "auto").strip().lower()
    resolved_vendor, resolved_label, is_fallback = resolve_active_vendor()
    sessions = get_active_broker_sessions()

    return {
        "configured_vendor": configured,
        "resolved_vendor": resolved_vendor,
        "resolved_label": resolved_label,
        "is_fallback": is_fallback,
        "active_sessions": sessions,
        "options": [
            {"value": "auto", "label": "Auto-Detect Active Broker (Recommended)"},
            {"value": "yfinance", "label": "Yahoo Finance (yfinance)"},
            {"value": "kite", "label": "Zerodha Kite Connect"},
            {"value": "upstox", "label": "Upstox API v2"},
            {"value": "kotak_neo", "label": "Kotak Neo API"},
        ],
    }


def set_vendor_setting(vendor: str) -> dict[str, Any]:
    val = (vendor or "auto").strip().lower()
    allowed = {"auto", "yfinance", "kite", "upstox", "kotak_neo"}
    if val not in allowed:
        val = "auto"
    set_setting(MARKET_DATA_VENDOR_KEY, val)
    return get_vendor_status()


# --- Vendor-specific quote fetching ---

def _clean_ticker_symbol(ticker: str) -> tuple[str, str]:
    """Extract symbol and exchange (default NSE)."""
    t = ticker.strip().upper()
    if t.endswith(".NS"):
        return t[:-3], "NSE"
    if t.endswith(".BO"):
        return t[:-3], "BSE"
    return t, "NSE"


def _fetch_kite_quote(ticker: str) -> dict[str, Any] | None:
    from backend.brokers.kite import get_authenticated_client
    symbol, exchange = _clean_ticker_symbol(ticker)
    instrument = f"{exchange}:{symbol}"
    client = get_authenticated_client()
    res = client.quote([instrument])
    if not res or instrument not in res:
        return None
    data = res[instrument]
    price = float(data.get("last_price") or 0)
    ohlc = data.get("ohlc", {})
    prev_close = float(ohlc.get("close") or price)
    change = price - prev_close
    change_pct = (change / prev_close * 100) if prev_close else 0.0

    return {
        "ticker": normalize_ticker(symbol),
        "name": symbol,
        "price": round(price, 2),
        "change": round(change, 2),
        "change_percent": round(change_pct, 2),
        "volume": int(data.get("volume") or 0),
        "high": round(float(ohlc.get("high") or price), 2),
        "low": round(float(ohlc.get("low") or price), 2),
        "open": round(float(ohlc.get("open") or price), 2),
        "prev_close": round(prev_close, 2),
        "vendor_used": "Zerodha Kite",
    }


def _fetch_upstox_quote(ticker: str) -> dict[str, Any] | None:
    from backend.brokers.upstox import _access_token, _today, _access_token_date
    token = _access_token()
    if not token or _access_token_date() != _today():
        return None
    symbol, exchange = _clean_ticker_symbol(ticker)
    instrument_key = f"{exchange}_EQ|{symbol}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    url = f"https://api.upstox.com/v2/market-quote/ltp?instrument_key={instrument_key}"
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code != 200:
                return None
            data = resp.json().get("data", {})
            quote_key = list(data.keys())[0] if data else None
            if not quote_key:
                return None
            q = data[quote_key]
            price = float(q.get("last_price") or 0)
            if not price:
                return None
            return {
                "ticker": normalize_ticker(symbol),
                "name": symbol,
                "price": round(price, 2),
                "change": 0.0,
                "change_percent": 0.0,
                "volume": int(q.get("volume") or 0),
                "high": round(price, 2),
                "low": round(price, 2),
                "open": round(price, 2),
                "prev_close": round(price, 2),
                "vendor_used": "Upstox API",
            }
    except Exception:
        return None


def _fetch_kotak_quote(ticker: str) -> dict[str, Any] | None:
    from backend.brokers.kotak_neo import get_authenticated_headers
    try:
        headers = get_authenticated_headers()
    except Exception:
        return None
    symbol, exchange = _clean_ticker_symbol(ticker)
    url = f"https://gw-napi.kotaksecurities.com/trade/1.0/quotes?symbol={symbol}&exchange={exchange}"
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.get(url, headers=headers)
            if resp.status_code != 200:
                return None
            data = resp.json().get("data", [])
            if not data or not isinstance(data, list):
                return None
            q = data[0]
            price = float(q.get("ltp") or q.get("lastPrice") or 0)
            if not price:
                return None
            prev_close = float(q.get("closePrice") or price)
            change = price - prev_close
            return {
                "ticker": normalize_ticker(symbol),
                "name": symbol,
                "price": round(price, 2),
                "change": round(change, 2),
                "change_percent": round((change / prev_close * 100) if prev_close else 0.0, 2),
                "volume": int(q.get("volume") or 0),
                "high": round(float(q.get("highPrice") or price), 2),
                "low": round(float(q.get("lowPrice") or price), 2),
                "open": round(float(q.get("openPrice") or price), 2),
                "prev_close": round(prev_close, 2),
                "vendor_used": "Kotak Neo API",
            }
    except Exception:
        return None


def _fetch_yfinance_quote(ticker: str) -> dict[str, Any]:
    symbol = normalize_ticker(ticker)
    t = yf.Ticker(symbol)
    info = t.info

    hist = t.history(period="2d")
    if hist.empty:
        raise ValueError(f"No price data found for {symbol}")

    current = hist.iloc[-1]
    prev_close = info.get("previousClose") or (hist.iloc[-2]["Close"] if len(hist) > 1 else current["Close"])
    price = current["Close"]
    change = price - prev_close
    change_pct = (change / prev_close * 100) if prev_close else 0.0

    return {
        "ticker": symbol,
        "name": info.get("shortName", symbol),
        "price": round(price, 2),
        "change": round(change, 2),
        "change_percent": round(change_pct, 2),
        "volume": int(current.get("Volume", 0)),
        "high": round(current["High"], 2),
        "low": round(current["Low"], 2),
        "open": round(current["Open"], 2),
        "prev_close": round(prev_close, 2),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
        "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
        "vendor_used": "Yahoo Finance (yfinance)",
    }


def fetch_quote(ticker: str) -> dict[str, Any]:
    """Fetch live quote for ticker using the configured or resolved market data vendor."""
    resolved_vendor, resolved_label, _ = resolve_active_vendor()

    if resolved_vendor == "kite":
        try:
            res = _fetch_kite_quote(ticker)
            if res:
                return res
        except Exception:
            pass

    if resolved_vendor == "upstox":
        try:
            res = _fetch_upstox_quote(ticker)
            if res:
                return res
        except Exception:
            pass

    if resolved_vendor == "kotak_neo":
        try:
            res = _fetch_kotak_quote(ticker)
            if res:
                return res
        except Exception:
            pass

    # Default / Fallback to yfinance
    quote = _fetch_yfinance_quote(ticker)
    if resolved_vendor != "yfinance":
        quote["vendor_used"] = f"Yahoo Finance (Fallback from {resolved_label})"
    return quote
