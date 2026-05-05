"""Per-signal performance analyzer + auto-tuner.

Reads closed paper_trades, explodes the JSON `triggered_signals` array,
and computes per-signal-type win rate, average return, and a Wilson lower
bound for honest small-sample estimation.

Then suggests new weights for the recommender's DEFAULT_WEIGHTS dict so
the system can learn from its own track record.

Design choices:
- A trade with N signals contributes 1 observation to each signal type
  (multi-attribution — every signal present gets credit/blame).
- Win = pnl_5d_pct > 0 for LONG (BUY/STRONG BUY), < 0 for SHORT.
  We default to using `direction` if present; otherwise infer from signal.
- Suggested weight uses Wilson lower bound at 80% CI to avoid swinging
  on tiny samples. Sign of weight is preserved (a bullish signal stays
  bullish; if its win rate is bad, magnitude shrinks toward 0, but it
  doesn't flip to bearish).
"""

from __future__ import annotations

import json
import math
from typing import Optional

from backend.db import get_db, get_setting, set_setting


# Maps the human-readable signal `type` field to the recommender's
# DEFAULT_WEIGHTS key. Must stay in sync with backend/recommender.py.
SIGNAL_TYPE_TO_KEY = {
    "Gap Up (Filled)": "gap_up_filled",
    "Gap Up (Unfilled)": "gap_up_open",
    "Gap Down (Filled - Reversal)": "gap_down_filled",
    "Gap Down (Unfilled)": "gap_down_open",
    "Volume Spike (Bullish)": "volume_bullish",
    "Volume Spike (Bearish)": "volume_bearish",
    "Breakout (Volume Confirmed)": "breakout_vol_confirmed",
    "Breakout (Weak Volume)": "breakout_weak",
    "Breakdown Below Support": "breakdown_support",
    "Near Major Support": "near_support",
    "Near Major Resistance": "near_resistance",
    "RSI Oversold": "rsi_oversold",
    "RSI Overbought": "rsi_overbought",
    "Cyclical (Bullish Month)": "cyclical_bullish",
    "Cyclical (Bearish Month)": "cyclical_bearish",
    "Strong Uptrend": "uptrend_strong",
    "Strong Downtrend": "downtrend_strong",
}

# Minimum trades required before we'll suggest a weight change.
# Below this, we report stats but mark them as "insufficient data".
MIN_SAMPLE_SIZE = 10

# Settings key under which tuned weights are persisted (JSON dict).
TUNED_WEIGHTS_KEY = "recommender_tuned_weights"

# Settings key for conditional per-regime overrides (Tier 4.1)
# Shape: {"BULL": {"volume_bullish": 2.4, ...}, "BEAR": {...}, "SIDEWAYS": {...}, "HIGH_VOL": {...}}
REGIME_WEIGHTS_KEY = "recommender_regime_weights"


def _wilson_lower_bound(wins: int, n: int, z: float = 1.28) -> float:
    """Wilson score lower bound at confidence z (1.28 = 80% CI).

    Returns 0.0 for n=0. Always in [0, 1].
    """
    if n <= 0:
        return 0.0
    p = wins / n
    denom = 1 + z * z / n
    center = p + z * z / (2 * n)
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * n)) / n)
    return max(0.0, (center - margin) / denom)


def _is_win_for_signal(signal_direction: str, pnl_5d_pct: float) -> bool:
    """A bullish signal 'wins' when the trade goes up; bearish when it goes down.

    `direction` on signal is one of: BULLISH | BEARISH | FADE.
    FADE is a contrarian sell signal (e.g., unfilled gap that should fade).
    """
    if pnl_5d_pct is None:
        return False
    d = (signal_direction or "").upper()
    if d == "BULLISH":
        return pnl_5d_pct > 0
    if d in ("BEARISH", "FADE"):
        return pnl_5d_pct < 0
    # Unknown direction — treat as neutral (never a win, but also doesn't count)
    return False


