"""Deterministic, read-only equity portfolio review calculations."""

from collections import defaultdict
from datetime import date, datetime
import uuid

from backend.db import save_equity_portfolio_review

ACTION_HOLD = "HOLD"
ACTION_WATCH = "WATCH"
ACTION_REVIEW = "REVIEW"
ACTION_TRIM = "TRIM_CONSIDER"
ACTION_EXIT = "EXIT_REVIEW"


def _safe_pct(numerator: float, denominator: float) -> float:
    return numerator / denominator * 100 if denominator else 0.0


def _sector_for(ticker: str) -> str:
    try:
        from backend.concentration import get_sector_for_ticker
        return get_sector_for_ticker(ticker)
    except Exception:
        return "Other"


def _recommendation_for(ticker: str) -> dict:
    try:
        from backend.recommender import _analyze_stock
        result = _analyze_stock(ticker)
        if not result:
            return {"available": False, "reason": "No market signal available"}
        return {
            "available": True, "direction": result.get("direction"), "score": result.get("score"),
            "confidence": result.get("confidence"),
            "success_probability": result.get("success_probability"),
            "signals": (result.get("signals") or [])[:5],
        }
    except Exception:
        return {"available": False, "reason": "Market signal unavailable"}


def _choose_action(holding: dict, recommendation: dict) -> tuple[str, list[str]]:
    reasons = []
    pnl_pct = float(holding.get("pnl_pct") or 0)
    allocation_pct = float(holding.get("allocation_pct") or 0)
    quantity = float(holding.get("quantity") or 0)
    direction = (recommendation.get("direction") or "").upper() if recommendation.get("available") else ""
    score = float(recommendation.get("score") or 0)
    if quantity <= 0:
        return ACTION_WATCH, ["Zero quantity row; keep only as a watch item."]
    if direction == "STRONG SELL" and pnl_pct <= -8:
        return ACTION_EXIT, ["Strongly bearish signal while position is in drawdown."]
    if direction in {"SELL", "STRONG SELL"}:
        return ACTION_REVIEW, [f"Current market signal is {direction}."]
    if pnl_pct <= -15:
        return ACTION_REVIEW, [f"Drawdown is {pnl_pct:.1f}%."]
    if allocation_pct >= 30:
        return ACTION_TRIM, [f"Single holding is {allocation_pct:.1f}% of portfolio."]
    if allocation_pct >= 20 and pnl_pct >= 20:
        return ACTION_TRIM, ["Large winner with meaningful portfolio weight."]
    if direction in {"BUY", "STRONG BUY"} and score >= 2:
        return ACTION_HOLD, [f"Market signal supports holding ({direction})."]
    if abs(pnl_pct) < 3 and not direction:
        return ACTION_WATCH, ["Near cost without a fresh market signal."]
    return ACTION_HOLD, ["No urgent risk flag detected."]


