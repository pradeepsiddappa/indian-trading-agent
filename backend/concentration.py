"""Sector Concentration Checker.

Prevents the AI from over-exposing to a single sector. Critical for autonomous trading
because 5 BUY signals in one morning could all be in the same sector — making them
essentially one trade with 5x the risk.

Sources of "open positions" we track:
1. Paper trades (status='active') from simulation table
2. Open analysis trades (pnl_status='open') from analysis_history
3. Watchlist (optional — for "what if" scenarios)

Outputs:
- Current allocation %  per sector
- Warnings when proposed new trades would push concentration too high
- Score adjustment for the recommendation engine to penalize concentrated bets
"""

from collections import defaultdict
from typing import Optional
from backend.cyclical import SECTOR_MAP
from backend.db import list_paper_trades, get_analysis_history


# Build reverse map: ticker -> sector for quick lookup
TICKER_TO_SECTOR: dict[str, str] = {}
for sector_name, tickers in SECTOR_MAP.items():
    for ticker in tickers:
        TICKER_TO_SECTOR[ticker.upper()] = sector_name

# Default limits (configurable via settings table later)
DEFAULT_MAX_POSITIONS_PER_SECTOR = 3
DEFAULT_MAX_PERCENT_PER_SECTOR = 30.0  # % of total portfolio capital


def get_sector_for_ticker(ticker: str) -> str:
    """Get the sector for a ticker. Returns 'Other' if unknown."""
    return TICKER_TO_SECTOR.get(ticker.upper(), "Other")


def get_open_positions() -> list[dict]:
    """Get all open positions across paper trades + open analysis trades."""
    positions = []

    # Paper trades that are active
    for pt in list_paper_trades(status="active"):
        ticker = pt.get("ticker", "").upper()
        if not ticker:
            continue
        positions.append({
            "id": f"paper-{pt.get('id')}",
            "ticker": ticker,
            "sector": get_sector_for_ticker(ticker),
            "direction": pt.get("direction", "LONG"),
            "entry_price": pt.get("entry_price"),
            "entry_date": pt.get("entry_date"),
            "source": "paper_trade",
            "strategy": pt.get("strategy"),
        })

    # Real analyses with open status
    for ah in get_analysis_history(limit=200):
        if ah.get("pnl_status") == "open":
            ticker = ah.get("ticker", "").upper()
            if not ticker:
                continue
            positions.append({
                "id": f"real-{ah.get('task_id')}",
                "ticker": ticker,
                "sector": get_sector_for_ticker(ticker),
                "direction": "LONG",  # default; signal-based inference could refine
                "entry_price": ah.get("entry_price"),
                "entry_date": ah.get("trade_date"),
                "source": "real_trade",
                "signal": ah.get("signal"),
            })

    return positions


def get_sector_allocation(total_capital: float = 500000) -> dict:
    """Compute current sector allocation across all open positions.

    Returns:
        {
            "total_positions": int,
            "by_sector": {sector: {count, percent, positions: [...]}},
            "concentrated_sectors": list of sectors over the limit,
            "total_allocated_pct": float
        }
    """
    positions = get_open_positions()

    by_sector: dict[str, list] = defaultdict(list)
    total_value = 0.0

    for pos in positions:
        sector = pos.get("sector", "Other")
        # Position value approximation — need shares info or just count positions
        # For simplicity, equal-weight assumption: each position = total_capital / max_positions
        # In practice, this would integrate with Kite real position values
        position_value = pos.get("position_value") or (total_capital / 10)  # rough estimate
        pos["position_value"] = position_value
        by_sector[sector].append(pos)
        total_value += position_value

    # Compute percentages
    sectors_summary = {}
    concentrated = []

    for sector, pos_list in by_sector.items():
        sector_value = sum(p.get("position_value", 0) for p in pos_list)
        percent = (sector_value / total_capital * 100) if total_capital > 0 else 0
        sectors_summary[sector] = {
            "count": len(pos_list),
            "percent": round(percent, 1),
            "value": round(sector_value, 0),
            "positions": pos_list,
        }
        if percent > DEFAULT_MAX_PERCENT_PER_SECTOR or len(pos_list) > DEFAULT_MAX_POSITIONS_PER_SECTOR:
            concentrated.append(sector)

    return {
        "total_positions": len(positions),
        "total_capital": total_capital,
        "total_allocated": round(total_value, 0),
        "total_allocated_pct": round((total_value / total_capital * 100) if total_capital > 0 else 0, 1),
        "by_sector": sectors_summary,
        "concentrated_sectors": concentrated,
        "limits": {
            "max_positions_per_sector": DEFAULT_MAX_POSITIONS_PER_SECTOR,
            "max_percent_per_sector": DEFAULT_MAX_PERCENT_PER_SECTOR,
        },
    }


