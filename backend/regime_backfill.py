"""Backfill `regime_at_entry` for existing paper_trades that pre-date the
regime tagging feature. Runs on demand from the API.

Maps each historical entry_date to the regime active that day using the
cached classifier (so we don't hit yfinance once per trade).
"""

from __future__ import annotations

from datetime import datetime

from backend.db import get_db, _migrate_paper_trades_columns
from backend.market_regime import classify_regime_for_date


def backfill_regime_at_entry(limit: int | None = None) -> dict:
    """Fill regime_at_entry for paper_trades where it's NULL.

    Args:
        limit: max number of trades to process (None = all).
    """
    _migrate_paper_trades_columns()
    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, entry_date FROM paper_trades
               WHERE regime_at_entry IS NULL
               ORDER BY entry_date DESC
               LIMIT ?""",
            (limit if limit is not None else 100000,),
        ).fetchall()

    # Group by entry_date so we classify each unique date only once
    dates_to_trades: dict[str, list[int]] = {}
    for r in rows:
        d = r["entry_date"]
        if not d:
            continue
        dates_to_trades.setdefault(d, []).append(r["id"])

    updated = 0
    failed_dates = []
    for entry_date_str, ids in dates_to_trades.items():
        try:
            entry_date = datetime.fromisoformat(entry_date_str).date()
            result = classify_regime_for_date(entry_date)
            regime = result.get("regime")
            if not regime or regime == "UNKNOWN":
                failed_dates.append(entry_date_str)
                continue
            with get_db() as conn:
                conn.execute(
                    f"UPDATE paper_trades SET regime_at_entry = ? "
                    f"WHERE id IN ({','.join(['?'] * len(ids))})",
                    [regime, *ids],
                )
                updated += len(ids)
        except Exception as e:
            failed_dates.append(f"{entry_date_str} ({e})")

    return {
        "status": "ok",
        "trades_scanned": len(rows),
        "trades_updated": updated,
        "unique_dates": len(dates_to_trades),
        "failed_dates": failed_dates,
    }
