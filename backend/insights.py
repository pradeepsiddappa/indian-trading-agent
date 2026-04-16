"""Learning Insights — analyzes past trades (paper + real) to surface patterns.

Pure statistical analysis, no ML training. Helps user identify:
- Which signals work best for THEM
- Which market conditions their strategy fails in
- When confidence levels are reliable vs noise
- Seasonal patterns in their trading results
- Ticker-specific wins/losses

All FREE — no AI API calls.
"""

from datetime import datetime
from collections import defaultdict
from backend.db import list_paper_trades, get_analysis_history, get_analysis


MIN_SAMPLES = 3  # Minimum trades in a group for insight to be considered meaningful


def _load_all_trades() -> list[dict]:
    """Merge paper trades and real trades into unified format."""
    trades = []

    # Paper trades
    for pt in list_paper_trades():
        entry = pt.get("entry_price")
        # Use 5d P&L as primary measure, fall back to 3d or 1d
        pnl = pt.get("pnl_5d_pct") or pt.get("pnl_3d_pct") or pt.get("pnl_1d_pct")
        if entry is None or pnl is None:
            continue

        outcome = "win" if pnl > 0 else "loss" if pnl < 0 else "breakeven"
        trades.append({
            "source": "paper",
            "source_detail": pt.get("source", "manual"),
            "strategy": pt.get("strategy"),
            "ticker": pt.get("ticker"),
            "direction": pt.get("direction"),
            "signal": pt.get("signal"),
            "score": pt.get("score"),
            "confidence": pt.get("confidence"),
            "success_probability": pt.get("success_probability"),
            "triggered_signals": pt.get("triggered_signals") or [],
            "entry_date": pt.get("entry_date"),
            "entry_price": entry,
            "pnl_pct": pnl,
            "outcome": outcome,
            "id": f"paper-{pt.get('id')}",
        })

    # Real analysis trades with logged P&L
    for ah in get_analysis_history(limit=500):
        pnl = ah.get("pnl_pct")
        status = ah.get("pnl_status")
        if pnl is None or not status or status in ("open", "pending"):
            continue
        trades.append({
            "source": "real",
            "source_detail": "ai_analysis",
            "strategy": "AI Multi-Agent Pipeline",
            "ticker": ah.get("ticker"),
            "direction": None,  # derived from signal
            "signal": ah.get("signal"),
            "score": None,
            "confidence": None,
            "success_probability": None,
            "triggered_signals": [],
            "entry_date": ah.get("trade_date") or ah.get("created_at"),
            "entry_price": ah.get("entry_price"),
            "pnl_pct": pnl,
            "outcome": status if status in ("win", "loss", "breakeven") else ("win" if pnl > 0 else "loss"),
            "id": f"real-{ah.get('task_id')}",
        })

    return trades


def _compute_group_stats(group: list[dict]) -> dict:
    """Compute win rate + avg return for a group of trades."""
    if not group:
        return {"count": 0, "wins": 0, "losses": 0, "win_rate": 0, "avg_return": 0, "best": 0, "worst": 0}
    wins = sum(1 for t in group if t["outcome"] == "win")
    losses = sum(1 for t in group if t["outcome"] == "loss")
    returns = [t["pnl_pct"] for t in group if t.get("pnl_pct") is not None]
    avg = sum(returns) / len(returns) if returns else 0
    return {
        "count": len(group),
        "wins": wins,
        "losses": losses,
        "win_rate": round(wins / len(group) * 100, 1) if len(group) > 0 else 0,
        "avg_return": round(avg, 2),
        "best": round(max(returns), 2) if returns else 0,
        "worst": round(min(returns), 2) if returns else 0,
    }


def _classify_insight(stats: dict, baseline_win_rate: float) -> tuple[str, str]:
    """Classify an insight based on its stats. Returns (type, label)."""
    win_rate = stats["win_rate"]
    avg = stats["avg_return"]
    count = stats["count"]

    if count < MIN_SAMPLES:
        return "insufficient", "Not enough data"

    # Strong signal
    if win_rate >= 65 and avg > 1:
        return "strength", "Strong edge — trust this"
    if win_rate >= 55 and avg > 0.5:
        return "positive", "Works for you"

    # Weakness
    if win_rate < 40 or avg < -1:
        return "weakness", "Avoid or fade"
    if win_rate < 50 and avg < 0:
        return "caution", "Marginal — be selective"

    # Around baseline
    return "neutral", "Average performance"


