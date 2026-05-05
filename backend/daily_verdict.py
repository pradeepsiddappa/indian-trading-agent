"""Daily Trading Verdict — synthesizes all filters into a single trade-or-skip decision.

Combines:
1. FII/DII flow bias
2. Today's calendar events (RBI, Fed, Budget, expiry)
3. Sector concentration risk
4. Quick recommendation count (how many high-conviction setups exist)

Outputs one of:
- GREEN ("TRADE"): aggressive day, multiple setups available
- YELLOW ("SELECTIVE"): caution, only HIGH conviction trades
- RED ("STAND DOWN"): too risky, skip or paper trade only

This is the "what should I actually do today" answer that ties everything together.
"""

from datetime import date


def compute_daily_verdict() -> dict:
    """Synthesize all market filters into a single actionable verdict.

    Returns:
        {
            "verdict": "GREEN" | "YELLOW" | "RED",
            "label": str (one-line summary),
            "action": str (what to do),
            "caution_flags": list[str],
            "favorable_flags": list[str],
            "recommended_position_size_pct": float (1.0 = full, 0.5 = half),
            "max_trades_today": int,
            "min_conviction_required": "HIGH" | "MEDIUM" | "LOW",
            "reasoning": str (multi-line explanation),
            "filter_results": {...} (raw data from each filter)
        }
    """
    caution_flags = []
    favorable_flags = []
    filter_results = {}

    # === 1. FII/DII Flow ===
    try:
        from backend.fii_dii import get_market_bias
        bias = get_market_bias()
        filter_results["fii_dii"] = bias

        if bias["bias"] == "BEARISH" and bias["confidence"] == "HIGH":
            caution_flags.append(f"FIIs heavily selling ({bias.get('today_fii_net', 0):,.0f} Cr)")
        elif bias["bias"] == "BEARISH":
            caution_flags.append(f"FIIs net sellers")
        elif bias["bias"] == "BULLISH" and bias["confidence"] == "HIGH":
            favorable_flags.append(f"FIIs heavily buying (+{bias.get('today_fii_net', 0):,.0f} Cr)")
        elif bias["bias"] == "BULLISH":
            favorable_flags.append(f"FIIs net buyers")
        elif bias["bias"] == "MIXED":
            caution_flags.append("FII/DII flows are conflicting")
    except Exception:
        filter_results["fii_dii"] = None

    # === 2. Calendar / Events ===
    try:
        from backend.calendar_data import get_today_events, get_market_events_in_range
        from datetime import timedelta
        today = date.today()
        next_3_days = get_market_events_in_range(today, today + timedelta(days=3))
        filter_results["events"] = next_3_days

        for e in next_3_days:
            e_date = date.fromisoformat(e["date"])
            days_until = (e_date - today).days

            if e["type"] == "BUDGET" and days_until <= 1:
                caution_flags.append(f"Union Budget in {days_until} day{'s' if days_until != 1 else ''}")
            elif e["type"] == "RBI_POLICY":
                if days_until == 0:
                    caution_flags.append("RBI Policy decision TODAY")
                elif days_until == 1:
                    caution_flags.append("RBI Policy tomorrow")
            elif e["type"] == "FOMC":
                if days_until == 0:
                    caution_flags.append("Fed FOMC decision TODAY")
                elif days_until <= 2:
                    caution_flags.append(f"Fed FOMC in {days_until} day{'s' if days_until != 1 else ''}")
            elif e["type"] == "FNO_EXPIRY" and days_until == 0:
                caution_flags.append("F&O monthly expiry TODAY")
    except Exception:
        filter_results["events"] = None

    # === 3. Sector Concentration ===
    try:
        from backend.concentration import get_concentration_summary
        conc = get_concentration_summary()
        filter_results["concentration"] = conc

        if conc["risk_level"] == "HIGH":
            caution_flags.append(f"Portfolio over-concentrated in {', '.join(conc.get('concentrated_sectors', []))}")
        elif conc["risk_level"] == "MEDIUM":
            caution_flags.append("Portfolio approaching sector limit")
    except Exception:
        filter_results["concentration"] = None

    # === 4. Quick scan: how many HIGH-conviction setups exist? ===
    high_conviction_count = 0
    try:
        # Lightweight check — analyze NIFTY 50 only for speed
        from backend.recommender import recommend
        recs = recommend(universe="nifty50", min_signals=2)
        filter_results["recommendation_counts"] = {
            "strong_buys": len(recs["strong_buys"]),
            "buys": len(recs["buys"]),
            "sells": len(recs["sells"]),
        }
        # Count STRONG BUYs with HIGH confidence
        for r in recs["strong_buys"]:
            if r.get("confidence") == "HIGH":
                high_conviction_count += 1

        if high_conviction_count >= 3:
            favorable_flags.append(f"{high_conviction_count} HIGH-conviction setups available")
        elif high_conviction_count == 0:
            caution_flags.append("No HIGH-conviction setups in NIFTY 50")
    except Exception as e:
        print(f"[Daily Verdict] Recommender check failed: {e}", flush=True)
        filter_results["recommendation_counts"] = None

    # === DECISION LOGIC ===
    caution_count = len(caution_flags)
    favorable_count = len(favorable_flags)

    if caution_count >= 3:
        verdict = "RED"
        label = "STAND DOWN"
        action = "Skip the day or paper trade only. Too many risk factors aligned."
        position_size = 0.0
        max_trades = 0
        min_conviction = "HIGH"
    elif caution_count >= 2:
        verdict = "RED"
        label = "STAND DOWN"
        action = "Don't open new positions. Manage existing trades only."
        position_size = 0.0
        max_trades = 0
        min_conviction = "HIGH"
    elif caution_count == 1 and favorable_count == 0:
        verdict = "YELLOW"
        label = "SELECTIVE"
        action = "Trade only HIGH conviction setups. Reduce position size to 50%."
        position_size = 0.5
        max_trades = 2
        min_conviction = "HIGH"
    elif caution_count == 1 and favorable_count >= 1:
        verdict = "YELLOW"
        label = "SELECTIVE"
        action = "Mixed signals. HIGH conviction trades only at 75% size."
        position_size = 0.75
        max_trades = 3
        min_conviction = "HIGH"
    elif favorable_count >= 2:
        verdict = "GREEN"
        label = "TRADE"
        action = "Aggressive day. Take multiple setups with full position sizing."
        position_size = 1.0
        max_trades = 5
        min_conviction = "MEDIUM"
    elif favorable_count == 1:
        verdict = "GREEN"
        label = "TRADE"
        action = "Favorable conditions. Trade normally with disciplined size."
        position_size = 1.0
        max_trades = 4
        min_conviction = "MEDIUM"
    else:
        verdict = "YELLOW"
        label = "SELECTIVE"
        action = "Quiet day, no clear edge. Trade only the best setups."
        position_size = 0.75
        max_trades = 2
        min_conviction = "HIGH"

    # Build reasoning
    reasoning_parts = []
    if caution_flags:
        reasoning_parts.append(f"Caution: {' · '.join(caution_flags)}")
    if favorable_flags:
        reasoning_parts.append(f"Favorable: {' · '.join(favorable_flags)}")
    if not reasoning_parts:
        reasoning_parts.append("Market conditions are neutral")

    reasoning = ". ".join(reasoning_parts)

    return {
        "verdict": verdict,
        "label": label,
        "action": action,
        "caution_flags": caution_flags,
        "favorable_flags": favorable_flags,
        "recommended_position_size_pct": position_size,
        "max_trades_today": max_trades,
        "min_conviction_required": min_conviction,
        "reasoning": reasoning,
        "filter_results": filter_results,
        "computed_at": date.today().strftime("%Y-%m-%d"),
    }
