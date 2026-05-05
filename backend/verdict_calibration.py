"""Daily Verdict calibration — measures whether the headline filter actually predicted Nifty's move.

Workflow:
1. Once per trading day, snapshot the current verdict + Nifty close (`snapshot_today`).
2. After 1/3/5 trading days, fill in forward Nifty closes and classify the outcome.
3. Aggregate accuracy per verdict bucket so we know if RED days actually fall and
   GREEN days actually rise (`compute_calibration`).

Outcome rules (per horizon, e.g., 1d):
- GREEN  predicts UP    → correct if Nifty return > +0.10%, wrong if < -0.10%, else neutral
- RED    predicts DOWN  → correct if Nifty return < -0.10%, wrong if > +0.10%, else neutral
- YELLOW is "no edge"   → correct if abs(return) <= 0.50% (a quiet day matches the call)

The thresholds are intentionally generous to avoid penalizing the verdict for
sub-0.1% noise. Tune later from data.
"""

from __future__ import annotations

import json
from datetime import date, datetime, timedelta
from typing import Optional

import yfinance as yf

from backend.db import get_db


NIFTY_SYMBOL = "^NSEI"

# Move thresholds for outcome classification (percent)
DIRECTIONAL_NOISE_FLOOR = 0.10   # below this, GREEN/RED gets "neutral"
QUIET_DAY_CEILING = 0.50         # above this, YELLOW is wrong (it called for quiet but market moved)


# --- Snapshotting ---

def snapshot_today(force: bool = False) -> dict:
    """Save today's verdict + Nifty close. Idempotent: skips if already snapshotted.

    Args:
        force: if True, overwrite any existing snapshot for today.
    """
    today = date.today().isoformat()

    with get_db() as conn:
        if not force:
            existing = conn.execute(
                "SELECT snapshot_date FROM verdict_history WHERE snapshot_date = ?",
                (today,),
            ).fetchone()
            if existing:
                return {"status": "skipped", "reason": "already snapshotted today", "date": today}

    # Compute current verdict
    try:
        from backend.daily_verdict import compute_daily_verdict
        verdict_data = compute_daily_verdict()
    except Exception as e:
        return {"status": "error", "reason": f"verdict compute failed: {e}"}

    # Get Nifty close
    nifty_close = _get_nifty_close_for_date(today)

    with get_db() as conn:
        conn.execute(
            """INSERT OR REPLACE INTO verdict_history
            (snapshot_date, verdict, label, action,
             caution_count, favorable_count, caution_flags, favorable_flags,
             position_size_pct, max_trades_today, min_conviction,
             nifty_close, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))""",
            (
                today,
                verdict_data.get("verdict"),
                verdict_data.get("label"),
                verdict_data.get("action"),
                len(verdict_data.get("caution_flags") or []),
                len(verdict_data.get("favorable_flags") or []),
                json.dumps(verdict_data.get("caution_flags") or []),
                json.dumps(verdict_data.get("favorable_flags") or []),
                verdict_data.get("recommended_position_size_pct"),
                verdict_data.get("max_trades_today"),
                verdict_data.get("min_conviction_required"),
                nifty_close,
            ),
        )

    return {"status": "ok", "date": today, "verdict": verdict_data.get("verdict"), "nifty_close": nifty_close}


def _get_nifty_close_for_date(d: str) -> Optional[float]:
    """Fetch Nifty close for a given date. Returns None if market closed/holiday."""
    try:
        target = datetime.fromisoformat(d).date()
        # Pull a small window around the date to handle weekends/holidays
        start = target - timedelta(days=5)
        end = target + timedelta(days=2)
        hist = yf.Ticker(NIFTY_SYMBOL).history(start=start.isoformat(), end=end.isoformat())
        if hist.empty:
            return None
        # Match exact date; fall back to most recent prior trading day
        for idx, row in hist.iterrows():
            if idx.date() == target:
                return float(row["Close"])
        # Latest close <= target (handles weekends — snapshot taken on Sunday uses Friday)
        before = hist[hist.index.date <= target]
        if not before.empty:
            return float(before.iloc[-1]["Close"])
    except Exception:
        pass
    return None


# --- Backfill forward Nifty returns ---

def backfill_outcomes(max_age_days: int = 30) -> dict:
    """Fill in forward Nifty closes + outcomes for snapshots that are now ripe.

    A snapshot is "ripe at horizon N" when N trading days have passed since the
    snapshot date. We approximate trading days as N + ceil(N/5)*2 calendar days
    for safety, then read whatever yfinance returns.
    """
    today = date.today()
    cutoff = (today - timedelta(days=max_age_days)).isoformat()

    with get_db() as conn:
        rows = conn.execute(
            """SELECT snapshot_date, verdict, nifty_close,
                      nifty_close_1d, nifty_close_3d, nifty_close_5d
               FROM verdict_history
               WHERE snapshot_date >= ?
               ORDER BY snapshot_date""",
            (cutoff,),
        ).fetchall()

    updated = 0
    for r in rows:
        snap_date = datetime.fromisoformat(r["snapshot_date"]).date()
        if r["nifty_close"] is None:
            continue

        updates = {}
        for horizon in (1, 3, 5):
            col = f"nifty_close_{horizon}d"
            ret_col = f"nifty_return_{horizon}d_pct"
            outcome_col = f"outcome_{horizon}d"

            if r[col] is not None:
                continue  # already filled

            target = _add_trading_days(snap_date, horizon)
            if target > today:
                continue  # not ripe yet

            close = _get_nifty_close_for_date(target.isoformat())
            if close is None:
                continue

            ret_pct = (close - r["nifty_close"]) / r["nifty_close"] * 100
            outcome = _classify_outcome(r["verdict"], ret_pct)
            updates[col] = close
            updates[ret_col] = round(ret_pct, 3)
            updates[outcome_col] = outcome

        if updates:
            updates["updated_at"] = datetime.now().isoformat(timespec="seconds")
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            params = list(updates.values()) + [r["snapshot_date"]]
            with get_db() as conn:
                conn.execute(
                    f"UPDATE verdict_history SET {set_clause} WHERE snapshot_date = ?",
                    params,
                )
            updated += 1

    return {"status": "ok", "snapshots_updated": updated, "scanned": len(rows)}


