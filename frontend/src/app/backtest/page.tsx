"use client";

import { useState, useCallback } from "react";
import { startBacktest, connectBacktestWS } from "@/lib/api";
import type { BacktestTrade, BacktestWSEvent } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Play, AlertTriangle } from "lucide-react";
import { HelpSection } from "@/components/HelpSection";
import { backtestHelp } from "@/lib/help-content";

export default function BacktestPage() {
  const [ticker, setTicker] = useState("RELIANCE");
  const [startDate, setStartDate] = useState("2025-03-01");
  const [endDate, setEndDate] = useState("2025-04-10");
  const [intervalDays, setIntervalDays] = useState(7);
  const [capital, setCapital] = useState(100000);
  const [positionSize, setPositionSize] = useState(10);
  const [enableLearning, setEnableLearning] = useState(false);

  const [status, setStatus] = useState<"idle" | "running" | "completed" | "error">("idle");
  const [trades, setTrades] = useState<BacktestTrade[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRun = useCallback(async () => {
    setStatus("running");
    setTrades([]);
    setLogs([]);
    setSummary(null);
    setError(null);

    try {
      const result: any = await startBacktest({
        ticker,
        start_date: startDate,
        end_date: endDate,
        interval_days: intervalDays,
        initial_capital: capital,
        position_size_pct: positionSize,
        enable_learning: enableLearning,
      });

      const backtestId = result.backtest_id;
      setLogs((prev) => [...prev, `Backtest started: ${result.total_dates} dates to analyze`]);

      const ws = connectBacktestWS(backtestId, (event: BacktestWSEvent) => {
        switch (event.type) {
          case "status":
            setLogs((prev) => [...prev, event.message || ""]);
            break;
          case "trade":
            setTrades((prev) => [
              ...prev,
              {
                trade_date: event.trade_date!,
                ticker: ticker,
                signal: event.signal!,
                entry_price: event.entry_price!,
                exit_price: event.exit_price!,
                pnl_pct: event.pnl_pct!,
                pnl_amount: event.pnl_amount!,
                cumulative_pnl: event.cumulative_pnl!,
                portfolio_value: event.portfolio_value!,
                duration_seconds: 0,
              },
            ]);
            break;
          case "complete":
            setSummary(event);
            setStatus("completed");
            ws.close();
            break;
          case "error":
            setError(event.message || "Unknown error");
            setStatus("error");
            ws.close();
            break;
        }
      });
    } catch (e: any) {
      setError(e.message);
      setStatus("error");
    }
  }, [ticker, startDate, endDate, intervalDays, capital, positionSize, enableLearning]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Backtest</h1>
        <p className="text-sm text-muted-foreground">
          Run the AI agent on historical dates and measure P&L accuracy
        </p>
      </div>

      {/* Config */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Ticker</label>
              <Input value={ticker} onChange={(e) => setTicker(e.target.value)} className="font-sans" disabled={status === "running"} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Start Date</label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={status === "running"} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">End Date</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} disabled={status === "running"} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Interval (days)</label>
              <Input type="number" value={intervalDays} onChange={(e) => setIntervalDays(Number(e.target.value))} disabled={status === "running"} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Capital (INR)</label>
              <Input type="number" value={capital} onChange={(e) => setCapital(Number(e.target.value))} disabled={status === "running"} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Position Size %</label>
              <Input type="number" value={positionSize} onChange={(e) => setPositionSize(Number(e.target.value))} disabled={status === "running"} />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableLearning}
                  onChange={(e) => setEnableLearning(e.target.checked)}
                  disabled={status === "running"}
                  className="rounded"
                />
                Enable Learning
              </label>
            </div>
            <div className="flex items-end">
              <Button onClick={handleRun} disabled={status === "running" || !ticker.trim()} className="w-full">
                {status === "running" ? (
                  <><Loader2 className="h-4 w-4 animate-spin mr-2" />Running...</>
                ) : (
                  <><Play className="h-4 w-4 mr-2" />Run Backtest</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <CardContent className="p-4 text-red-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> {error}
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className={summary.total_return_pct >= 0 ? "border-green-500/30" : "border-red-500/30"}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Return</p>
              <p className={`text-2xl font-bold ${summary.total_return_pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                {summary.total_return_pct >= 0 ? "+" : ""}{summary.total_return_pct}%
              </p>
              <p className="text-xs text-muted-foreground">
                ₹{summary.total_pnl?.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className="text-2xl font-bold">{summary.win_rate}%</p>
              <p className="text-xs text-muted-foreground">
                {summary.winning_trades}W / {summary.losing_trades}L
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Max Drawdown</p>
              <p className="text-2xl font-bold text-red-400">-{summary.max_drawdown_pct}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total Trades</p>
              <p className="text-2xl font-bold">{summary.total_trades}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Final Portfolio</p>
              <p className="text-2xl font-bold font-sans">₹{summary.final_portfolio_value?.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trades + Logs */}
      {(trades.length > 0 || logs.length > 0) && (
        <div className="grid grid-cols-3 gap-6">
          {/* Trade Table */}
          <div className="col-span-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Trade Results</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Date</TableHead>
                        <TableHead className="text-xs">Signal</TableHead>
                        <TableHead className="text-xs text-right">Entry</TableHead>
                        <TableHead className="text-xs text-right">Exit</TableHead>
                        <TableHead className="text-xs text-right">P&L</TableHead>
                        <TableHead className="text-xs text-right">Cumulative</TableHead>
                        <TableHead className="text-xs text-right">Portfolio</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trades.map((t, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{t.trade_date}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              t.signal === "BUY" || t.signal === "OVERWEIGHT" || t.signal === "STRONG BUY"
                                ? "bg-green-500/10 text-green-400"
                                : t.signal === "HOLD"
                                ? "bg-yellow-500/10 text-yellow-400"
                                : "bg-red-500/10 text-red-400"
                            }>
                              {t.signal}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-sans text-sm">₹{t.entry_price}</TableCell>
                          <TableCell className="text-right font-sans text-sm">₹{t.exit_price}</TableCell>
                          <TableCell className={`text-right font-sans text-sm ${t.pnl_pct >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct}%
                          </TableCell>
                          <TableCell className={`text-right font-sans text-sm ${t.cumulative_pnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                            ₹{t.cumulative_pnl.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-sans text-sm">₹{t.portfolio_value.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Live Logs */}
          <div className="col-span-1">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {status === "running" ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin" /> Live Progress
                    </span>
                  ) : "Log"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px] p-4">
                  <div className="space-y-1 font-sans text-xs">
                    {logs.map((log, i) => (
                      <p key={i} className="text-muted-foreground">{log}</p>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Help */}
      <HelpSection title="How to Use Backtest" items={backtestHelp} />
    </div>
  );
}
