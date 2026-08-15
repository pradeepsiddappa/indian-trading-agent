"""Local position tracking with explicit, read-only Kite synchronization."""

from datetime import datetime, timezone
from typing import Any

from backend.db import delete_position, get_position, get_setting, list_positions, replace_kite_positions, set_setting, upsert_position

POSITIONS_LAST_SYNC = "positions_last_sync_at"


class PositionsError(RuntimeError):
    """Raised for invalid manual position input."""


def _num(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _derived(quantity: float, average_price: float, last_price: float) -> dict:
    invested = quantity * average_price
    current = quantity * last_price
    pnl = current - invested
    return {
        "invested_value": round(invested, 2), "current_value": round(current, 2),
        "pnl": round(pnl, 2), "pnl_pct": round(pnl / invested * 100, 2) if invested else 0.0,
    }


def get_positions_view() -> dict:
    """Return only local state; this function never contacts Kite."""
    positions = list_positions()
    total_invested = round(sum(_num(row.get("invested_value")) for row in positions), 2)
    total_current = round(sum(_num(row.get("current_value")) for row in positions), 2)
    total_pnl = round(sum(_num(row.get("pnl")) for row in positions), 2)
    total_day_pnl = round(sum(_num(row.get("day_change")) * _num(row.get("quantity")) for row in positions), 2)
    enriched = [{**row, "allocation_pct": round(_num(row.get("current_value")) / total_current * 100, 2)
                 if total_current else 0.0} for row in positions]
    manual_count = sum(row.get("source") == "manual" for row in positions)
    kite_count = sum(row.get("source") == "kite" for row in positions)
    return {
        "positions": enriched, "count": len(enriched), "last_sync": get_setting(POSITIONS_LAST_SYNC),
        "source_mode": "manual" if manual_count and not kite_count else "kite" if kite_count and not manual_count
        else "mixed" if positions else "empty",
        "summary": {
            "total_positions": len(enriched), "total_invested": total_invested,
            "total_current": total_current, "total_pnl": total_pnl,
            "total_pnl_pct": round(total_pnl / total_invested * 100, 2) if total_invested else 0.0,
            "total_day_pnl": total_day_pnl,
            "day_pnl_pct": round(total_day_pnl / (total_current - total_day_pnl) * 100, 2)
            if total_current - total_day_pnl else 0.0,
            "manual_count": manual_count, "kite_count": kite_count,
        },
    }


def sync_positions_from_kite() -> dict:
    """Fetch and apply a Kite snapshot only when this endpoint is called."""
    from backend.brokers.kite import fetch_equity_holdings
    holdings = fetch_equity_holdings()
    counts = replace_kite_positions(holdings)
    synced_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    set_setting(POSITIONS_LAST_SYNC, synced_at)
    return {"status": "synced", "synced_at": synced_at, **counts, "summary": get_positions_view()["summary"]}


def save_manual_position(data: dict) -> dict:
    symbol = (data.get("tradingsymbol") or "").strip().upper()
    if not symbol:
        raise PositionsError("Symbol is required")
    quantity = _num(data.get("quantity"))
    average_price = _num(data.get("average_price"))
    if quantity <= 0:
        raise PositionsError("Quantity must be greater than zero")
    if average_price <= 0:
        raise PositionsError("Average price must be greater than zero")
    last_price = _num(data.get("last_price")) or average_price
    row = {
        "tradingsymbol": symbol, "exchange": (data.get("exchange") or "NSE").strip().upper(),
        "isin": data.get("isin"), "product": data.get("product") or "CNC", "quantity": quantity,
        "t1_quantity": 0, "average_price": round(average_price, 2), "last_price": round(last_price, 2),
        "close_price": round(last_price, 2), "day_change": 0.0, "day_change_pct": 0.0,
        "source": "manual", "notes": (data.get("notes") or "").strip() or None,
        **_derived(quantity, average_price, last_price),
    }
    upsert_position(row)
    return row


def update_position_fields(tradingsymbol: str, exchange: str, data: dict) -> dict:
    existing = get_position(tradingsymbol, exchange)
    if not existing:
        raise PositionsError(f"Position {tradingsymbol} ({exchange}) not found")
    quantity = _num(data.get("quantity", existing["quantity"]))
    average_price = _num(data.get("average_price", existing["average_price"]))
    if quantity <= 0 or average_price <= 0:
        raise PositionsError("Quantity and average price must be greater than zero")
    last_price = _num(data.get("last_price")) or _num(existing.get("last_price")) or average_price
    merged = {**existing, "quantity": quantity, "average_price": round(average_price, 2),
              "last_price": round(last_price, 2),
              "notes": data.get("notes") if data.get("notes") is not None else existing.get("notes"),
              **_derived(quantity, average_price, last_price)}
    upsert_position(merged)
    return merged


def remove_position(tradingsymbol: str, exchange: str = "NSE") -> bool:
    return delete_position(tradingsymbol, exchange)
