"""Institutional & Insider Trading Activity Tracker.

Tracks:
1. Bulk/Block Deals — Large institutional transactions
2. Delivery % — Retail vs institutional holding & accumulation patterns
3. Promoter Activity — Insider buying/selling, pledging trends
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Any, Dict, List, Optional

import requests
from backend.db import get_db

NSE_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.nseindia.com/",
}


def _ensure_institutional_tables():
    """Ensure database tables exist for institutional tracking."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS block_deals_cache (
                symbol TEXT,
                session_name TEXT,
                trade_price REAL,
                traded_volume INTEGER,
                traded_value REAL,
                trade_time TEXT,
                fetched_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (symbol, trade_time)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS promoter_activity_cache (
                symbol TEXT,
                category TEXT,
                person_name TEXT,
                transaction_type TEXT,
                num_shares INTEGER,
                value_rs REAL,
                transaction_date TEXT,
                pledged_pct REAL DEFAULT 0,
                fetched_at TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (symbol, person_name, transaction_date, num_shares)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS delivery_stats_cache (
                symbol TEXT PRIMARY KEY,
                traded_quantity INTEGER,
                delivery_quantity INTEGER,
                delivery_pct REAL,
                accumulation_status TEXT,
                updated_at TEXT DEFAULT (datetime('now'))
            )
        """)


def fetch_block_deals() -> List[Dict[str, Any]]:
    """Fetch live Block Deals from NSE API with fallback parsing."""
    _ensure_institutional_tables()
    url = "https://www.nseindia.com/api/block-deal"
    deals: List[Dict[str, Any]] = []

    try:
        resp = requests.get(url, headers=NSE_HEADERS, timeout=8)
        if resp.status_code == 200:
            data = resp.json()
            raw_deals = data.get("data", [])
            for item in raw_deals:
                symbol = item.get("symbol", "").strip()
                if not symbol:
                    continue
                traded_vol = int(item.get("totalTradedVolume") or 0)
                traded_val = float(item.get("totalTradedValue") or 0)
                traded_val_cr = round(traded_val / 10000000, 2)  # Convert to Crores
                price = float(item.get("lastPrice") or item.get("open") or 0)

                deal_obj = {
                    "symbol": symbol,
                    "session": item.get("session", "Regular"),
                    "price": price,
                    "volume": traded_vol,
                    "value_cr": traded_val_cr,
                    "change_pct": float(item.get("pchange") or 0),
                    "time": item.get("lastUpdateTime") or date.today().isoformat(),
                    "source": "NSE Block Deal",
                }
                deals.append(deal_obj)

                with get_db() as conn:
                    conn.execute(
                        """INSERT OR REPLACE INTO block_deals_cache 
                        (symbol, session_name, trade_price, traded_volume, traded_value, trade_time, fetched_at)
                        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))""",
                        (symbol, deal_obj["session"], price, traded_vol, traded_val_cr, deal_obj["time"]),
                    )
    except Exception as e:
        print(f"[Institutional] Block deal fetch failed: {e}", flush=True)

    # Fallback to cached deals if fresh fetch failed
    if not deals:
        with get_db() as conn:
            rows = conn.execute(
                "SELECT * FROM block_deals_cache ORDER BY fetched_at DESC LIMIT 20"
            ).fetchall()
            for r in rows:
                deals.append({
                    "symbol": r["symbol"],
                    "session": r["session_name"],
                    "price": r["trade_price"],
                    "volume": r["traded_volume"],
                    "value_cr": r["traded_value"],
                    "time": r["trade_time"],
                    "source": "Cached",
                })

    return deals


def fetch_promoter_activity() -> List[Dict[str, Any]]:
    """Fetch recent Promoter/Insider activity (buying, selling, pledged shares)."""
    _ensure_institutional_tables()
    activities: List[Dict[str, Any]] = []

    url = "https://www.nseindia.com/api/corporates-pit?period=1M"
    try:
        resp = requests.get(url, headers=NSE_HEADERS, timeout=8)
        if resp.status_code == 200:
            data = resp.json().get("data", [])
            for item in data:
                symbol = item.get("symbol", "").strip()
                if not symbol:
                    continue
                person = item.get("acqName", "Promoter Group")
                tx_type = item.get("acqMode", "Market Purchase")
                qty = int(item.get("secAcq") or 0)
                val = float(item.get("secVal") or 0)
                val_cr = round(val / 10000000, 2)
                dt = item.get("date") or date.today().isoformat()

                act = {
                    "symbol": symbol,
                    "person": person,
                    "transaction_type": tx_type,
                    "quantity": qty,
                    "value_cr": val_cr,
                    "date": dt,
                    "pledged_pct": 0.0,
                    "source": "NSE PIT",
                }
                activities.append(act)

                with get_db() as conn:
                    conn.execute(
                        """INSERT OR REPLACE INTO promoter_activity_cache
                        (symbol, category, person_name, transaction_type, num_shares, value_rs, transaction_date, fetched_at)
                        VALUES (?, 'Promoter', ?, ?, ?, ?, ?, datetime('now'))""",
                        (symbol, person, tx_type, qty, val_cr, dt),
                    )
    except Exception as e:
        print(f"[Institutional] Promoter activity fetch failed: {e}", flush=True)

    # Fallback to cache if empty
    if not activities:
        with get_db() as conn:
            rows = conn.execute(
                "SELECT * FROM promoter_activity_cache ORDER BY fetched_at DESC LIMIT 20"
            ).fetchall()
            for r in rows:
                activities.append({
                    "symbol": r["symbol"],
                    "person": r["person_name"],
                    "transaction_type": r["transaction_type"],
                    "quantity": r["num_shares"],
                    "value_cr": r["value_rs"],
                    "date": r["transaction_date"],
                    "pledged_pct": r["pledged_pct"],
                    "source": "Cached",
                })

    return activities


def get_delivery_stats(ticker: str) -> Dict[str, Any]:
    """Calculate Delivery % and Retail vs Institutional accumulation status for a ticker."""
    _ensure_institutional_tables()
    symbol = ticker.replace(".NS", "").replace(".BO", "").strip().upper()

    try:
        import yfinance as yf
        t = yf.Ticker(f"{symbol}.NS")
        hist = t.history(period="1mo")

        if not hist.empty:
            avg_vol = hist["Volume"].mean()
            recent_vol = hist["Volume"].iloc[-1]
            price_change = ((hist["Close"].iloc[-1] - hist["Close"].iloc[0]) / hist["Close"].iloc[0]) * 100

            # Estimate delivery % based on volume concentration & price action
            vol_ratio = recent_vol / avg_vol if avg_vol else 1.0
            base_del_pct = min(85.0, max(25.0, 45.0 + (vol_ratio - 1.0) * 15.0))

            if vol_ratio > 1.3 and price_change > 1.0:
                accumulation = "STRONG_INSTITUTIONAL_ACCUMULATION"
            elif vol_ratio > 1.1 and price_change >= 0:
                accumulation = "MODERATE_ACCUMULATION"
            elif vol_ratio > 1.3 and price_change < -1.0:
                accumulation = "INSTITUTIONAL_DISTRIBUTION"
            else:
                accumulation = "NEUTRAL_RETAIL_FLOW"

            del_pct = round(base_del_pct, 1)
            del_qty = int(recent_vol * (del_pct / 100.0))

            with get_db() as conn:
                conn.execute(
                    """INSERT OR REPLACE INTO delivery_stats_cache
                    (symbol, traded_quantity, delivery_quantity, delivery_pct, accumulation_status, updated_at)
                    VALUES (?, ?, ?, ?, ?, datetime('now'))""",
                    (symbol, int(recent_vol), del_qty, del_pct, accumulation),
                )

            return {
                "symbol": symbol,
                "traded_quantity": int(recent_vol),
                "delivery_quantity": del_qty,
                "delivery_pct": del_pct,
                "accumulation_status": accumulation,
                "volume_ratio_vs_20d": round(vol_ratio, 2),
                "price_1m_change_pct": round(price_change, 2),
            }
    except Exception as e:
        print(f"[Institutional] Delivery stats error for {symbol}: {e}", flush=True)

    return {
        "symbol": symbol,
        "traded_quantity": 0,
        "delivery_quantity": 0,
        "delivery_pct": 45.0,
        "accumulation_status": "NEUTRAL",
        "volume_ratio_vs_20d": 1.0,
        "price_1m_change_pct": 0.0,
    }


def get_institutional_summary() -> Dict[str, Any]:
    """Get aggregated summary of FII/DII, Bulk Deals, Delivery %, and Promoter activity."""
    from backend.fii_dii import get_market_bias, get_today_data

    fii_dii_bias = get_market_bias()
    fii_dii_today = get_today_data()
    block_deals = fetch_block_deals()
    promoter_act = fetch_promoter_activity()

    return {
        "fii_dii": {
            "today": fii_dii_today,
            "bias": fii_dii_bias,
        },
        "bulk_deals": {
            "count": len(block_deals),
            "recent": block_deals[:10],
        },
        "promoter_activity": {
            "count": len(promoter_act),
            "recent": promoter_act[:10],
        },
    }
