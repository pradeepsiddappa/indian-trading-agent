"""Unified Recommendation Engine — combines all strategies into a ranked list of trade ideas.

For each stock in the universe:
1. Check all signals (gap, volume, breakout, S/R proximity, cyclical)
2. Score based on confluence (how many signals align)
3. Weight by historical strategy win rate
4. Return top-ranked opportunities with clear BUY/SELL/HOLD recommendations
"""

import yfinance as yf
import numpy as np
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from backend.scanner import NIFTY_50, NIFTY_100, BSE_250, UNIVERSES


# Historical win rates (baseline — will be overridden by live performance data if available)
DEFAULT_WEIGHTS = {
    "gap_up_filled": 1.5,      # Gap up that filled = strong buying
    "gap_down_filled": 1.5,    # Gap down that filled = strong buying (reversal)
    "gap_up_open": -0.5,       # Unfilled gap up = fade signal (historically 35% win rate)
    "gap_down_open": -0.5,     # Unfilled gap down = fade signal
    "volume_bullish": 2.0,     # Volume spike with green candle
    "volume_bearish": -2.0,    # Volume spike with red candle
    "breakout_vol_confirmed": 3.0,  # Best signal: 71% win rate
    "breakout_weak": 1.0,      # Breakout without volume = moderate
    "near_support": 2.0,       # Price near support = bounce candidate
    "near_resistance": -1.5,   # Price near resistance = rejection candidate
    "breakdown_support": -2.5, # Price broke below support = strong bearish
    "cyclical_bullish": 1.5,   # Current month historically bullish
    "cyclical_bearish": -1.5,  # Current month historically bearish
    "rsi_oversold": 1.5,       # RSI < 30 = oversold bounce candidate
    "rsi_overbought": -1.0,    # RSI > 70 = overbought pullback risk
    "uptrend_strong": 1.0,     # Price above 50 SMA and 200 SMA
    "downtrend_strong": -1.0,  # Price below 50 SMA and 200 SMA
}


# Live-tuned overrides loaded from the settings table at the start of each
# `recommend()` call. Defaults to a copy of DEFAULT_WEIGHTS until the
# signal_performance "Apply" endpoint persists overrides.
_ACTIVE_WEIGHTS: dict[str, float] = dict(DEFAULT_WEIGHTS)


def _refresh_active_weights() -> None:
    """Pull tuned overrides (if any) from settings into _ACTIVE_WEIGHTS.

    Three-layer merge:
        1. DEFAULT_WEIGHTS (hardcoded baseline)
        2. recommender_tuned_weights (Tier 1.1: global signal tuning)
        3. recommender_regime_weights[current_regime] (Tier 4.1: conditional)

    Layer 3 only applies if the user has persisted regime overrides AND the
    classifier returns a known regime. Falls back gracefully if either is missing.

    Imported lazily to avoid circular import (signal_performance imports
    DEFAULT_WEIGHTS from this module).
    """
    global _ACTIVE_WEIGHTS, _ACTIVE_REGIME
    try:
        from backend.signal_performance import get_active_weights_for_regime
        # Detect current regime (best-effort)
        current_regime = None
        try:
            from backend.market_regime import get_current_regime
            current_regime = (get_current_regime() or {}).get("regime")
        except Exception:
            pass
        _ACTIVE_REGIME = current_regime
        _ACTIVE_WEIGHTS = get_active_weights_for_regime(current_regime)
    except Exception:
        _ACTIVE_WEIGHTS = dict(DEFAULT_WEIGHTS)
        _ACTIVE_REGIME = None


# Tracks the regime that produced the currently-loaded weights, surfaced in
# the recommendation response so the UI can display "weights tuned for HIGH_VOL".
_ACTIVE_REGIME: str | None = None


def _compute_rsi(closes, period=14):
    """Simple RSI calculation."""
    deltas = np.diff(closes)
    seed = deltas[:period]
    up = seed[seed >= 0].sum() / period
    down = -seed[seed < 0].sum() / period
    if down == 0:
        return 100
    rs = up / down
    return 100 - 100 / (1 + rs)


