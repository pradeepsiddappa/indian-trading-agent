"""Cyclical pattern analysis — monthly seasonality, sector rotation, event cycles."""

import yfinance as yf
import numpy as np
from datetime import datetime, timedelta
from collections import defaultdict
from tradingagents.utils.ticker import normalize_ticker

MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

SECTOR_MAP = {
    "IT": ["TCS", "INFY", "WIPRO", "HCLTECH", "TECHM", "LTTS", "MPHASIS", "PERSISTENT"],
    "Banks": ["HDFCBANK", "ICICIBANK", "SBIN", "KOTAKBANK", "AXISBANK", "INDUSINDBK", "BANKBARODA", "PNB"],
    "Pharma": ["SUNPHARMA", "DRREDDY", "CIPLA", "DIVISLAB", "LUPIN", "AUROPHARMA", "TORNTPHARM"],
    "Auto": ["TMPV", "TMCV", "M&M", "MARUTI", "BAJAJ-AUTO", "HEROMOTOCO", "EICHERMOT", "TVSMOTOR"],
    "FMCG": ["HINDUNILVR", "ITC", "NESTLEIND", "BRITANNIA", "DABUR", "MARICO", "COLPAL", "GODREJCP"],
    "Metal": ["TATASTEEL", "JSWSTEEL", "HINDALCO", "VEDL", "SAIL", "NMDC", "NATIONALUM"],
    "Energy": ["RELIANCE", "ONGC", "BPCL", "IOC", "NTPC", "POWERGRID", "TATAPOWER", "COALINDIA"],
    "Realty": ["DLF", "OBEROIRLTY", "PRESTIGE", "LODHA"],
    "Finance": ["BAJFINANCE", "BAJAJFINSV", "CHOLAFIN", "M&MFIN", "HDFCLIFE", "SBILIFE", "ICICIPRULI"],
}


def analyze_monthly_seasonality(ticker: str, years: int = 5) -> dict:
    """Analyze monthly return patterns for a stock over N years."""
    symbol = normalize_ticker(ticker)
    t = yf.Ticker(symbol)
    hist = t.history(period=f"{years}y")

    if hist.empty or len(hist) < 100:
        return {"error": f"Insufficient data for {symbol}"}

    # Calculate monthly returns
    monthly_data = defaultdict(list)

    hist["Month"] = hist.index.month
    hist["Year"] = hist.index.year
    hist["Return"] = hist["Close"].pct_change()

    for year in hist["Year"].unique():
        for month in range(1, 13):
            month_data = hist[(hist["Year"] == year) & (hist["Month"] == month)]
            if len(month_data) > 5:
                month_return = float((month_data["Close"].iloc[-1] / month_data["Close"].iloc[0] - 1) * 100)
                monthly_data[month].append(month_return)

    # Calculate stats per month
    months = []
    for m in range(1, 13):
        returns = monthly_data.get(m, [])
        if not returns:
            continue
        avg = float(np.mean(returns))
        win_rate = float(sum(1 for r in returns if r > 0) / len(returns) * 100)
        best = float(max(returns)) if returns else 0
        worst = float(min(returns)) if returns else 0

        months.append({
            "month": m,
            "month_name": MONTH_NAMES[m - 1],
            "avg_return_pct": round(avg, 2),
            "win_rate": round(win_rate, 1),
            "best_return": round(best, 2),
            "worst_return": round(worst, 2),
            "sample_years": len(returns),
            "signal": "BULLISH" if avg > 1 and win_rate > 60 else ("BEARISH" if avg < -1 and win_rate < 40 else "NEUTRAL"),
        })

    # Current month signal
    current_month = datetime.now().month
    current_stats = next((m for m in months if m["month"] == current_month), None)

    # Best and worst months
    sorted_months = sorted(months, key=lambda x: x["avg_return_pct"], reverse=True)

    return {
        "ticker": symbol,
        "years_analyzed": years,
        "months": months,
        "current_month": current_stats,
        "best_months": sorted_months[:3],
        "worst_months": sorted_months[-3:],
    }