def check_new_trade_concentration(
    ticker: str,
    proposed_position_value: Optional[float] = None,
    total_capital: float = 500000,
) -> dict:
    """Check if adding a new trade would breach concentration limits.

    Args:
        ticker: ticker being considered
        proposed_position_value: how much capital this trade would use
        total_capital: total portfolio capital

    Returns:
        {
            "ticker": str,
            "sector": str,
            "current_sector_count": int,
            "current_sector_percent": float,
            "would_breach": bool,
            "warnings": list[str],
            "score_adjustment": float (negative if concentrated),
        }
    """
    sector = get_sector_for_ticker(ticker)
    if not proposed_position_value:
        proposed_position_value = total_capital / 10  # default 10% per position

    allocation = get_sector_allocation(total_capital)
    sector_data = allocation["by_sector"].get(sector, {"count": 0, "percent": 0, "positions": []})

    new_count = sector_data["count"] + 1
    new_percent = sector_data["percent"] + (proposed_position_value / total_capital * 100)

    warnings = []
    score_adj = 0.0
    would_breach = False

    if new_count > DEFAULT_MAX_POSITIONS_PER_SECTOR:
        warnings.append(
            f"Would exceed max positions per sector ({new_count} > {DEFAULT_MAX_POSITIONS_PER_SECTOR}) in {sector}"
        )
        score_adj -= 1.5
        would_breach = True

    if new_percent > DEFAULT_MAX_PERCENT_PER_SECTOR:
        warnings.append(
            f"Would push {sector} to {new_percent:.1f}% of portfolio (max {DEFAULT_MAX_PERCENT_PER_SECTOR}%)"
        )
        score_adj -= 1.5
        would_breach = True

    # Soft warning at 80% of limit
    if not would_breach:
        if new_count >= DEFAULT_MAX_POSITIONS_PER_SECTOR:
            warnings.append(f"At max positions for {sector} ({new_count}/{DEFAULT_MAX_POSITIONS_PER_SECTOR})")
            score_adj -= 0.5
        elif new_percent >= DEFAULT_MAX_PERCENT_PER_SECTOR * 0.8:
            warnings.append(f"Approaching sector limit: {sector} would be {new_percent:.1f}%")
            score_adj -= 0.5

    return {
        "ticker": ticker,
        "sector": sector,
        "current_sector_count": sector_data["count"],
        "current_sector_percent": sector_data["percent"],
        "new_sector_count": new_count,
        "new_sector_percent": round(new_percent, 1),
        "would_breach": would_breach,
        "warnings": warnings,
        "score_adjustment": round(score_adj, 2),
        "existing_in_sector": [p["ticker"] for p in sector_data.get("positions", [])],
    }


def get_concentration_summary() -> dict:
    """High-level summary for dashboard display."""
    allocation = get_sector_allocation()

    # Top sectors by exposure
    sectors_sorted = sorted(
        [(name, data) for name, data in allocation["by_sector"].items()],
        key=lambda x: -x[1]["percent"],
    )

    top_sector = sectors_sorted[0] if sectors_sorted else None

    risk_level = "LOW"
    risk_reason = "Portfolio well diversified"

    if allocation["concentrated_sectors"]:
        risk_level = "HIGH"
        risk_reason = f"Over-concentrated in {', '.join(allocation['concentrated_sectors'])}"
    elif top_sector and top_sector[1]["percent"] > DEFAULT_MAX_PERCENT_PER_SECTOR * 0.8:
        risk_level = "MEDIUM"
        risk_reason = f"{top_sector[0]} approaching limit ({top_sector[1]['percent']:.1f}%)"
    elif allocation["total_positions"] == 0:
        risk_level = "NONE"
        risk_reason = "No open positions"

    return {
        "risk_level": risk_level,
        "risk_reason": risk_reason,
        "total_positions": allocation["total_positions"],
        "total_allocated_pct": allocation["total_allocated_pct"],
        "top_sector": {
            "name": top_sector[0],
            "count": top_sector[1]["count"],
            "percent": top_sector[1]["percent"],
        } if top_sector else None,
        "by_sector": allocation["by_sector"],
        "concentrated_sectors": allocation["concentrated_sectors"],
        "limits": allocation["limits"],
    }