def _analyze_stock(ticker: str) -> dict | None:
    """Analyze a single stock and return signals + score."""
    try:
        symbol = f"{ticker}.NS"
        t = yf.Ticker(symbol)
        hist = t.history(period="6mo")
        if hist.empty or len(hist) < 50:
            return None

        closes = hist["Close"].values
        highs = hist["High"].values
        lows = hist["Low"].values
        volumes = hist["Volume"].values

        current_close = float(closes[-1])
        current_open = float(hist.iloc[-1]["Open"])
        current_high = float(highs[-1])
        current_low = float(lows[-1])
        prev_close = float(closes[-2])
        current_volume = float(volumes[-1])
        avg_volume = float(np.mean(volumes[-20:-1]))

        signals = []
        score = 0
        direction = "NEUTRAL"

        # === GAP ANALYSIS ===
        gap_pct = (current_open - prev_close) / prev_close * 100
        if abs(gap_pct) >= 2.0:
            if gap_pct > 0:
                # Gap up
                if current_close >= prev_close:
                    score += _ACTIVE_WEIGHTS["gap_up_filled"]
                    signals.append({"type": "Gap Up (Filled)", "direction": "BULLISH", "value": f"+{gap_pct:.2f}%", "weight": _ACTIVE_WEIGHTS["gap_up_filled"]})
                else:
                    score += _ACTIVE_WEIGHTS["gap_up_open"]
                    signals.append({"type": "Gap Up (Unfilled)", "direction": "FADE", "value": f"+{gap_pct:.2f}%", "weight": _ACTIVE_WEIGHTS["gap_up_open"]})
            else:
                # Gap down
                if current_close >= prev_close:
                    # Gap down filled = bullish reversal
                    score += _ACTIVE_WEIGHTS["gap_down_filled"]
                    signals.append({"type": "Gap Down (Filled - Reversal)", "direction": "BULLISH", "value": f"{gap_pct:.2f}%", "weight": _ACTIVE_WEIGHTS["gap_down_filled"]})
                else:
                    score += _ACTIVE_WEIGHTS["gap_down_open"]
                    signals.append({"type": "Gap Down (Unfilled)", "direction": "FADE", "value": f"{gap_pct:.2f}%", "weight": _ACTIVE_WEIGHTS["gap_down_open"]})

        # === VOLUME SPIKE ===
        if avg_volume > 0:
            vol_ratio = current_volume / avg_volume
            if vol_ratio >= 2.0:
                price_change = (current_close - prev_close) / prev_close * 100
                if price_change > 0.5:
                    score += _ACTIVE_WEIGHTS["volume_bullish"]
                    signals.append({"type": "Volume Spike (Bullish)", "direction": "BULLISH", "value": f"{vol_ratio:.1f}x avg", "weight": _ACTIVE_WEIGHTS["volume_bullish"]})
                elif price_change < -0.5:
                    score += _ACTIVE_WEIGHTS["volume_bearish"]
                    signals.append({"type": "Volume Spike (Bearish)", "direction": "BEARISH", "value": f"{vol_ratio:.1f}x avg", "weight": _ACTIVE_WEIGHTS["volume_bearish"]})

        # === BREAKOUT ===
        n_day_high = float(np.max(highs[-21:-1]))  # 20-day high excluding today
        n_day_low = float(np.min(lows[-21:-1]))
        if current_high > n_day_high:
            vol_ratio = current_volume / avg_volume if avg_volume > 0 else 1
            breakout_pct = (current_close - n_day_high) / n_day_high * 100
            if vol_ratio >= 1.5:
                score += _ACTIVE_WEIGHTS["breakout_vol_confirmed"]
                signals.append({"type": "Breakout (Volume Confirmed)", "direction": "BULLISH", "value": f"+{breakout_pct:.2f}% above 20d high", "weight": _ACTIVE_WEIGHTS["breakout_vol_confirmed"]})
            else:
                score += _ACTIVE_WEIGHTS["breakout_weak"]
                signals.append({"type": "Breakout (Weak Volume)", "direction": "BULLISH", "value": f"+{breakout_pct:.2f}% above 20d high", "weight": _ACTIVE_WEIGHTS["breakout_weak"]})
        elif current_low < n_day_low:
            breakdown_pct = (current_close - n_day_low) / n_day_low * 100
            score += _ACTIVE_WEIGHTS["breakdown_support"]
            signals.append({"type": "Breakdown Below Support", "direction": "BEARISH", "value": f"{breakdown_pct:.2f}% below 20d low", "weight": _ACTIVE_WEIGHTS["breakdown_support"]})

        # === SUPPORT/RESISTANCE PROXIMITY ===
        recent_high = float(np.max(highs[-60:]))
        recent_low = float(np.min(lows[-60:]))
        distance_to_high = (recent_high - current_close) / current_close * 100
        distance_to_low = (current_close - recent_low) / current_close * 100

        if distance_to_low < 2.0:  # Within 2% of 60-day low
            score += _ACTIVE_WEIGHTS["near_support"]
            signals.append({"type": "Near Major Support", "direction": "BULLISH", "value": f"{distance_to_low:.1f}% above low", "weight": _ACTIVE_WEIGHTS["near_support"]})
        elif distance_to_high < 2.0:  # Within 2% of 60-day high
            score += _ACTIVE_WEIGHTS["near_resistance"]
            signals.append({"type": "Near Major Resistance", "direction": "BEARISH", "value": f"{distance_to_high:.1f}% below high", "weight": _ACTIVE_WEIGHTS["near_resistance"]})

        # === RSI ===
        if len(closes) >= 14:
            rsi = _compute_rsi(closes[-15:])
            if rsi < 30:
                score += _ACTIVE_WEIGHTS["rsi_oversold"]
                signals.append({"type": "RSI Oversold", "direction": "BULLISH", "value": f"RSI {rsi:.1f}", "weight": _ACTIVE_WEIGHTS["rsi_oversold"]})
            elif rsi > 70:
                score += _ACTIVE_WEIGHTS["rsi_overbought"]
                signals.append({"type": "RSI Overbought", "direction": "BEARISH", "value": f"RSI {rsi:.1f}", "weight": _ACTIVE_WEIGHTS["rsi_overbought"]})
        else:
            rsi = None

        # === CYCLICAL (MONTHLY) ===
        current_month = datetime.now().month
        hist_copy = hist.copy()
        hist_copy["Month"] = hist_copy.index.month
        hist_copy["MonthlyReturn"] = hist_copy["Close"].pct_change()
        month_data = hist_copy[hist_copy["Month"] == current_month]["MonthlyReturn"].dropna()
        if len(month_data) > 10:
            avg_month_return = float(month_data.mean() * 100)
            if avg_month_return > 0.2:
                score += _ACTIVE_WEIGHTS["cyclical_bullish"]
                signals.append({"type": "Cyclical (Bullish Month)", "direction": "BULLISH", "value": f"+{avg_month_return:.2f}% historical avg", "weight": _ACTIVE_WEIGHTS["cyclical_bullish"]})
            elif avg_month_return < -0.2:
                score += _ACTIVE_WEIGHTS["cyclical_bearish"]
                signals.append({"type": "Cyclical (Bearish Month)", "direction": "BEARISH", "value": f"{avg_month_return:.2f}% historical avg", "weight": _ACTIVE_WEIGHTS["cyclical_bearish"]})

        # === TREND (Moving Averages) ===
        if len(closes) >= 200:
            sma50 = float(np.mean(closes[-50:]))
            sma200 = float(np.mean(closes[-200:]))
            if current_close > sma50 > sma200:
                score += _ACTIVE_WEIGHTS["uptrend_strong"]
                signals.append({"type": "Strong Uptrend", "direction": "BULLISH", "value": "Price > 50 SMA > 200 SMA", "weight": _ACTIVE_WEIGHTS["uptrend_strong"]})
            elif current_close < sma50 < sma200:
                score += _ACTIVE_WEIGHTS["downtrend_strong"]
                signals.append({"type": "Strong Downtrend", "direction": "BEARISH", "value": "Price < 50 SMA < 200 SMA", "weight": _ACTIVE_WEIGHTS["downtrend_strong"]})

        # === DETERMINE OVERALL RECOMMENDATION ===
        if score >= 4.0:
            direction = "STRONG BUY"
        elif score >= 2.0:
            direction = "BUY"
        elif score <= -4.0:
            direction = "STRONG SELL"
        elif score <= -2.0:
            direction = "SELL"
        else:
            direction = "NEUTRAL"

        # Count aligned signals
        bullish_signals = [s for s in signals if s["direction"] == "BULLISH"]
        bearish_signals = [s for s in signals if s["direction"] == "BEARISH"]

        # Confidence: based on number of aligned signals AND score magnitude
        aligned_count = max(len(bullish_signals), len(bearish_signals))
        confidence = "HIGH" if aligned_count >= 4 else ("MEDIUM" if aligned_count >= 2 else "LOW")

        # Calculate estimated probability of success based on score + alignment
        # Historical baseline: 50% random, each aligned signal adds edge
        # Weights are calibrated to approximately match historical win rates
        abs_score = abs(score)
        base_prob = 50.0  # Baseline 50/50
        # Each point of score adds ~4% edge (calibrated from historical performance)
        score_edge = min(abs_score * 4, 30)
        # Aligned signals add confirmation bonus
        alignment_bonus = min(aligned_count * 2, 15)
        success_probability = round(min(base_prob + score_edge + alignment_bonus, 85), 0)
        # For neutral/conflicting, cap at baseline
        if abs_score < 2:
            success_probability = 50

        price_change_day = (current_close - prev_close) / prev_close * 100

        return {
            "ticker": ticker,
            "symbol": symbol,
            "price": round(current_close, 2),
            "change_pct": round(price_change_day, 2),
            "rsi": round(rsi, 1) if rsi else None,
            "score": round(score, 2),
            "direction": direction,
            "confidence": confidence,
            "success_probability": int(success_probability),
            "signals": signals,
            "bullish_signal_count": len(bullish_signals),
            "bearish_signal_count": len(bearish_signals),
            "near_support": round(recent_low, 2),
            "near_resistance": round(recent_high, 2),
        }
    except Exception as e:
        return None


