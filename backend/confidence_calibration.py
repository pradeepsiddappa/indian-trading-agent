"""Confidence Calibration — measures whether the recommender's stated
`success_probability` is honest.

The recommendation engine outputs a `success_probability` (e.g., 65%) for
every pick. This module checks: when the engine says 65%, do the trades
actually win 65% of the time? Or is it overconfident (says 65%, wins 50%)?

Two metrics:

1. **Brier score** — single-number sharpness/calibration measure:
       brier = mean((predicted_prob - actual_outcome)²)
   Lower is better. Range [0, 1]. Reference points:
       - 0.00 perfect prediction
       - 0.25 always predicting 50% (uninformative)
       - >0.30 worse than random for two-class problems

2. **Reliability bins** — bucket trades by predicted probability into bands
   (e.g., 50-60%, 60-70%, ...) and compare bucket-mean prediction vs actual
   win rate. Flags overconfidence (predicted > actual) or underconfidence.

Win definition: a trade "wins" when its 5-day P&L is positive.
We use 5-day because that's the horizon the success_probability is implicitly
tuned for (most signals predict ~1 week directional moves).
"""

from __future__ import annotations

from typing import Optional

from backend.db import get_db


# Bin edges for the reliability diagram (probabilities as 0..1)
BIN_EDGES = [0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.01]


def _bin_label(low: float, high: float) -> str:
    return f"{int(low * 100)}-{int(min(high, 1.0) * 100)}%"


def _bucket(p: float) -> Optional[tuple[float, float]]:
    """Return (low, high) for the bin containing probability p, or None if out of range."""
    for i in range(len(BIN_EDGES) - 1):
        lo, hi = BIN_EDGES[i], BIN_EDGES[i + 1]
        if lo <= p < hi:
            return (lo, hi)
    return None


def compute_calibration(window_days: int = 180) -> dict:
    """Compute Brier score + reliability bins over closed paper_trades.

    Returns:
        {
            "lookback_days": 180,
            "n": 47,
            "brier_score": 0.224,
            "brier_baseline_50": 0.250,    // brier you'd get always predicting 50%
            "brier_improvement_pct": 10.4,  // (baseline - actual) / baseline * 100
            "calibration_quality": "fair" | "good" | "excellent" | "poor",
            "overall_predicted_avg": 0.62,
            "overall_actual_win_rate": 0.55,
            "calibration_gap": -0.07,       // actual - predicted (< 0 = overconfident)
            "verdict": "overconfident" | "underconfident" | "well_calibrated",
            "bins": [
                {
                    "label": "60-70%",
                    "low": 0.60, "high": 0.70,
                    "n": 12,
                    "predicted_avg": 0.64,
                    "actual_win_rate": 0.50,
                    "gap": -0.14,
                },
                ...
            ],
        }
    """
    with get_db() as conn:
        rows = conn.execute(
            f"""
            SELECT success_probability, pnl_5d_pct, direction
            FROM paper_trades
            WHERE pnl_5d_pct IS NOT NULL
              AND success_probability IS NOT NULL
              AND entry_date >= date('now', '-{int(window_days)} days')
            """
        ).fetchall()

    if not rows:
        return {
            "lookback_days": window_days,
            "n": 0,
            "brier_score": None,
            "brier_baseline_50": 0.25,
            "brier_improvement_pct": None,
            "calibration_quality": "no_data",
            "overall_predicted_avg": None,
            "overall_actual_win_rate": None,
            "calibration_gap": None,
            "verdict": "no_data",
            "bins": [
                {"label": _bin_label(BIN_EDGES[i], BIN_EDGES[i + 1]),
                 "low": BIN_EDGES[i], "high": BIN_EDGES[i + 1],
                 "n": 0, "predicted_avg": None,
                 "actual_win_rate": None, "gap": None}
                for i in range(len(BIN_EDGES) - 1)
            ],
        }

    # Convert each row to (predicted_prob, actual_outcome) where actual is 0/1
    observations = []
    for r in rows:
        pred = (r["success_probability"] or 0) / 100.0
        if pred <= 0 or pred >= 1:
            # Skip degenerate values (the engine should never emit these but defend)
            continue
        # Win = trade made money. paper_trades.pnl_5d_pct is signed P&L for the
        # position direction (LONG: positive when price up, SHORT: positive when
        # price down). So pnl > 0 always means "trade was correct".
        outcome = 1 if r["pnl_5d_pct"] > 0 else 0
        observations.append((pred, outcome))

    n = len(observations)
    if n == 0:
        return {
            "lookback_days": window_days,
            "n": 0,
            "brier_score": None,
            "calibration_quality": "no_valid_data",
            "verdict": "no_data",
            "bins": [],
        }

    # Brier score
    brier = sum((p - o) ** 2 for p, o in observations) / n
    brier_baseline = 0.25  # always predicting 50%
    brier_improvement = (brier_baseline - brier) / brier_baseline * 100 if brier_baseline > 0 else 0

    # Calibration quality bands
    if brier <= 0.15:
        quality = "excellent"
    elif brier <= 0.20:
        quality = "good"
    elif brier <= 0.25:
        quality = "fair"
    else:
        quality = "poor"

    # Bin observations
    bin_aggs: dict[tuple[float, float], dict] = {}
    for i in range(len(BIN_EDGES) - 1):
        bin_aggs[(BIN_EDGES[i], BIN_EDGES[i + 1])] = {
            "pred_sum": 0.0, "outcome_sum": 0, "n": 0,
        }

    for pred, outcome in observations:
        bucket = _bucket(pred)
        if bucket is None:
            continue
        agg = bin_aggs[bucket]
        agg["pred_sum"] += pred
        agg["outcome_sum"] += outcome
        agg["n"] += 1

    bins_out = []
    for (lo, hi), agg in bin_aggs.items():
        bn = agg["n"]
        if bn == 0:
            bins_out.append({
                "label": _bin_label(lo, hi),
                "low": lo, "high": hi,
                "n": 0,
                "predicted_avg": None,
                "actual_win_rate": None,
                "gap": None,
            })
            continue
        pred_avg = agg["pred_sum"] / bn
        actual_wr = agg["outcome_sum"] / bn
        bins_out.append({
            "label": _bin_label(lo, hi),
            "low": lo, "high": hi,
            "n": bn,
            "predicted_avg": round(pred_avg, 3),
            "actual_win_rate": round(actual_wr, 3),
            "gap": round(actual_wr - pred_avg, 3),
        })

    bins_out.sort(key=lambda b: b["low"])

    # Overall stats
    overall_pred = sum(p for p, _ in observations) / n
    overall_actual = sum(o for _, o in observations) / n
    overall_gap = overall_actual - overall_pred

    if overall_gap < -0.05:
        verdict = "overconfident"
    elif overall_gap > 0.05:
        verdict = "underconfident"
    else:
        verdict = "well_calibrated"

    return {
        "lookback_days": window_days,
        "n": n,
        "brier_score": round(brier, 4),
        "brier_baseline_50": brier_baseline,
        "brier_improvement_pct": round(brier_improvement, 2),
        "calibration_quality": quality,
        "overall_predicted_avg": round(overall_pred, 3),
        "overall_actual_win_rate": round(overall_actual, 3),
        "calibration_gap": round(overall_gap, 3),
        "verdict": verdict,
        "bins": bins_out,
    }