def analyze_trades() -> dict:
    """Main entry point — computes all learning insights."""
    trades = _load_all_trades()
    total = len(trades)

    if total < MIN_SAMPLES:
        return {
            "ok": False,
            "total_trades": total,
            "message": f"Need at least {MIN_SAMPLES} closed trades with P&L to generate insights. Log more P&L data or wait for paper trades to mature (5+ days).",
            "insights": [],
        }

    # Overall baseline
    overall = _compute_group_stats(trades)
    baseline_win_rate = overall["win_rate"]

    insights = []

    # === 1. BY SIGNAL TYPE ===
    by_signal: dict[str, list] = defaultdict(list)
    for t in trades:
        sig = t.get("signal")
        if sig:
            by_signal[sig].append(t)

    for sig, group in by_signal.items():
        stats = _compute_group_stats(group)
        if stats["count"] < MIN_SAMPLES:
            continue
        insight_type, label = _classify_insight(stats, baseline_win_rate)
        insights.append({
            "category": "Signal Type",
            "name": sig,
            "description": _describe_signal_insight(sig, stats, insight_type),
            "stats": stats,
            "type": insight_type,
            "label": label,
            "actionable_tip": _tip_for_signal(sig, insight_type, stats),
        })

    # === 2. BY CONFIDENCE ===
    by_confidence: dict[str, list] = defaultdict(list)
    for t in trades:
        conf = t.get("confidence")
        if conf:
            by_confidence[conf].append(t)

    for conf, group in by_confidence.items():
        stats = _compute_group_stats(group)
        if stats["count"] < MIN_SAMPLES:
            continue
        insight_type, label = _classify_insight(stats, baseline_win_rate)
        insights.append({
            "category": "Confidence Level",
            "name": f"{conf} confidence",
            "description": f"{stats['count']} trades with {conf} confidence: {stats['win_rate']}% win rate, {stats['avg_return']:+.2f}% avg return.",
            "stats": stats,
            "type": insight_type,
            "label": label,
            "actionable_tip": _tip_for_confidence(conf, insight_type, stats),
        })

    # === 3. BY SOURCE/STRATEGY ===
    by_strategy: dict[str, list] = defaultdict(list)
    for t in trades:
        key = t.get("strategy") or t.get("source_detail") or "manual"
        by_strategy[key].append(t)

    for strategy, group in by_strategy.items():
        stats = _compute_group_stats(group)
        if stats["count"] < MIN_SAMPLES:
            continue
        insight_type, label = _classify_insight(stats, baseline_win_rate)
        insights.append({
            "category": "Strategy",
            "name": strategy,
            "description": f"{stats['count']} trades from {strategy}: {stats['win_rate']}% win rate, {stats['avg_return']:+.2f}% avg return.",
            "stats": stats,
            "type": insight_type,
            "label": label,
            "actionable_tip": _tip_for_strategy(strategy, insight_type, stats),
        })

    # === 4. BY MONTH (seasonality) ===
    by_month: dict[int, list] = defaultdict(list)
    for t in trades:
        if t.get("entry_date"):
            try:
                date_str = str(t["entry_date"]).split("T")[0].split(" ")[0]
                m = datetime.strptime(date_str, "%Y-%m-%d").month
                by_month[m].append(t)
            except Exception:
                pass

    month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    for m, group in by_month.items():
        stats = _compute_group_stats(group)
        if stats["count"] < MIN_SAMPLES:
            continue
        insight_type, label = _classify_insight(stats, baseline_win_rate)
        # Only flag notable months
        if insight_type in ("strength", "weakness", "positive"):
            insights.append({
                "category": "Seasonality",
                "name": month_names[m - 1],
                "description": f"{stats['count']} trades entered in {month_names[m - 1]}: {stats['win_rate']}% win rate, {stats['avg_return']:+.2f}% avg return.",
                "stats": stats,
                "type": insight_type,
                "label": label,
                "actionable_tip": _tip_for_month(month_names[m - 1], insight_type, stats),
            })

    # === 5. BY TICKER (frequently traded) ===
    by_ticker: dict[str, list] = defaultdict(list)
    for t in trades:
        if t.get("ticker"):
            by_ticker[t["ticker"]].append(t)

    ticker_insights = []
    for ticker, group in by_ticker.items():
        stats = _compute_group_stats(group)
        if stats["count"] < MIN_SAMPLES:
            continue
        insight_type, label = _classify_insight(stats, baseline_win_rate)
        ticker_insights.append({
            "category": "Ticker",
            "name": ticker,
            "description": f"{stats['count']} trades on {ticker}: {stats['win_rate']}% win rate, {stats['avg_return']:+.2f}% avg return.",
            "stats": stats,
            "type": insight_type,
            "label": label,
            "actionable_tip": _tip_for_ticker(ticker, insight_type, stats),
        })

    # Sort tickers by win rate × sample size (most meaningful first), limit to top 10
    ticker_insights.sort(key=lambda x: -(x["stats"]["win_rate"] * x["stats"]["count"]))
    insights.extend(ticker_insights[:10])

    # === 6. BY TRIGGERED SIGNAL TYPE (which individual indicators work) ===
    signal_type_stats: dict[str, list] = defaultdict(list)
    for t in trades:
        for ts in t.get("triggered_signals", []):
            if isinstance(ts, dict) and ts.get("type"):
                signal_type_stats[ts["type"]].append(t)

    for sig_type, group in signal_type_stats.items():
        # A single trade may have multiple signals; we dedupe by trade ID
        unique = {t["id"]: t for t in group}.values()
        unique = list(unique)
        stats = _compute_group_stats(unique)
        if stats["count"] < MIN_SAMPLES:
            continue
        insight_type, label = _classify_insight(stats, baseline_win_rate)
        if insight_type in ("strength", "weakness", "positive", "caution"):
            insights.append({
                "category": "Indicator",
                "name": sig_type,
                "description": f"{stats['count']} trades triggered '{sig_type}': {stats['win_rate']}% win rate, {stats['avg_return']:+.2f}% avg return.",
                "stats": stats,
                "type": insight_type,
                "label": label,
                "actionable_tip": _tip_for_indicator(sig_type, insight_type, stats),
            })

    # === 7. DIRECTION (long vs short) ===
    longs = [t for t in trades if t.get("direction") == "LONG"]
    shorts = [t for t in trades if t.get("direction") == "SHORT"]
    for label_dir, group in [("LONG", longs), ("SHORT", shorts)]:
        stats = _compute_group_stats(group)
        if stats["count"] < MIN_SAMPLES:
            continue
        insight_type, label = _classify_insight(stats, baseline_win_rate)
        insights.append({
            "category": "Direction",
            "name": label_dir,
            "description": f"{stats['count']} {label_dir} trades: {stats['win_rate']}% win rate, {stats['avg_return']:+.2f}% avg return.",
            "stats": stats,
            "type": insight_type,
            "label": label,
            "actionable_tip": f"Your {label_dir} bias is {'strong' if stats['win_rate'] >= 55 else 'weak' if stats['win_rate'] < 45 else 'neutral'}.",
        })

    # Sort all insights: strengths first, weaknesses second, positive/caution third, neutral last
    type_order = {"strength": 0, "weakness": 1, "positive": 2, "caution": 3, "neutral": 4, "insufficient": 5}
    insights.sort(key=lambda x: (type_order.get(x["type"], 9), -x["stats"].get("count", 0)))

    return {
        "ok": True,
        "total_trades": total,
        "overall": overall,
        "insights": insights,
        "summary": _generate_summary(insights, overall),
    }