def _apply_market_bias(result: dict, bias: dict) -> dict:
    """Apply market-wide FII/DII bias to a single stock result."""
    if not bias or bias.get("score_adjustment", 0) == 0:
        return result

    adj = bias["score_adjustment"]
    new_score = round(result["score"] + adj, 2)

    # Add FII/DII as a visible signal
    fii_signal = {
        "type": f"FII/DII Flow ({bias['bias']})",
        "direction": "BULLISH" if adj > 0 else ("BEARISH" if adj < 0 else "NEUTRAL"),
        "value": bias["reasoning"],
        "weight": adj,
    }
    result["signals"] = list(result.get("signals", [])) + [fii_signal]
    if adj > 0:
        result["bullish_signal_count"] = result.get("bullish_signal_count", 0) + 1
    elif adj < 0:
        result["bearish_signal_count"] = result.get("bearish_signal_count", 0) + 1

    # Re-classify direction based on new score
    if new_score >= 4.0:
        direction = "STRONG BUY"
    elif new_score >= 2.0:
        direction = "BUY"
    elif new_score <= -4.0:
        direction = "STRONG SELL"
    elif new_score <= -2.0:
        direction = "SELL"
    else:
        direction = "NEUTRAL"

    # Re-compute success probability with new score
    abs_score = abs(new_score)
    aligned = max(result.get("bullish_signal_count", 0), result.get("bearish_signal_count", 0))
    score_edge = min(abs_score * 4, 30)
    alignment_bonus = min(aligned * 2, 15)
    success_probability = round(min(50 + score_edge + alignment_bonus, 85), 0)
    if abs_score < 2:
        success_probability = 50

    result["score"] = new_score
    result["direction"] = direction
    result["success_probability"] = int(success_probability)
    result["market_bias_applied"] = bias["bias"]

    return result