def compute_signal_performance_by_regime(window_days: int = 180) -> dict:
    """Per-signal win rate split by market regime at entry.

    Reveals signals whose effectiveness is regime-conditional:
        - 'Near Major Support' might win 70% in BULL but only 35% in BEAR
        - 'Volume Spike (Bullish)' might work everywhere except HIGH_VOL
        - etc.

    Returns:
        {
            "lookback_days": 180,
            "regimes": ["BULL", "BEAR", "SIDEWAYS", "HIGH_VOL"],
            "by_signal": [
                {
                    "signal_type": "Volume Spike (Bullish)",
                    "weight_key": "volume_bullish",
                    "by_regime": {
                        "BULL":     {"n": 12, "wins": 9,  "win_rate": 0.75, "avg_return_5d_pct": 1.6},
                        "BEAR":     {"n": 4,  "wins": 1,  "win_rate": 0.25, "avg_return_5d_pct": -0.8},
                        "SIDEWAYS": {"n": 7,  "wins": 4,  "win_rate": 0.57, "avg_return_5d_pct": 0.2},
                        "HIGH_VOL": {"n": 0,  ...},
                    },
                    "regime_spread": 0.50,  // max - min win rate
                    "is_regime_dependent": true,  // spread > 0.20 with n>=5 in 2+ regimes
                },
                ...
            ]
        }
    """
    from backend.recommender import DEFAULT_WEIGHTS
    from backend.db import _migrate_paper_trades_columns
    import json

    # Ensure regime_at_entry column exists (safe no-op if migration already ran)
    _migrate_paper_trades_columns()

    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT direction, signal, pnl_5d_pct, triggered_signals,
                   entry_date, regime_at_entry
            FROM paper_trades
            WHERE pnl_5d_pct IS NOT NULL
              AND triggered_signals IS NOT NULL
              AND regime_at_entry IS NOT NULL
              AND entry_date >= date('now', '-{int(window_days)} days')
            """
        ).fetchall()

    REGIMES = ["BULL", "BEAR", "SIDEWAYS", "HIGH_VOL"]

    # signal_key -> regime -> {wins, n, return_sum, label}
    agg: dict[str, dict[str, dict]] = {}

    for r in rows:
        regime = r["regime_at_entry"]
        if regime not in REGIMES:
            continue
        try:
            triggered = json.loads(r["triggered_signals"]) if r["triggered_signals"] else []
        except Exception:
            triggered = []
        if not isinstance(triggered, list):
            continue

        pnl = r["pnl_5d_pct"]
        if pnl is None:
            continue

        seen_in_trade: set[str] = set()
        for sig in triggered:
            if not isinstance(sig, dict):
                continue
            sig_type = sig.get("type")
            sig_dir = sig.get("direction")
            if not sig_type or sig_type in seen_in_trade:
                continue
            seen_in_trade.add(sig_type)

            key = SIGNAL_TYPE_TO_KEY.get(sig_type)
            if not key:
                continue

            sig_bucket = agg.setdefault(key, {})
            r_bucket = sig_bucket.setdefault(
                regime, {"wins": 0, "n": 0, "return_sum": 0.0, "label": sig_type}
            )
            won = _is_win_for_signal(sig_dir, pnl)
            r_bucket["n"] += 1
            r_bucket["return_sum"] += pnl
            if won:
                r_bucket["wins"] += 1

    out_signals = []
    for key, default_w in DEFAULT_WEIGHTS.items():
        sig_bucket = agg.get(key, {})
        label = (next(iter(sig_bucket.values()))["label"]
                 if sig_bucket else _key_to_label(key))
        by_regime = {}
        win_rates_with_n = []  # for spread calc — only regimes with n>=5
        total_n = 0
        for regime in REGIMES:
            r = sig_bucket.get(regime)
            if not r:
                by_regime[regime] = {"n": 0, "wins": 0, "win_rate": None,
                                     "avg_return_5d_pct": None}
                continue
            n = r["n"]
            total_n += n
            avg_ret = r["return_sum"] / n if n else 0.0
            wr = r["wins"] / n if n else 0.0
            by_regime[regime] = {
                "n": n,
                "wins": r["wins"],
                "win_rate": round(wr, 3),
                "avg_return_5d_pct": round(avg_ret, 3),
            }
            if n >= 5:
                win_rates_with_n.append(wr)

        if len(win_rates_with_n) >= 2:
            spread = round(max(win_rates_with_n) - min(win_rates_with_n), 3)
            is_dependent = spread > 0.20
        else:
            spread = None
            is_dependent = False

        if total_n == 0:
            continue  # signal never fired in tagged trades — skip from output

        out_signals.append({
            "signal_type": label,
            "weight_key": key,
            "current_weight": round(default_w, 2),
            "total_n": total_n,
            "by_regime": by_regime,
            "regime_spread": spread,
            "is_regime_dependent": is_dependent,
        })

    out_signals.sort(key=lambda s: (-(s["regime_spread"] or 0), -s["total_n"]))

    return {
        "lookback_days": window_days,
        "regimes": REGIMES,
        "by_signal": out_signals,
        "total_tagged_trades": len(rows),
    }


def compute_signal_performance(window_days: int = 90) -> dict:
    """Aggregate per-signal stats over closed paper_trades in the lookback window.

    Returns:
        {
            "lookback_days": int,
            "total_closed_trades": int,
            "signals": [
                {
                    "signal_type": "Volume Spike (Bullish)",
                    "weight_key": "volume_bullish",
                    "current_weight": 2.0,
                    "n": 23,
                    "wins": 16,
                    "losses": 7,
                    "win_rate": 0.696,
                    "wilson_lower_80": 0.561,
                    "avg_return_5d_pct": 1.84,
                    "suggested_weight": 2.4,
                    "delta": +0.4,
                    "verdict": "TUNE_UP" | "TUNE_DOWN" | "KEEP" | "INSUFFICIENT_DATA",
                },
                ...
            ],
        }
    """
    from backend.recommender import DEFAULT_WEIGHTS

    # Pull closed trades with non-null 5d P&L
    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT direction, signal, pnl_5d_pct, triggered_signals, entry_date
            FROM paper_trades
            WHERE pnl_5d_pct IS NOT NULL
              AND triggered_signals IS NOT NULL
              AND entry_date >= date('now', '-{int(window_days)} days')
            """
        ).fetchall()

    total_closed = len(rows)

    # signal_key -> {wins, losses, total, return_sum, signal_type_label}
    agg: dict[str, dict] = {}

    for r in rows:
        try:
            triggered = json.loads(r["triggered_signals"]) if r["triggered_signals"] else []
        except Exception:
            triggered = []
        if not isinstance(triggered, list):
            continue

        pnl = r["pnl_5d_pct"]
        if pnl is None:
            continue

        # De-duplicate signals within a single trade (in case the same type appears twice)
        seen_types_in_trade: set[str] = set()
        for sig in triggered:
            if not isinstance(sig, dict):
                continue
            sig_type = sig.get("type")
            sig_dir = sig.get("direction")
            if not sig_type or sig_type in seen_types_in_trade:
                continue
            seen_types_in_trade.add(sig_type)

            key = SIGNAL_TYPE_TO_KEY.get(sig_type)
            if not key:
                continue

            bucket = agg.setdefault(
                key,
                {"wins": 0, "losses": 0, "n": 0, "return_sum": 0.0, "label": sig_type},
            )
            won = _is_win_for_signal(sig_dir, pnl)
            bucket["n"] += 1
            bucket["return_sum"] += pnl
            if won:
                bucket["wins"] += 1
            else:
                bucket["losses"] += 1

    # Build per-signal report
    out_signals = []
    for key, default_w in DEFAULT_WEIGHTS.items():
        bucket = agg.get(key)
        label = bucket["label"] if bucket else _key_to_label(key)
        n = bucket["n"] if bucket else 0
        wins = bucket["wins"] if bucket else 0
        losses = bucket["losses"] if bucket else 0
        avg_ret = (bucket["return_sum"] / n) if (bucket and n) else 0.0
        win_rate = (wins / n) if n else 0.0
        wilson = _wilson_lower_bound(wins, n)

        if n < MIN_SAMPLE_SIZE:
            suggested = default_w
            verdict = "INSUFFICIENT_DATA"
        else:
            suggested = _suggest_weight(default_w, wilson)
            delta = suggested - default_w
            if abs(delta) < 0.25:
                verdict = "KEEP"
            elif delta > 0 and default_w >= 0:
                verdict = "TUNE_UP"
            elif delta < 0 and default_w >= 0:
                verdict = "TUNE_DOWN"
            elif delta < 0 and default_w < 0:
                # weight is negative; suggested even more negative = stronger bearish
                verdict = "TUNE_UP"
            else:
                verdict = "TUNE_DOWN"

        out_signals.append({
            "signal_type": label,
            "weight_key": key,
            "current_weight": round(default_w, 2),
            "n": n,
            "wins": wins,
            "losses": losses,
            "win_rate": round(win_rate, 3),
            "wilson_lower_80": round(wilson, 3),
            "avg_return_5d_pct": round(avg_ret, 3),
            "suggested_weight": round(suggested, 2),
            "delta": round(suggested - default_w, 2),
            "verdict": verdict,
        })

    # Sort: most-traded signals first, then by absolute delta
    out_signals.sort(key=lambda s: (-s["n"], -abs(s["delta"])))

    return {
        "lookback_days": window_days,
        "total_closed_trades": total_closed,
        "min_sample_size": MIN_SAMPLE_SIZE,
        "signals": out_signals,
    }