def _describe_signal_insight(sig: str, stats: dict, insight_type: str) -> str:
    return f"{stats['count']} trades with '{sig}' signal: {stats['win_rate']}% win rate, {stats['avg_return']:+.2f}% avg return. Best: {stats['best']:+.2f}%, Worst: {stats['worst']:+.2f}%."


def _tip_for_signal(sig: str, insight_type: str, stats: dict) -> str:
    if insight_type == "strength":
        return f"'{sig}' is a high-probability signal for you. Consider increasing position size on these setups."
    if insight_type == "weakness":
        return f"'{sig}' is underperforming. Either skip these or consider fading them (do the opposite)."
    if insight_type == "caution":
        return f"'{sig}' is marginal. Only take if confirmed by at least 2 other signals."
    if insight_type == "positive":
        return f"'{sig}' works for you. Continue taking these with standard position sizing."
    return f"'{sig}' is near baseline — no clear edge yet, gather more data."


def _tip_for_confidence(conf: str, insight_type: str, stats: dict) -> str:
    if conf == "LOW" and insight_type in ("weakness", "caution"):
        return "LOW confidence signals aren't working. Only act on MEDIUM+ confidence picks."
    if conf == "HIGH" and insight_type == "strength":
        return "HIGH confidence picks are very reliable for you. These should be your primary trades."
    if conf == "MEDIUM" and insight_type in ("positive", "strength"):
        return "MEDIUM confidence picks are profitable. Combine with other confirmations for best results."
    return f"{conf} confidence performance is {stats['win_rate']}%, baseline comparison needed with more data."