def _apply_concentration_filter(result: dict, concentration_check: dict) -> dict:
    """Apply sector concentration penalty if adding this trade would over-expose."""
    if not concentration_check:
        return result

    sector = concentration_check.get("sector", "Other")
    result["sector"] = sector

    adj = concentration_check.get("score_adjustment", 0)
    if adj == 0:
        return result

    new_score = round(result["score"] + adj, 2)
    warnings = concentration_check.get("warnings", [])

    conc_signal = {
        "type": f"Sector Concentration ({sector})",
        "direction": "BEARISH",
        "value": "; ".join(warnings) if warnings else "Approaching sector limit",
        "weight": adj,
    }
    result["signals"] = list(result.get("signals", [])) + [conc_signal]
    result["bearish_signal_count"] = result.get("bearish_signal_count", 0) + 1
    result["concentration_warning"] = "; ".join(warnings) if warnings else None
    result["concentration_breach"] = concentration_check.get("would_breach", False)

    if new_score >= 4.0:
        direction = "STRONG BUY"
    elif new_score >= 2.0:
        direction = "BUY"
    elif new_score <= -4.0:
        direction = "STRONG SELL"
    elif new_score <= -2.0:
        direction = "SELL"
    else:
        direction = "NEUTRAL"

    abs_score = abs(new_score)
    aligned = max(result.get("bullish_signal_count", 0), result.get("bearish_signal_count", 0))
    score_edge = min(abs_score * 4, 30)
    alignment_bonus = min(aligned * 2, 15)
    success_probability = round(min(50 + score_edge + alignment_bonus, 85), 0)
    if abs_score < 2:
        success_probability = 50

    result["score"] = new_score
    result["direction"] = direction
    result["success_probability"] = int(success_probability)

    return result


