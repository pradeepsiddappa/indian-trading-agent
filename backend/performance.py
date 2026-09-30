"""Strategy Performance Tracker — measure historical success rates of each strategy.

For each strategy (gap, volume, breakout, S/R bounce), retroactively check:
1. What were the signals in the past N days?
2. What happened to the price 1/3/5 days later?
3. Calculate win rate, avg return, best/worst trade.

All analysis is FREE — no AI API calls, pure price math from yfinance.
"""

import yfinance as yf
import numpy as np
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor, as_completed
from backend.scanner import NIFTY_50, NIFTY_100, BSE_250


UNIVERSES = {
    "nifty50": NIFTY_50,
    "nifty100": NIFTY_100,
    "bse250": BSE_250,
}


def _fetch_history(ticker: str, days: int = 90):
    """Fetch OHLCV history for a stock."""
    try:
        symbol = f"{ticker}.NS"
        t = yf.Ticker(symbol)
        hist = t.history(period=f"{days}d")
        if hist.empty or len(hist) < 30:
            return None
        return {"ticker": ticker, "symbol": symbol, "hist": hist}
    except Exception:
        return None


def _calculate_return(entry_price: float, exit_price: float, direction: str = "long") -> float:
    """Calculate return pct for long or short position."""
    if direction == "long":
        return (exit_price - entry_price) / entry_price * 100
    else:
        return (entry_price - exit_price) / entry_price * 100


def _get_exit_price(hist, signal_idx: int, hold_days: int) -> float | None:
    """Get close price N days after signal."""
    exit_idx = signal_idx + hold_days
    if exit_idx >= len(hist):
        return None
    return float(hist.iloc[exit_idx]["Close"])


def measure_gap_strategy(
    universe: str = "nifty50",
    lookback_days: int = 60,
    gap_threshold: float = 2.0,
    hold_days: list[int] = [1, 3, 5],
) -> dict:
    """Measure Gap strategy performance over lookback period.

    Strategy: If a stock gaps up >threshold%, was the next day/3 days/5 days positive?
    Direction: Gap Up = long, Gap Down = short
    """
    stocks = UNIVERSES.get(universe, NIFTY_50)
    all_trades = []

    def _analyze_stock(ticker):
        data = _fetch_history(ticker, days=lookback_days + 20)
        if not data:
            return []
        hist = data["hist"]
        trades = []

        # Look at every day except the last few (need hold_days buffer)
        max_hold = max(hold_days)
        for i in range(1, len(hist) - max_hold):
            prev_close = float(hist.iloc[i - 1]["Close"])
            today_open = float(hist.iloc[i]["Open"])
            gap_pct = (today_open - prev_close) / prev_close * 100

            if abs(gap_pct) < gap_threshold:
                continue

            direction = "long" if gap_pct > 0 else "short"
            returns = {}
            for hd in hold_days:
                exit_price = _get_exit_price(hist, i, hd)
                if exit_price is None:
                    continue
                returns[f"day_{hd}"] = round(_calculate_return(today_open, exit_price, direction), 2)

            if returns:
                trades.append({
                    "ticker": ticker,
                    "date": hist.index[i].strftime("%Y-%m-%d"),
                    "gap_pct": round(gap_pct, 2),
                    "direction": direction.upper(),
                    "entry_price": round(today_open, 2),
                    "returns": returns,
                })
        return trades

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_analyze_stock, t) for t in stocks]
        for f in as_completed(futures):
            all_trades.extend(f.result())

    return _summarize_trades(all_trades, hold_days, "Gap Up/Down Strategy")