def _tip_for_strategy(strategy: str, insight_type: str, stats: dict) -> str:
    if insight_type == "strength":
        return f"{strategy} is your best-performing source. Prioritize picks from this."
    if insight_type == "weakness":
        return f"{strategy} is losing money for you. Stop using it or retrain the approach."
    if insight_type == "caution":
        return f"{strategy} is underwhelming. Diversify across other strategies."
    return f"{strategy} performs at expected level."


def _tip_for_month(month: str, insight_type: str, stats: dict) -> str:
    if insight_type == "strength":
        return f"{month} is historically strong for your trading. Go aggressive this month."
    if insight_type == "weakness":
        return f"{month} is your weakest month. Reduce position sizes or trade less."
    return f"{month} performs normally for you."


def _tip_for_ticker(ticker: str, insight_type: str, stats: dict) -> str:
    if insight_type == "strength":
        return f"You read {ticker} well — {stats['win_rate']}% win rate over {stats['count']} trades. Keep trading it."
    if insight_type == "weakness":
        return f"You lose money on {ticker} ({stats['win_rate']}% win rate). Consider avoiding or paper-trading more before live."
    if insight_type == "caution":
        return f"{ticker} is hit-or-miss for you. Wait for stronger setups."
    return f"{ticker} performance is average."


def _tip_for_indicator(indicator: str, insight_type: str, stats: dict) -> str:
    if insight_type == "strength":
        return f"When '{indicator}' fires, you have a strong edge. Make this a primary filter."
    if insight_type == "weakness":
        return f"'{indicator}' is a poor signal for your trades. Down-weight it or ignore it."
    if insight_type == "caution":
        return f"'{indicator}' is weak — require additional confirmation before acting."
    return f"'{indicator}' performs at baseline."


def _generate_summary(insights: list[dict], overall: dict) -> dict:
    """Generate a top-level summary of key findings."""
    strengths = [i for i in insights if i["type"] == "strength"]
    weaknesses = [i for i in insights if i["type"] == "weakness"]

    key_findings = []

    if overall["win_rate"] >= 55:
        key_findings.append(f"Overall win rate ({overall['win_rate']}%) is above random — your approach is working.")
    elif overall["win_rate"] < 45:
        key_findings.append(f"Overall win rate ({overall['win_rate']}%) is below random — something's off. Review your losing trades.")
    else:
        key_findings.append(f"Overall win rate ({overall['win_rate']}%) is near random — need more data or better filters.")

    if strengths:
        top = strengths[0]
        key_findings.append(f"Your strongest edge: {top['name']} in {top['category']} — {top['stats']['win_rate']}% win rate over {top['stats']['count']} trades.")

    if weaknesses:
        top_weak = weaknesses[0]
        key_findings.append(f"Biggest weakness: {top_weak['name']} in {top_weak['category']} — only {top_weak['stats']['win_rate']}% win rate. Consider avoiding.")

    return {
        "strength_count": len(strengths),
        "weakness_count": len(weaknesses),
        "key_findings": key_findings,
    }