def _suggest_weight(current: float, wilson_lower: float) -> float:
    """Map Wilson lower-bound win rate to a suggested weight.

    Logic:
    - Baseline win rate is 0.50. If wilson > 0.50 the signal is *honestly* good.
    - Scale magnitude by (wilson - 0.30) / 0.20 so wilson=0.50 → 1.0x current
      and wilson=0.70 → 2.0x current.
    - Preserve sign of current weight (bullish stays bullish).
    - Clip magnitude to [0.0, 3.5] to avoid runaway.
    """
    if current == 0:
        return 0.0
    sign = 1 if current > 0 else -1
    magnitude = abs(current)
    # Scaling: wilson=0.30 → 0x, 0.50 → 1x, 0.70 → 2x, capped at 0..2.5
    scale = (wilson_lower - 0.30) / 0.20
    scale = max(0.0, min(2.5, scale))
    new_mag = magnitude * scale
    new_mag = max(0.0, min(3.5, new_mag))
    return round(sign * new_mag, 2)


def _key_to_label(key: str) -> str:
    """Best-effort reverse lookup for display when no trades hit this signal yet."""
    for label, k in SIGNAL_TYPE_TO_KEY.items():
        if k == key:
            return label
    return key


# --- Tuned weight persistence ---

def get_tuned_weights() -> dict[str, float]:
    """Return user-applied weight overrides from settings, or empty dict."""
    raw = get_setting(TUNED_WEIGHTS_KEY)
    if not raw:
        return {}
    try:
        d = json.loads(raw)
        if isinstance(d, dict):
            return {k: float(v) for k, v in d.items()}
    except Exception:
        pass
    return {}