def measure_volume_strategy(
    universe: str = "nifty50",
    lookback_days: int = 60,
    volume_multiplier: float = 2.0,
    hold_days: list[int] = [1, 3, 5],
) -> dict:
    """Measure Volume Spike strategy performance.

    Strategy: If a stock has volume >2x avg AND price went up, was the next day/3/5 positive?
    Bullish volume spike = long, Bearish = short
    """
    stocks = UNIVERSES.get(universe, NIFTY_50)
    all_trades = []

    def _analyze_stock(ticker):
        data = _fetch_history(ticker, days=lookback_days + 30)
        if not data:
            return []
        hist = data["hist"]
        trades = []

        max_hold = max(hold_days)
        window = 20
        for i in range(window, len(hist) - max_hold):
            avg_volume = float(hist.iloc[i - window:i]["Volume"].mean())
            if avg_volume == 0:
                continue
            current_volume = float(hist.iloc[i]["Volume"])
            vol_ratio = current_volume / avg_volume

            if vol_ratio < volume_multiplier:
                continue

            today_close = float(hist.iloc[i]["Close"])
            prev_close = float(hist.iloc[i - 1]["Close"])
            price_change = (today_close - prev_close) / prev_close * 100

            direction = "long" if price_change > 0 else "short"
            entry_price = today_close

            returns = {}
            for hd in hold_days:
                exit_price = _get_exit_price(hist, i, hd)
                if exit_price is None:
                    continue
                returns[f"day_{hd}"] = round(_calculate_return(entry_price, exit_price, direction), 2)

            if returns:
                trades.append({
                    "ticker": ticker,
                    "date": hist.index[i].strftime("%Y-%m-%d"),
                    "volume_ratio": round(vol_ratio, 1),
                    "direction": direction.upper(),
                    "price_change": round(price_change, 2),
                    "entry_price": round(entry_price, 2),
                    "returns": returns,
                })
        return trades

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_analyze_stock, t) for t in stocks]
        for f in as_completed(futures):
            all_trades.extend(f.result())

    return _summarize_trades(all_trades, hold_days, "Volume Spike Strategy")


def measure_breakout_strategy(
    universe: str = "nifty50",
    lookback_days: int = 60,
    breakout_window: int = 20,
    hold_days: list[int] = [1, 3, 5],
    require_volume: bool = True,
) -> dict:
    """Measure Breakout strategy performance.

    Strategy: If a stock breaks above N-day high, was the next day/3/5 positive?
    """
    stocks = UNIVERSES.get(universe, NIFTY_50)
    all_trades = []

    def _analyze_stock(ticker):
        data = _fetch_history(ticker, days=lookback_days + breakout_window + 20)
        if not data:
            return []
        hist = data["hist"]
        trades = []

        max_hold = max(hold_days)
        for i in range(breakout_window, len(hist) - max_hold):
            prev_highs = hist.iloc[i - breakout_window:i]["High"]
            n_day_high = float(prev_highs.max())
            today_high = float(hist.iloc[i]["High"])

            if today_high <= n_day_high:
                continue

            # Optional volume confirmation
            if require_volume:
                avg_volume = float(hist.iloc[i - breakout_window:i]["Volume"].mean())
                current_volume = float(hist.iloc[i]["Volume"])
                if avg_volume == 0 or current_volume / avg_volume < 1.5:
                    continue

            today_close = float(hist.iloc[i]["Close"])
            breakout_pct = (today_close - n_day_high) / n_day_high * 100
            entry_price = today_close

            returns = {}
            for hd in hold_days:
                exit_price = _get_exit_price(hist, i, hd)
                if exit_price is None:
                    continue
                returns[f"day_{hd}"] = round(_calculate_return(entry_price, exit_price, "long"), 2)

            if returns:
                trades.append({
                    "ticker": ticker,
                    "date": hist.index[i].strftime("%Y-%m-%d"),
                    "breakout_level": round(n_day_high, 2),
                    "breakout_pct": round(breakout_pct, 2),
                    "direction": "LONG",
                    "entry_price": round(entry_price, 2),
                    "returns": returns,
                })
        return trades

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_analyze_stock, t) for t in stocks]
        for f in as_completed(futures):
            all_trades.extend(f.result())

    return _summarize_trades(all_trades, hold_days, "Breakout Strategy")


