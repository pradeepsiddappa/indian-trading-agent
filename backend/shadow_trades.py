"""Shadow Trades — counterfactual learning.

Every time the recommender produces a STRONG BUY (or HIGH-confidence BUY), we
auto-record it here as a 'shadow trade' regardless of whether the user clicked
Track. After 1/3/5/10 trading days, we backfill the actual price moves.

Why this matters:
- Currently we only learn from trades the user opened. Every STRONG BUY they
  ignored is hidden data.
- After 30 days you can compare:
    - Shadow trades win rate (recommender's ground truth)
    - User-tracked trades win rate
  If shadows > user-tracked, the user is filtering out winners.
- If the user systematically ignores certain tickers/sectors, this surfaces
  whether that filter actually helps.

Idempotency: PRIMARY KEY (ticker, signal_date) means calling recommend()
multiple times in a day only records one shadow per ticker.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Optional

from backend.db import get_db


# Conviction thresholds for which picks get shadow-tracked.
SHADOW_TRACKED_SIGNALS = {"STRONG BUY", "BUY"}  # Plus we require HIGH or MEDIUM confidence
SHADOW_MIN_CONFIDENCE = {"HIGH", "MEDIUM"}


def record_shadow_trades_from_recommendations(recs: dict) -> dict:
    """Save STRONG BUYs and HIGH/MEDIUM-conf BUYs as shadow trades.

    Args:
        recs: the dict returned by `recommender.recommend()`. Expected to
            have keys "strong_buys" and "buys", each a list of pick dicts.
    """
    today = date.today().isoformat()
    candidates: list[dict] = []
    for r in (recs.get("strong_buys") or []):
        if (r.get("confidence") or "").upper() in SHADOW_MIN_CONFIDENCE:
            candidates.append(r)
    for r in (recs.get("buys") or []):
        if (r.get("confidence") or "").upper() == "HIGH":
            # Only HIGH-conviction BUYs get shadow-tracked (MEDIUM BUYs are too noisy)
            candidates.append(r)

    if not candidates:
        return {"recorded": 0, "skipped_existing": 0}

    # Look up which user paper_trades exist for today (for the user_tracked flag)
    with get_db() as conn:
        existing_user_tickers = {
            r["ticker"] for r in conn.execute(
                "SELECT DISTINCT ticker FROM paper_trades WHERE entry_date = ?", (today,),
            ).fetchall()
        }
        existing_shadow_tickers = {
            r["ticker"] for r in conn.execute(
                "SELECT ticker FROM shadow_trades WHERE signal_date = ?", (today,),
            ).fetchall()
        }

    recorded = 0
    skipped = 0

    # Get current regime once (same for every shadow trade today)
    try:
        from backend.market_regime import get_current_regime
        current_regime = get_current_regime().get("regime")
    except Exception:
        current_regime = None

    for pick in candidates:
        ticker = pick.get("ticker")
        entry_price = pick.get("price") or pick.get("close")
        if not ticker or not entry_price:
            skipped += 1
            continue
        if ticker in existing_shadow_tickers:
            skipped += 1
            continue

        triggered = pick.get("signals")
        if triggered and not isinstance(triggered, str):
            triggered = json.dumps(triggered)

        with get_db() as conn:
            try:
                conn.execute(
                    """INSERT OR IGNORE INTO shadow_trades
                    (ticker, signal_date, signal, score, confidence, success_probability,
                     triggered_signals, regime_at_entry, entry_price, user_tracked)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        ticker,
                        today,
                        pick.get("direction"),
                        pick.get("score"),
                        pick.get("confidence"),
                        pick.get("success_probability"),
                        triggered,
                        current_regime,
                        float(entry_price),
                        1 if ticker in existing_user_tickers else 0,
                    ),
                )
                recorded += 1
            except Exception:
                skipped += 1

    return {"recorded": recorded, "skipped_existing": skipped, "total_candidates": len(candidates)}


def refresh_shadow_prices() -> dict:
    """Backfill 1/3/5/10-day prices + P&L for shadow trades."""
    from backend.simulation import _price_n_days_later
    from backend.utils.ticker import normalize_ticker

    with get_db() as conn:
        rows = conn.execute(
            """SELECT ticker, signal_date, entry_price,
                      price_1d, price_3d, price_5d, price_10d
               FROM shadow_trades
               ORDER BY signal_date DESC"""
        ).fetchall()

    today = date.today()
    updated = 0
    for r in rows:
        try:
            entry_date = datetime.fromisoformat(r["signal_date"]).date()
            days_since = (today - entry_date).days
        except Exception:
            continue

        symbol = normalize_ticker(r["ticker"])
        updates = {}
        for horizon_label, days in [("1d", 1), ("3d", 3), ("5d", 5), ("10d", 10)]:
            if days_since < days:
                continue
            existing = r[f"price_{horizon_label}"]
            if existing is not None:
                continue
            price = _price_n_days_later(symbol, r["signal_date"], days)
            if price is None:
                continue
            updates[f"price_{horizon_label}"] = price
            entry_p = r["entry_price"]
            if entry_p:
                pnl_pct = (price - entry_p) / entry_p * 100
                updates[f"pnl_{horizon_label}_pct"] = round(pnl_pct, 3)

        if updates:
            updates["updated_at"] = datetime.now().isoformat(timespec="seconds")
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            params = list(updates.values()) + [r["ticker"], r["signal_date"]]
            with get_db() as conn:
                conn.execute(
                    f"UPDATE shadow_trades SET {set_clause} "
                    f"WHERE ticker = ? AND signal_date = ?",
                    params,
                )
            updated += 1

    return {"status": "ok", "scanned": len(rows), "updated": updated}


