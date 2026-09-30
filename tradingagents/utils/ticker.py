"""Ticker normalization utilities for Indian market (NSE/BSE)."""

import re

POPULAR_INDICES = {
    "NIFTY": "^NSEI",
    "NIFTY50": "^NSEI",
    "NIFTY 50": "^NSEI",
    "BANKNIFTY": "^NSEBANK",
    "BANK NIFTY": "^NSEBANK",
    "SENSEX": "^BSESN",
    "NIFTYIT": "^CNXIT",
    "NIFTY IT": "^CNXIT",
    "NIFTYFIN": "^CNXFIN",
    "NIFTY FIN": "^CNXFIN",
    "NIFTYPHARMA": "^CNXPHARMA",
}

EXCHANGE_SUFFIXES = {
    "NSE": ".NS",
    "BSE": ".BO",
}

# Real exchange and yfinance symbols only use letters, digits and a few
# separators (M&M, BAJAJ-AUTO, ^NSEI, NIFTY_FIN_SERVICE.NS, USDINR=X). Rejecting
# anything else keeps a "ticker" from smuggling path separators into the file
# names that the data cache and analysis logs build from it.
_TICKER_PATTERN = re.compile(r"\^?[A-Z0-9&._=-]{1,30}")
_UNSAFE_PATH_CHARS = re.compile(r"[^A-Za-z0-9^&._=-]")


class InvalidTickerError(ValueError):
    """Raised when a symbol contains characters no real ticker uses."""


SYMBOL_ALIASES = {
    "TATAMOTORS": "TMPV",
    "TATAMTRDVR": "TMPV",
}


def normalize_ticker(symbol: str, exchange: str = "NSE") -> str:
    """Normalize a ticker symbol for yfinance queries.

    If the symbol is a known index name, returns the yfinance index symbol.
    If it already has an exchange suffix (.NS, .BO), returns as-is.
    Otherwise, appends the appropriate suffix for the exchange.

    Args:
        symbol: Ticker symbol (e.g., "RELIANCE", "RELIANCE.NS", "NIFTY50")
        exchange: Exchange name - "NSE" or "BSE" (default: "NSE")

    Returns:
        Normalized ticker string for yfinance

    Raises:
        InvalidTickerError: If the symbol contains characters (such as "/" or
            "..") that no real ticker uses.
    """
    symbol = symbol.strip().upper()
    if symbol in SYMBOL_ALIASES:
        symbol = SYMBOL_ALIASES[symbol]

    # Check if it's a known index
    if symbol in POPULAR_INDICES:
        return POPULAR_INDICES[symbol]

    if not _TICKER_PATTERN.fullmatch(symbol) or ".." in symbol:
        raise InvalidTickerError(f"Invalid ticker symbol: {symbol[:40]!r}")

    # Already has a yfinance index prefix
    if symbol.startswith("^"):
        return symbol

    # Already has an exchange suffix
    if symbol.endswith(".NS") or symbol.endswith(".BO"):
        return symbol

    # Append exchange suffix
    suffix = EXCHANGE_SUFFIXES.get(exchange.upper(), ".NS")
    return f"{symbol}{suffix}"


def safe_path_component(value) -> str:
    """Return ``value`` as a single file or directory name that stays put.

    Used wherever a symbol becomes part of a path, so a bad value can never
    climb out of the directory it is joined onto, even if it never went
    through normalize_ticker (e.g. a symbol chosen by an LLM tool call).
    """
    cleaned = _UNSAFE_PATH_CHARS.sub("_", str(value)).replace("..", "_")
    return cleaned.strip(".") or "_"


def is_index(symbol: str) -> bool:
    """Check if a symbol is a market index."""
    symbol = symbol.strip().upper()
    return symbol.startswith("^") or symbol in POPULAR_INDICES


def strip_suffix(symbol: str) -> str:
    """Remove exchange suffix from a ticker. Useful for display or Kite API lookups."""
    for suffix in EXCHANGE_SUFFIXES.values():
        if symbol.endswith(suffix):
            return symbol[: -len(suffix)]
    return symbol