def _add_trading_days(start: date, n: int) -> date:
    """Approximate `n` trading days forward (skips Sat/Sun, ignores holidays).

    Good enough for backfill ripeness checks; the actual close lookup uses
    yfinance which handles holidays correctly.
    """
    cur = start
    added = 0
    while added < n:
        cur = cur + timedelta(days=1)
        if cur.weekday() < 5:  # Mon-Fri
            added += 1
    return cur


def _classify_outcome(verdict: str, return_pct: float) -> str:
    """Was the verdict's directional call correct given the realized Nifty return?"""
    v = (verdict or "").upper()
    if v == "GREEN":
        if return_pct > DIRECTIONAL_NOISE_FLOOR:
            return "predicted_correctly"
        if return_pct < -DIRECTIONAL_NOISE_FLOOR:
            return "predicted_wrong"
        return "neutral"
    if v == "RED":
        if return_pct < -DIRECTIONAL_NOISE_FLOOR:
            return "predicted_correctly"
        if return_pct > DIRECTIONAL_NOISE_FLOOR:
            return "predicted_wrong"
        return "neutral"
    if v == "YELLOW":
        # Yellow says "no edge / quiet day" — correct if market stayed inside the band
        if abs(return_pct) <= QUIET_DAY_CEILING:
            return "predicted_correctly"
        return "predicted_wrong"
    return "neutral"


# --- Aggregation ---

def compute_calibration(window_days: int = 90) -> dict:
    """Aggregate verdict accuracy by bucket and horizon.

    Returns:
        {
            "lookback_days": 90,
            "total_snapshots": 47,
            "by_verdict": {
                "GREEN":  {"n": 12, "outcomes_1d": {...}, "outcomes_3d": {...}, "outcomes_5d": {...},
                           "avg_return_1d_pct": 0.42, "avg_return_3d_pct": 0.91, "avg_return_5d_pct": 1.34,
                           "accuracy_1d": 0.58, "accuracy_3d": 0.67, "accuracy_5d": 0.75},
                "YELLOW": {...},
                "RED":    {...},
            },
            "recent": [last 10 snapshots],
        }
    """
    cutoff = (date.today() - timedelta(days=window_days)).isoformat()

    with get_db() as conn:
        rows = conn.execute(
            """SELECT * FROM verdict_history
               WHERE snapshot_date >= ?
               ORDER BY snapshot_date DESC""",
            (cutoff,),
        ).fetchall()

    by_verdict: dict[str, dict] = {}
    for r in rows:
        v = r["verdict"] or "UNKNOWN"
        bucket = by_verdict.setdefault(v, {
            "n": 0,
            "horizons": {1: [], 3: [], 5: []},  # list of (return_pct, outcome)
        })
        bucket["n"] += 1
        for h in (1, 3, 5):
            ret = r[f"nifty_return_{h}d_pct"]
            outcome = r[f"outcome_{h}d"]
            if ret is not None and outcome is not None:
                bucket["horizons"][h].append((ret, outcome))

    out_by_verdict = {}
    for v, bucket in by_verdict.items():
        entry = {"n": bucket["n"]}
        for h, observations in bucket["horizons"].items():
            n_h = len(observations)
            if n_h == 0:
                entry[f"avg_return_{h}d_pct"] = None
                entry[f"accuracy_{h}d"] = None
                entry[f"outcomes_{h}d"] = {"correct": 0, "wrong": 0, "neutral": 0, "ripe": 0}
                continue
            avg = sum(r for r, _ in observations) / n_h
            counts = {"correct": 0, "wrong": 0, "neutral": 0}
            for _, oc in observations:
                if oc == "predicted_correctly":
                    counts["correct"] += 1
                elif oc == "predicted_wrong":
                    counts["wrong"] += 1
                else:
                    counts["neutral"] += 1
            decisive = counts["correct"] + counts["wrong"]
            accuracy = counts["correct"] / decisive if decisive else None
            entry[f"avg_return_{h}d_pct"] = round(avg, 3)
            entry[f"accuracy_{h}d"] = round(accuracy, 3) if accuracy is not None else None
            entry[f"outcomes_{h}d"] = {**counts, "ripe": n_h}
        out_by_verdict[v] = entry

    recent = []
    for r in rows[:15]:
        recent.append({
            "date": r["snapshot_date"],
            "verdict": r["verdict"],
            "label": r["label"],
            "caution_count": r["caution_count"],
            "favorable_count": r["favorable_count"],
            "caution_flags": json.loads(r["caution_flags"]) if r["caution_flags"] else [],
            "favorable_flags": json.loads(r["favorable_flags"]) if r["favorable_flags"] else [],
            "nifty_close": r["nifty_close"],
            "nifty_return_1d_pct": r["nifty_return_1d_pct"],
            "nifty_return_3d_pct": r["nifty_return_3d_pct"],
            "nifty_return_5d_pct": r["nifty_return_5d_pct"],
            "outcome_1d": r["outcome_1d"],
            "outcome_3d": r["outcome_3d"],
            "outcome_5d": r["outcome_5d"],
        })

    return {
        "lookback_days": window_days,
        "total_snapshots": len(rows),
        "by_verdict": out_by_verdict,
        "recent": recent,
    }