def apply_tuned_weights(window_days: int = 90, only_keys: Optional[list[str]] = None) -> dict:
    """Compute signal performance and persist suggested weights to settings.

    If `only_keys` is provided, only those keys are tuned (others stay at default).
    Returns the active tuned weights after the update.
    """
    perf = compute_signal_performance(window_days=window_days)
    new_weights = get_tuned_weights()  # start from existing overrides
    applied = []
    for s in perf["signals"]:
        if s["verdict"] == "INSUFFICIENT_DATA":
            continue
        if only_keys is not None and s["weight_key"] not in only_keys:
            continue
        if s["delta"] == 0:
            continue
        new_weights[s["weight_key"]] = s["suggested_weight"]
        applied.append({
            "key": s["weight_key"],
            "from": s["current_weight"],
            "to": s["suggested_weight"],
            "delta": s["delta"],
            "n": s["n"],
            "win_rate": s["win_rate"],
        })

    set_setting(TUNED_WEIGHTS_KEY, json.dumps(new_weights))
    return {"applied": applied, "active_overrides": new_weights}


def reset_tuned_weights() -> None:
    """Clear all weight overrides — recommender falls back to DEFAULT_WEIGHTS."""
    set_setting(TUNED_WEIGHTS_KEY, None)


def get_active_weights() -> dict[str, float]:
    """Return DEFAULT_WEIGHTS merged with any user-applied tuned overrides.

    The recommender should call this at the start of every `recommend()` run
    so signal weights stay in sync with the latest tuning.
    """
    from backend.recommender import DEFAULT_WEIGHTS
    merged = dict(DEFAULT_WEIGHTS)
    merged.update(get_tuned_weights())
    return merged


# --- Conditional per-regime weights (Tier 4.1) ---

# Min sample size per regime before a regime-specific override is suggested.
# Lower than MIN_SAMPLE_SIZE (10) because regime data is sparser.
MIN_SAMPLE_PER_REGIME = 5

# Don't override unless the regime's Wilson-bounded win rate differs from 0.5
# by more than this. Otherwise the regime is uninformative for that signal.
REGIME_OVERRIDE_THRESHOLD = 0.10