def analyze_day_of_week(ticker: str, months: int = 6) -> dict:
    """Analyze day-of-week return patterns."""
    symbol = normalize_ticker(ticker)
    t = yf.Ticker(symbol)
    hist = t.history(period=f"{months}mo")

    if hist.empty or len(hist) < 20:
        return {"error": f"Insufficient data for {symbol}"}

    hist["DayOfWeek"] = hist.index.dayofweek
    hist["Return"] = hist["Close"].pct_change() * 100

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    days = []

    for d in range(5):
        day_returns = hist[hist["DayOfWeek"] == d]["Return"].dropna().tolist()
        if not day_returns:
            continue
        avg = float(np.mean(day_returns))
        win_rate = float(sum(1 for r in day_returns if r > 0) / len(day_returns) * 100)
        days.append({
            "day": d,
            "day_name": day_names[d],
            "avg_return_pct": round(avg, 3),
            "win_rate": round(win_rate, 1),
            "sample_size": len(day_returns),
        })

    return {
        "ticker": symbol,
        "period_months": months,
        "days": days,
    }


def analyze_sector_rotation(months: int = 3) -> dict:
    """Analyze which sectors are performing best recently."""
    sector_performance = []

    for sector_name, tickers in SECTOR_MAP.items():
        returns = []
        for ticker in tickers[:5]:  # Top 5 stocks per sector for speed
            try:
                symbol = f"{ticker}.NS"
                t = yf.Ticker(symbol)
                hist = t.history(period=f"{months}mo")
                if len(hist) > 10:
                    ret = float((hist["Close"].iloc[-1] / hist["Close"].iloc[0] - 1) * 100)
                    returns.append(ret)
            except Exception:
                continue

        if returns:
            avg_return = float(np.mean(returns))
            sector_performance.append({
                "sector": sector_name,
                "avg_return_pct": round(avg_return, 2),
                "stocks_analyzed": len(returns),
                "top_stocks": tickers[:5],
                "signal": "STRONG" if avg_return > 5 else ("BULLISH" if avg_return > 0 else ("BEARISH" if avg_return > -5 else "WEAK")),
            })

    sector_performance.sort(key=lambda x: x["avg_return_pct"], reverse=True)

    return {
        "period_months": months,
        "sectors": sector_performance,
        "top_sectors": sector_performance[:3],
        "bottom_sectors": sector_performance[-3:],
    }


def backtest_seasonal_strategy(ticker: str, buy_months: list[int], sell_months: list[int], years: int = 5) -> dict:
    """Backtest a seasonal strategy: buy in specific months, sell in others.

    This is FREE — no AI calls, pure price math.
    """
    symbol = normalize_ticker(ticker)
    t = yf.Ticker(symbol)
    hist = t.history(period=f"{years}y")

    if hist.empty or len(hist) < 100:
        return {"error": f"Insufficient data for {symbol}"}

    hist["Month"] = hist.index.month
    hist["Year"] = hist.index.year

    trades = []
    total_return = 0

    for year in sorted(hist["Year"].unique()):
        for buy_month in buy_months:
            buy_data = hist[(hist["Year"] == year) & (hist["Month"] == buy_month)]
            if buy_data.empty:
                continue

            entry_price = float(buy_data["Close"].iloc[0])

            # Find next sell month
            for sell_month in sell_months:
                sell_year = year if sell_month > buy_month else year + 1
                sell_data = hist[(hist["Year"] == sell_year) & (hist["Month"] == sell_month)]
                if sell_data.empty:
                    continue

                exit_price = float(sell_data["Close"].iloc[-1])
                pnl_pct = round((exit_price / entry_price - 1) * 100, 2)
                total_return += pnl_pct

                trades.append({
                    "entry_date": f"{year}-{buy_month:02d}",
                    "exit_date": f"{sell_year}-{sell_month:02d}",
                    "entry_price": round(entry_price, 2),
                    "exit_price": round(exit_price, 2),
                    "pnl_pct": pnl_pct,
                    "result": "win" if pnl_pct > 0 else "loss",
                })
                break

    wins = sum(1 for t in trades if t["result"] == "win")
    losses = len(trades) - wins

    return {
        "ticker": symbol,
        "strategy": f"Buy in {','.join(MONTH_NAMES[m-1] for m in buy_months)}, Sell in {','.join(MONTH_NAMES[m-1] for m in sell_months)}",
        "years": years,
        "total_trades": len(trades),
        "winning_trades": wins,
        "losing_trades": losses,
        "win_rate": round(wins / len(trades) * 100, 1) if trades else 0,
        "total_return_pct": round(total_return, 2),
        "avg_return_per_trade": round(total_return / len(trades), 2) if trades else 0,
        "trades": trades,
    }