def _apply_event_filter(result: dict, event_filter: dict) -> dict:
    """Apply event-based score adjustment (earnings, RBI, Budget, etc)."""
    if not event_filter or not event_filter.get("has_event"):
        return result

    adj = event_filter.get("score_adjustment", 0)
    if adj == 0:
        return result

    new_score = round(result["score"] + adj, 2)

    # Add event as a visible "signal"
    warning = event_filter.get("warning") or "Upcoming event"
    event_signal = {
        "type": f"Event Risk ({warning})",
        "direction": "BEARISH",
        "value": warning,
        "weight": adj,
    }
    result["signals"] = list(result.get("signals", [])) + [event_signal]
    result["bearish_signal_count"] = result.get("bearish_signal_count", 0) + 1
    result["event_warning"] = warning
    result["upcoming_events"] = event_filter.get("events", [])

    # Re-classify
    if new_score >= 4.0:
        direction = "STRONG BUY"
    elif new_score >= 2.0:
        direction = "BUY"
    elif new_score <= -4.0:
        direction = "STRONG SELL"
    elif new_score <= -2.0:
        direction = "SELL"
    else:
        direction = "NEUTRAL"

    abs_score = abs(new_score)
    aligned = max(result.get("bullish_signal_count", 0), result.get("bearish_signal_count", 0))
    score_edge = min(abs_score * 4, 30)
    alignment_bonus = min(aligned * 2, 15)
    success_probability = round(min(50 + score_edge + alignment_bonus, 85), 0)
    if abs_score < 2:
        success_probability = 50

    result["score"] = new_score
    result["direction"] = direction
    result["success_probability"] = int(success_probability)

    return result