def list_shadow_trades(window_days: int = 90, only_ripe: bool = False) -> list[dict]:
    """Return shadow trades within the lookback window.

    Args:
        only_ripe: if True, only include trades with at least 5d P&L recorded.
    """
    with get_db() as conn:
        rows = conn.execute(
            f"""SELECT * FROM shadow_trades
                WHERE signal_date >= date('now', '-{int(window_days)} days')
                ORDER BY signal_date DESC, ticker ASC"""
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        if only_ripe and d.get("pnl_5d_pct") is None:
            continue
        if d.get("triggered_signals"):
            try:
                d["triggered_signals"] = json.loads(d["triggered_signals"])
            except Exception:
                pass
        out.append(d)
    return out


def shadow_vs_user_comparison(window_days: int = 90) -> dict:
    """Compare recommender ground-truth (all shadow trades) vs user-tracked subset.

    Reveals false negatives: shadow win rate > user-tracked win rate means
    the user is systematically skipping winners.
    """
    with get_db() as conn:
        rows = conn.execute(
            f"""SELECT signal, confidence, user_tracked,
                       pnl_1d_pct, pnl_3d_pct, pnl_5d_pct, pnl_10d_pct
                FROM shadow_trades
                WHERE signal_date >= date('now', '-{int(window_days)} days')
                  AND pnl_5d_pct IS NOT NULL"""
        ).fetchall()

    def stats(subset: list) -> dict:
        n = len(subset)
        if n == 0:
            return {"n": 0, "win_rate_5d": None, "avg_return_5d_pct": None,
                    "median_return_5d_pct": None}
        returns = sorted([r["pnl_5d_pct"] for r in subset])
        wins = sum(1 for r in subset if r["pnl_5d_pct"] > 0)
        avg = sum(returns) / n
        med = returns[n // 2]
        return {
            "n": n,
            "win_rate_5d": round(wins / n, 3),
            "avg_return_5d_pct": round(avg, 3),
            "median_return_5d_pct": round(med, 3),
        }

    all_shadow = list(rows)
    tracked_by_user = [r for r in rows if r["user_tracked"] == 1]
    skipped_by_user = [r for r in rows if r["user_tracked"] == 0]
    strong_buys = [r for r in rows if (r["signal"] or "").upper() == "STRONG BUY"]
    high_conf_buys = [r for r in rows if (r["signal"] or "").upper() == "BUY"
                      and (r["confidence"] or "").upper() == "HIGH"]

    s_all = stats(all_shadow)
    s_tracked = stats(tracked_by_user)
    s_skipped = stats(skipped_by_user)
    s_strong = stats(strong_buys)
    s_buy_high = stats(high_conf_buys)

    # Filter quality verdict
    if s_skipped["n"] >= 5 and s_tracked["n"] >= 5:
        delta = (s_skipped["win_rate_5d"] or 0) - (s_tracked["win_rate_5d"] or 0)
        if delta > 0.10:
            verdict = "filter_hurts"  # user is skipping winners
            verdict_msg = (
                f"Skipped picks won {s_skipped['win_rate_5d']:.0%}, tracked picks won "
                f"{s_tracked['win_rate_5d']:.0%}. You're filtering out winners — "
                f"trust the recommender more."
            )
        elif delta < -0.10:
            verdict = "filter_helps"
            verdict_msg = (
                f"Skipped picks won {s_skipped['win_rate_5d']:.0%}, tracked picks won "
                f"{s_tracked['win_rate_5d']:.0%}. Your filtering is adding value — "
                f"keep being selective."
            )
        else:
            verdict = "filter_neutral"
            verdict_msg = (
                "Skipped and tracked picks have similar win rates — your filter is "
                "neither helping nor hurting (yet)."
            )
    else:
        verdict = "insufficient_data"
        verdict_msg = "Need at least 5 tracked + 5 skipped picks for a verdict."

    return {
        "lookback_days": window_days,
        "all_shadow": s_all,
        "tracked_by_user": s_tracked,
        "skipped_by_user": s_skipped,
        "strong_buys": s_strong,
        "high_conf_buys": s_buy_high,
        "filter_verdict": verdict,
        "filter_message": verdict_msg,
    }