def compute_regime_conditional_weights(window_days: int = 180) -> dict:
    """For each signal × regime, suggest a regime-specific weight.

    Returns:
        {
            "lookback_days": 180,
            "by_regime": {
                "BULL":     {"volume_bullish": {"current": 2.0, "suggested": 2.6,
                                                "n": 12, "wins": 9, "win_rate": 0.75,
                                                "wilson": 0.56, "verdict": "OVERRIDE"}},
                "BEAR":     {"volume_bullish": {..., "verdict": "OVERRIDE_DOWN"}},
                "SIDEWAYS": {...},
                "HIGH_VOL": {...},
            },
            "summary": {
                "BULL": {"override_count": 3, "trades_observed": 18},
                ...
            }
        }
    """
    from backend.recommender import DEFAULT_WEIGHTS
    perf = compute_signal_performance_by_regime(window_days=window_days)

    out_by_regime: dict[str, dict] = {}
    summary: dict[str, dict] = {}
    base_tuned = get_tuned_weights()

    for sig in perf["by_signal"]:
        key = sig["weight_key"]
        # Use the user's tuned base if present, else the default.
        base_weight = base_tuned.get(key, sig["current_weight"])

        for regime, stats in sig["by_regime"].items():
            n = stats.get("n", 0)
            if n < MIN_SAMPLE_PER_REGIME:
                continue
            wins = stats.get("wins", 0)
            wilson = _wilson_lower_bound(wins, n)
            wr = stats.get("win_rate", 0) or 0

            # Only override if the regime materially shifts win rate
            if abs(wilson - 0.5) < REGIME_OVERRIDE_THRESHOLD:
                continue

            suggested = _suggest_weight(base_weight, wilson)
            delta = suggested - base_weight
            if abs(delta) < 0.25:
                continue  # not a meaningful change

            verdict = "OVERRIDE_UP" if delta > 0 and base_weight >= 0 else \
                      "OVERRIDE_DOWN" if delta < 0 and base_weight >= 0 else \
                      "OVERRIDE_DOWN" if delta > 0 and base_weight < 0 else \
                      "OVERRIDE_UP"

            out_by_regime.setdefault(regime, {})[key] = {
                "current": round(base_weight, 2),
                "suggested": round(suggested, 2),
                "delta": round(delta, 2),
                "n": n,
                "wins": wins,
                "win_rate": round(wr, 3),
                "wilson_lower_80": round(wilson, 3),
                "avg_return_5d_pct": stats.get("avg_return_5d_pct"),
                "verdict": verdict,
            }

    # Build summary counts
    for regime in ("BULL", "BEAR", "SIDEWAYS", "HIGH_VOL"):
        regime_overrides = out_by_regime.get(regime, {})
        summary[regime] = {
            "override_count": len(regime_overrides),
        }

    return {
        "lookback_days": window_days,
        "min_sample_per_regime": MIN_SAMPLE_PER_REGIME,
        "by_regime": out_by_regime,
        "summary": summary,
    }


def get_regime_weights() -> dict[str, dict[str, float]]:
    """Load persisted per-regime weight overrides from settings."""
    raw = get_setting(REGIME_WEIGHTS_KEY)
    if not raw:
        return {}
    try:
        d = json.loads(raw)
        if isinstance(d, dict):
            # Coerce inner values to float
            return {regime: {k: float(v) for k, v in (overrides or {}).items()}
                    for regime, overrides in d.items()}
    except Exception:
        pass
    return {}


def apply_regime_weights(window_days: int = 180,
                          only_regimes: Optional[list[str]] = None) -> dict:
    """Compute conditional regime weights and persist them to settings."""
    suggestions = compute_regime_conditional_weights(window_days=window_days)
    new_regime_weights = get_regime_weights()  # start from existing
    applied_per_regime: dict[str, list] = {}

    for regime, overrides in suggestions["by_regime"].items():
        if only_regimes is not None and regime not in only_regimes:
            continue
        applied_per_regime[regime] = []
        regime_dict = new_regime_weights.setdefault(regime, {})
        for key, info in overrides.items():
            regime_dict[key] = info["suggested"]
            applied_per_regime[regime].append({
                "key": key, "to": info["suggested"], "delta": info["delta"],
                "n": info["n"], "win_rate": info["win_rate"],
            })

    set_setting(REGIME_WEIGHTS_KEY, json.dumps(new_regime_weights))
    return {"applied": applied_per_regime, "active_regime_weights": new_regime_weights}


def reset_regime_weights() -> None:
    """Clear all per-regime overrides — falls back to base tuned weights."""
    set_setting(REGIME_WEIGHTS_KEY, None)


def get_active_weights_for_regime(regime: Optional[str]) -> dict[str, float]:
    """Resolve the full weight dict for a given regime.

    Layered merge: DEFAULT_WEIGHTS -> base tuned -> regime overrides.
    If `regime` is None or unknown, returns the base tuned dict (no regime layer).
    """
    from backend.recommender import DEFAULT_WEIGHTS
    merged = dict(DEFAULT_WEIGHTS)
    merged.update(get_tuned_weights())
    if regime:
        regime_overrides = get_regime_weights().get(regime, {})
        merged.update(regime_overrides)
    return merged