def recommend(
    universe: str = "nifty100",
    min_signals: int = 2,
    apply_market_bias: bool = True,
    apply_event_filter: bool = True,
    apply_concentration_check: bool = True,
    total_capital: float = 500000,
) -> dict:
    """Run recommendation engine across a stock universe.

    Args:
        universe: nifty50, nifty100, or bse250
        min_signals: minimum number of aligned signals to recommend
        apply_market_bias: if True, FII/DII flow adjusts each stock's score
        apply_event_filter: if True, upcoming earnings/RBI/Budget penalize scores
        apply_concentration_check: if True, penalize stocks that would over-concentrate sector
        total_capital: portfolio capital for concentration % calculation
    """
    # Refresh learned weight overrides from settings before scoring any stock
    _refresh_active_weights()

    stocks = UNIVERSES.get(universe, NIFTY_100)
    all_results = []

    # Fetch FII/DII market bias once (used for all stocks)
    market_bias = None
    if apply_market_bias:
        try:
            from backend.fii_dii import get_market_bias
            market_bias = get_market_bias()
        except Exception as e:
            print(f"[Recommender] FII/DII fetch failed: {e}", flush=True)

    # Fetch market-wide events once (RBI, Fed, Budget, expiry)
    today_market_events = []
    if apply_event_filter:
        try:
            from backend.calendar_data import get_today_events, get_market_events_in_range
            from datetime import date, timedelta
            today = date.today()
            today_market_events = get_market_events_in_range(today, today + timedelta(days=2))
        except Exception as e:
            print(f"[Recommender] Calendar fetch failed: {e}", flush=True)

    # Fetch current concentration summary once
    concentration_summary = None
    if apply_concentration_check:
        try:
            from backend.concentration import get_concentration_summary
            concentration_summary = get_concentration_summary()
        except Exception as e:
            print(f"[Recommender] Concentration check failed: {e}", flush=True)

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {executor.submit(_analyze_stock, ticker): ticker for ticker in stocks}
        for f in as_completed(futures):
            result = f.result()
            if result and (result["bullish_signal_count"] >= min_signals or result["bearish_signal_count"] >= min_signals):
                # Apply market bias
                if market_bias:
                    result = _apply_market_bias(result, market_bias)
                # Apply event filter (per-ticker check)
                if apply_event_filter:
                    try:
                        from backend.calendar_data import get_event_filter_for_ticker
                        event_filter = get_event_filter_for_ticker(result["ticker"], days_ahead=2)
                        if event_filter.get("has_event"):
                            result = _apply_event_filter(result, event_filter)
                    except Exception:
                        pass
                # Apply concentration check (per-ticker, only on bullish signals)
                if apply_concentration_check and result.get("direction") in ("STRONG BUY", "BUY"):
                    try:
                        from backend.concentration import check_new_trade_concentration
                        conc_check = check_new_trade_concentration(
                            result["ticker"],
                            proposed_position_value=total_capital * 0.1,  # 10% per position assumed
                            total_capital=total_capital,
                        )
                        result = _apply_concentration_filter(result, conc_check)
                    except Exception:
                        pass
                all_results.append(result)

    # Separate by direction and sort
    strong_buys = sorted([r for r in all_results if r["direction"] == "STRONG BUY"], key=lambda x: -x["score"])
    buys = sorted([r for r in all_results if r["direction"] == "BUY"], key=lambda x: -x["score"])
    sells = sorted([r for r in all_results if r["direction"] == "SELL"], key=lambda x: x["score"])
    strong_sells = sorted([r for r in all_results if r["direction"] == "STRONG SELL"], key=lambda x: x["score"])

    # Resolve which regime overrides are currently active (for transparency in the UI)
    regime_weight_count = 0
    try:
        from backend.signal_performance import get_regime_weights
        if _ACTIVE_REGIME:
            regime_weight_count = len(get_regime_weights().get(_ACTIVE_REGIME, {}))
    except Exception:
        pass

    result = {
        "universe": universe,
        "total_analyzed": len(stocks),
        "total_with_signals": len(all_results),
        "market_bias": market_bias,
        "today_market_events": today_market_events,
        "concentration_summary": concentration_summary,
        "active_regime": _ACTIVE_REGIME,
        "regime_weight_overrides_active": regime_weight_count,
        "strong_buys": strong_buys[:20],
        "buys": buys[:20],
        "sells": sells[:20],
        "strong_sells": strong_sells[:20],
    }

    # Shadow-record every STRONG BUY + HIGH-conf BUY for counterfactual learning.
    # Idempotent (PRIMARY KEY ticker+signal_date) so multiple recommend() calls
    # in a day are safe. Best-effort, never raises.
    try:
        from backend.shadow_trades import record_shadow_trades_from_recommendations
        record_shadow_trades_from_recommendations(result)
    except Exception as e:
        print(f"[Recommender] shadow recording failed: {e}", flush=True)

    return result
