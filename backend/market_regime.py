"""Market regime classifier — labels every trading day as one of 4 regimes
based on Nifty technicals. Used to make signal performance conditional
on regime ('this signal works in bull markets but fails in bear').

Regimes:
- BULL:        Nifty > 50 SMA > 200 SMA, low/normal vol
- BEAR:        Nifty < 50 SMA < 200 SMA, low/normal vol
- SIDEWAYS:    No clear trend (Nifty oscillating around SMAs)
- HIGH_VOL:    Realized volatility > 1.5× the 6-month average,
               OVERRIDES the trend-based label

The classifier is data-only (no API calls except yfinance) so it can
run cheaply on every dashboard load and on backfill across hundreds of
historical trades.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional

import numpy as np
import yfinance as yf


NIFTY_SYMBOL = "^NSEI"

# Volatility threshold (annualized 20-day realized vol) above which we
# flip to HIGH_VOL regardless of trend.
HIGH_VOL_MULTIPLIER = 1.5

# Threshold (in percent) for when the price is "near" the 50 SMA — used
# to detect sideways markets where 50 SMA flatlines.
SIDEWAYS_BAND_PCT = 2.0


def _annualized_vol(closes: np.ndarray, window: int = 20) -> float:
    """Annualized realized volatility over the trailing `window` days."""
    if len(closes) < window + 1:
        return 0.0
    rets = np.diff(closes[-window - 1:]) / closes[-window - 1:-1]
    return float(np.std(rets) * np.sqrt(252) * 100)  # %


def classify_regime_for_date(target_date: Optional[date] = None) -> dict:
    """Classify the Nifty regime as of a given date.

    Args:
        target_date: date to classify. Defaults to today.

    Returns:
        {
            "date": "2026-05-05",
            "regime": "BULL" | "BEAR" | "SIDEWAYS" | "HIGH_VOL",
            "nifty_close": float,
            "sma_50": float,
            "sma_200": float,
            "annualized_vol_pct": float,
            "vol_baseline_pct": float,
            "reasoning": str,
        }
        Returns regime "UNKNOWN" if data is missing.
    """
    target = target_date or date.today()
    # Need 220 calendar days of history for 200 SMA + buffer for weekends/holidays
    start = target - timedelta(days=320)
    end = target + timedelta(days=2)

    try:
        hist = yf.Ticker(NIFTY_SYMBOL).history(
            start=start.isoformat(), end=end.isoformat()
        )
    except Exception as e:
        return {"date": target.isoformat(), "regime": "UNKNOWN", "reasoning": f"fetch failed: {e}"}

    if hist.empty or len(hist) < 200:
        return {"date": target.isoformat(), "regime": "UNKNOWN",
                "reasoning": f"insufficient history ({len(hist)} bars)"}

    # Trim to bars on or before target_date
    hist = hist[hist.index.date <= target]
    if len(hist) < 200:
        return {"date": target.isoformat(), "regime": "UNKNOWN",
                "reasoning": "insufficient history before target_date"}

    closes = hist["Close"].values
    nifty_close = float(closes[-1])
    sma_50 = float(np.mean(closes[-50:]))
    sma_200 = float(np.mean(closes[-200:]))

    # Volatility check (uses the most recent 20 days for current vol,
    # and the 120-day average of 20-day vols as baseline)
    current_vol = _annualized_vol(closes, window=20)
    baseline_vols = []
    for i in range(120, 20, -5):  # sample 20 windows over the last 120 days
        if i + 20 < len(closes):
            baseline_vols.append(_annualized_vol(closes[: -i] if i else closes, window=20))
    vol_baseline = float(np.mean([v for v in baseline_vols if v > 0])) if baseline_vols else current_vol

    # Classify
    if vol_baseline > 0 and current_vol > vol_baseline * HIGH_VOL_MULTIPLIER:
        regime = "HIGH_VOL"
        reasoning = (
            f"Realized vol {current_vol:.1f}% > {HIGH_VOL_MULTIPLIER}x baseline ({vol_baseline:.1f}%) "
            f"— extreme moves dominate signal quality"
        )
    elif nifty_close > sma_50 > sma_200:
        regime = "BULL"
        reasoning = f"Nifty {nifty_close:.0f} > 50 SMA {sma_50:.0f} > 200 SMA {sma_200:.0f}"
    elif nifty_close < sma_50 < sma_200:
        regime = "BEAR"
        reasoning = f"Nifty {nifty_close:.0f} < 50 SMA {sma_50:.0f} < 200 SMA {sma_200:.0f}"
    else:
        # Mixed signals → sideways. Check if price is hugging 50 SMA.
        dist_from_sma50 = abs(nifty_close - sma_50) / sma_50 * 100
        regime = "SIDEWAYS"
        if dist_from_sma50 < SIDEWAYS_BAND_PCT:
            reasoning = f"Price within {dist_from_sma50:.1f}% of 50 SMA — choppy oscillation"
        else:
            reasoning = (
                f"Mixed trend: Nifty {nifty_close:.0f}, 50 SMA {sma_50:.0f}, 200 SMA {sma_200:.0f} "
                f"— SMAs not aligned"
            )

    return {
        "date": target.isoformat(),
        "regime": regime,
        "nifty_close": round(nifty_close, 2),
        "sma_50": round(sma_50, 2),
        "sma_200": round(sma_200, 2),
        "annualized_vol_pct": round(current_vol, 2),
        "vol_baseline_pct": round(vol_baseline, 2),
        "reasoning": reasoning,
    }


def get_current_regime() -> dict:
    """Convenience wrapper for today's regime."""
    return classify_regime_for_date(date.today())


# --- Caching layer (avoid hammering yfinance for the same date) ---

_REGIME_CACHE: dict[str, dict] = {}


def get_cached_regime(target_date: date) -> dict:
    """Cached regime lookup — historical dates never change so this is safe."""
    key = target_date.isoformat()
    if key in _REGIME_CACHE:
        return _REGIME_CACHE[key]
    result = classify_regime_for_date(target_date)
    if result.get("regime") != "UNKNOWN":
        _REGIME_CACHE[key] = result
    return result