def measure_sr_bounce_strategy(
    universe: str = "nifty50",
    lookback_days: int = 90,
    bounce_window: int = 3,
    hold_days: list[int] = [1, 3, 5],
) -> dict:
    """Measure Support Bounce strategy performance.

    Strategy: If a stock tests a recent low (within 1%) and bounces (green candle next day),
    does it continue to rise?
    """
    stocks = UNIVERSES.get(universe, NIFTY_50)
    all_trades = []

    def _analyze_stock(ticker):
        data = _fetch_history(ticker, days=lookback_days + 30)
        if not data:
            return []
        hist = data["hist"]
        trades = []

        max_hold = max(hold_days)
        window = 20
        for i in range(window, len(hist) - max_hold):
            # Check if today's low is near the 20-day low (within 1%)
            recent_low = float(hist.iloc[i - window:i]["Low"].min())
            today_low = float(hist.iloc[i]["Low"])
            today_close = float(hist.iloc[i]["Close"])
            today_open = float(hist.iloc[i]["Open"])

            # Signal: low touched recent low AND closed green (bullish rejection)
            near_support = abs(today_low - recent_low) / recent_low < 0.01
            bullish_candle = today_close > today_open

            if not (near_support and bullish_candle):
                continue

            entry_price = today_close

            returns = {}
            for hd in hold_days:
                exit_price = _get_exit_price(hist, i, hd)
                if exit_price is None:
                    continue
                returns[f"day_{hd}"] = round(_calculate_return(entry_price, exit_price, "long"), 2)

            if returns:
                trades.append({
                    "ticker": ticker,
                    "date": hist.index[i].strftime("%Y-%m-%d"),
                    "support_level": round(recent_low, 2),
                    "direction": "LONG",
                    "entry_price": round(entry_price, 2),
                    "returns": returns,
                })
        return trades

    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = [executor.submit(_analyze_stock, t) for t in stocks]
        for f in as_completed(futures):
            all_trades.extend(f.result())

    return _summarize_trades(all_trades, hold_days, "Support Bounce Strategy")


def _summarize_trades(trades: list[dict], hold_days: list[int], strategy_name: str) -> dict:
    """Calculate win rate, avg return, best/worst trade for each hold period."""
    if not trades:
        return {
            "strategy": strategy_name,
            "total_signals": 0,
            "hold_periods": {},
            "trades": [],
        }

    hold_periods = {}
    for hd in hold_days:
        key = f"day_{hd}"
        valid_returns = [t["returns"].get(key) for t in trades if key in t["returns"]]
        valid_returns = [r for r in valid_returns if r is not None]

        if not valid_returns:
            continue

        wins = sum(1 for r in valid_returns if r > 0)
        losses = sum(1 for r in valid_returns if r < 0)
        total = len(valid_returns)

        hold_periods[key] = {
            "hold_days": hd,
            "total_signals": total,
            "wins": wins,
            "losses": losses,
            "win_rate": round(wins / total * 100, 1) if total else 0,
            "avg_return": round(float(np.mean(valid_returns)), 2),
            "median_return": round(float(np.median(valid_returns)), 2),
            "best_trade": round(max(valid_returns), 2),
            "worst_trade": round(min(valid_returns), 2),
            "std_dev": round(float(np.std(valid_returns)), 2),
        }

    # Sort trades by best performance (using first hold period)
    first_key = f"day_{hold_days[0]}"
    sorted_trades = sorted(
        [t for t in trades if first_key in t.get("returns", {})],
        key=lambda t: t["returns"].get(first_key, 0),
        reverse=True,
    )

    return {
        "strategy": strategy_name,
        "total_signals": len(trades),
        "hold_periods": hold_periods,
        "trades": sorted_trades[:100],  # Top 100 trades (wins + losses interleaved)
    }


_PERFORMANCE_CACHE: dict = {}


def measure_all_strategies(
    universe: str = "nifty50",
    lookback_days: int = 60,
    hold_days: list[int] = [1, 3, 5],
) -> dict:
    """Run performance measurement for all strategies. Caches result for 10 min to avoid Nginx timeouts."""
    cache_key = f"{universe}_{lookback_days}_{','.join(map(str, hold_days))}"
    now = datetime.now()
    if cache_key in _PERFORMANCE_CACHE:
        cached_time, data = _PERFORMANCE_CACHE[cache_key]
        if (now - cached_time).total_seconds() < 600:
            return data

    results = {}
    results["gap"] = measure_gap_strategy(universe, lookback_days, hold_days=hold_days)
    results["volume"] = measure_volume_strategy(universe, lookback_days, hold_days=hold_days)
    results["breakout"] = measure_breakout_strategy(universe, lookback_days, hold_days=hold_days)
    results["sr_bounce"] = measure_sr_bounce_strategy(universe, lookback_days, hold_days=hold_days)

    out = {
        "universe": universe,
        "lookback_days": lookback_days,
        "hold_days": hold_days,
        "strategies": results,
    }
    _PERFORMANCE_CACHE[cache_key] = (now, out)
    return out