def build_equity_portfolio_review(holdings: list[dict], enrich: bool = True, max_enriched: int = 25) -> dict:
    """Build a review from already selected holdings; never fetches a broker."""
    holdings = list(holdings or [])
    total_invested = round(sum(float(h.get("invested_value") or 0) for h in holdings), 2)
    total_current = round(sum(float(h.get("current_value") or 0) for h in holdings), 2)
    total_pnl = round(sum(float(h.get("pnl") or 0) for h in holdings), 2)
    total_day_pnl = round(sum(float(h.get("day_change") or 0) * float(h.get("quantity") or 0) for h in holdings), 2)
    total_pnl_pct = round(_safe_pct(total_pnl, total_invested), 2)
    day_pnl_pct = round(_safe_pct(total_day_pnl, total_current - total_day_pnl), 2)
    enrich_symbols = {
        h.get("tradingsymbol") for h in sorted(
            holdings, key=lambda item: abs(float(item.get("current_value") or 0)), reverse=True
        )[:max_enriched]
    } if enrich else set()

    by_sector = defaultdict(lambda: {"value": 0.0, "count": 0, "holdings": []})
    enriched = []
    for source in holdings:
        ticker = (source.get("tradingsymbol") or "").upper()
        current_value = float(source.get("current_value") or 0)
        row = {
            **source, "tradingsymbol": ticker, "sector": _sector_for(ticker),
            "allocation_pct": round(_safe_pct(current_value, total_current), 2),
            "recommendation": _recommendation_for(ticker) if ticker in enrich_symbols and current_value > 0
            else {"available": False, "reason": "Enrichment skipped for fast review"},
        }
        row["action"], row["reasons"] = _choose_action(row, row["recommendation"])
        enriched.append(row)
        by_sector[row["sector"]]["value"] += current_value
        by_sector[row["sector"]]["count"] += 1
        by_sector[row["sector"]]["holdings"].append(ticker)

    sector_allocation = sorted(({
        "sector": sector, "value": round(data["value"], 2),
        "allocation_pct": round(_safe_pct(data["value"], total_current), 2),
        "count": data["count"], "holdings": sorted(data["holdings"]),
    } for sector, data in by_sector.items()), key=lambda item: -item["allocation_pct"])
    high_risk = [row for row in enriched if row["action"] in {ACTION_REVIEW, ACTION_TRIM, ACTION_EXIT}]
    warnings = [
        f"{row['tradingsymbol']} is {row['allocation_pct']:.1f}% of portfolio."
        for row in enriched if float(row.get("allocation_pct") or 0) >= 20
    ] + [
        f"{sector['sector']} sector is {sector['allocation_pct']:.1f}% of portfolio."
        for sector in sector_allocation if sector["allocation_pct"] >= 35
    ]
    status = "EMPTY" if not enriched else ("REVIEW_NEEDED" if high_risk else "STABLE")
    direction = "up" if total_pnl >= 0 else "down"
    plain = "No equity holdings found in local positions." if total_current <= 0 else (
        f"Portfolio is {direction} {abs(total_pnl_pct):.2f}% overall. "
        + ("No urgent position-level review flags." if not high_risk else f"{len(high_risk)} holding(s) need review.")
    )
    insights = {
        "portfolio_status": status, "plain_summary": plain,
        "action_counts": {action: sum(row["action"] == action for row in enriched)
                           for action in (ACTION_HOLD, ACTION_WATCH, ACTION_REVIEW, ACTION_TRIM, ACTION_EXIT)},
        "high_risk_holdings": [
            {key: row[key] for key in ("tradingsymbol", "action", "pnl_pct", "allocation_pct", "reasons")}
            for row in high_risk
        ],
        "concentration_warnings": warnings,
    }
    return {
        "review_id": str(uuid.uuid4()), "review_date": date.today().isoformat(),
        "holdings": enriched,
        "summary": {
            # Keep both names while clients migrate from the positions view's
            # terminology to the portfolio page's holdings terminology.
            "total_holdings": len(enriched), "total_positions": len(enriched),
            "total_invested": total_invested,
            "total_current": total_current, "total_pnl": total_pnl,
            "total_pnl_pct": total_pnl_pct, "total_day_pnl": total_day_pnl,
            "day_pnl_pct": day_pnl_pct,
            "sector_allocation": sector_allocation,
            "top_winners": _compact_holdings(
                sorted(enriched, key=lambda row: float(row.get("pnl_pct") or 0), reverse=True)[:5]
            ),
            "top_losers": _compact_holdings(
                sorted(enriched, key=lambda row: float(row.get("pnl_pct") or 0))[:5]
            ),
        },
        "insights": insights,
        "model_metadata": {
            "mode": "fast_summary", "engine": "local_positions_recommender",
            "expensive_deep_analysis": False, "generated_at": datetime.now().isoformat(timespec="seconds"),
        },
    }


def _compact_holdings(holdings: list[dict]) -> list[dict]:
    return [
        {
            "tradingsymbol": holding.get("tradingsymbol"),
            "pnl": holding.get("pnl"),
            "pnl_pct": holding.get("pnl_pct"),
            "allocation_pct": holding.get("allocation_pct"),
            "action": holding.get("action"),
        }
        for holding in holdings
    ]


def create_and_save_review(holdings: list[dict], enrich: bool = True) -> dict:
    review = build_equity_portfolio_review(holdings, enrich=enrich)
    save_equity_portfolio_review(review)
    return review
