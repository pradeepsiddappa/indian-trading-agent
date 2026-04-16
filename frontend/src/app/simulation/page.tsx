"use client";

import { useEffect, useState } from "react";
import {
  listPaperTrades,
  refreshPaperTrades,
  getPaperTradingStats,
  deletePaperTrade,
  closePaperTrade,
  runRecommenderBacktest,
  listRecommenderBacktests,
  getRecommenderBacktestResult,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpSection } from "@/components/HelpSection";
import {
  FlaskConical,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Trash2,
  X,
  Play,
  BarChart3,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  Radar,
  Target,
  Brain,
} from "lucide-react";
import { toast } from "sonner";

const simulationHelp = [
  {
    question: "What is paper trading?",
    answer: "Paper trading is simulated trading \u2014 you open \"virtual\" positions at real market prices without using real money. The system automatically tracks what actually happened to the stock price 1, 3, 5, and 10 trading days later.\n\nThis lets you validate the recommendation engine (or your own picks) without risking capital. After 10-20 paper trades, you'll have a clear win rate and can decide if the system is worth following with real money.",
  },
  {
    question: "How to open a paper trade?",
    answer: "Three ways:\n\n1. From Top Picks (/recommendations) \u2014 click \"Track\" on any recommendation. Auto-fills signal/score/direction.\n2. From Dashboard Top Picks \u2014 same \"Track\" button on each pick.\n3. Manually from this page \u2014 enter any ticker + optional notes.\n\nEntry price = current market price when you click. The trade becomes \"active\" and prices are fetched automatically each day.",
  },
  {
    question: "What's a \"historical backtest\"?",
    answer: "Different from paper trading \u2014 this looks BACKWARD, not forward.\n\nThe system replays the recommendation engine on past dates (e.g., every 5 days for the last 60 days). For each signal it would have fired, we check what actually happened to the price 1/3/5/10 days later.\n\nThis tells you the historical accuracy of the engine's signals \u2014 effectively: \"If I had used this tool 2 months ago, what would my win rate be?\"\n\nCompletely FREE (no AI API cost). Takes 30-120 seconds depending on universe size.",
  },
  {
    question: "Which horizon should I trust?",
    answer: "Look at the win rate across 1d/3d/5d/10d columns:\n  \u2022 Consistent >55% across horizons = reliable signal\n  \u2022 Only works at 1d = pure momentum (noisy)\n  \u2022 Only works at 10d = slow mover (needs patience)\n  \u2022 Negative across all = fade the signals (do opposite)\n\nMost short-term strategies work best at 3-5 days. If you're getting 60%+ at 5d, the engine is giving you useful signals.",
  },
  {
    question: "How do I use this for real decisions?",
    answer: "Workflow:\n  1. Run historical backtest for last 60 days \u2014 check overall win rate\n  2. If >55%, start opening paper trades on every new recommendation\n  3. After 10 paper trades, compare YOUR win rate to historical\n  4. If consistent, start placing tiny real positions\n  5. Scale up slowly as confidence grows\n\nNever skip paper trading. Even with good historical backtest, your specific timing may differ. Paper trade for a month minimum before real money.",
  },
];

const signalColors: Record<string, string> = {
  "STRONG BUY": "bg-green-100 text-green-800 border-green-300",
  BUY: "bg-green-50 text-green-700 border-green-200",
  SELL: "bg-red-50 text-red-700 border-red-200",
  "STRONG SELL": "bg-red-100 text-red-800 border-red-300",
};

const sourceConfig: Record<string, { label: string; icon: any; color: string }> = {
  recommendation: { label: "Recommendations", icon: Sparkles, color: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  scanner: { label: "Scanner", icon: Radar, color: "bg-orange-50 text-orange-700 border-orange-200" },
  ai_analysis: { label: "AI Analysis", icon: Brain, color: "bg-purple-50 text-purple-700 border-purple-200" },
  manual: { label: "Manual", icon: Target, color: "bg-gray-50 text-gray-700 border-gray-200" },
  test: { label: "Test", icon: Target, color: "bg-blue-50 text-blue-700 border-blue-200" },
};

function PnLCell({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-muted-foreground text-xs">—</span>;
  const color = value > 0 ? "text-green-600" : value < 0 ? "text-red-600" : "text-muted-foreground";
  return (
    <span className={`font-semibold ${color}`}>
      {value >= 0 ? "+" : ""}{value}%
    </span>
  );
}

function PaperTradeRow({ t, onClose, onDelete }: { t: any; onClose: (id: number) => void; onDelete: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const src = sourceConfig[t.source] || sourceConfig.manual;
  const SrcIcon = src.icon;
  const hasDetails = (t.triggered_signals && Array.isArray(t.triggered_signals) && t.triggered_signals.length > 0) || t.notes || t.strategy;

  return (
    <>
      <TableRow>
        <TableCell>
          {hasDetails && (
            <button onClick={() => setExpanded(!expanded)} className="text-muted-foreground hover:text-foreground">
              {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </button>
          )}
        </TableCell>
        <TableCell className="text-xs">{t.entry_date}</TableCell>
        <TableCell className="font-medium">{t.ticker}</TableCell>
        <TableCell>
          <Badge variant="outline" className={`text-xs ${src.color}`}>
            <SrcIcon className="h-2.5 w-2.5 mr-1" />
            {src.label}
          </Badge>
        </TableCell>
        <TableCell>
          {t.signal && <Badge variant="outline" className={signalColors[t.signal] || ""}>{t.signal}</Badge>}
        </TableCell>
        <TableCell>
          <span className={t.direction === "LONG" ? "text-green-600" : "text-red-600"}>
            {t.direction === "LONG" ? <TrendingUp className="h-3 w-3 inline" /> : <TrendingDown className="h-3 w-3 inline" />}
          </span>
        </TableCell>
        <TableCell className="text-right text-sm">Rs.{t.entry_price}</TableCell>
        <TableCell className="text-right text-sm"><PnLCell value={t.pnl_1d_pct} /></TableCell>
        <TableCell className="text-right text-sm"><PnLCell value={t.pnl_3d_pct} /></TableCell>
        <TableCell className="text-right text-sm"><PnLCell value={t.pnl_5d_pct} /></TableCell>
        <TableCell className="text-right text-sm"><PnLCell value={t.pnl_10d_pct} /></TableCell>
        <TableCell>
          <Badge variant="outline" className="text-xs">
            {t.status}
          </Badge>
        </TableCell>
        <TableCell>
          <div className="flex gap-1">
            {t.status === "active" && (
              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onClose(t.id)} title="Close">
                <X className="h-3 w-3" />
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600" onClick={() => onDelete(t.id)} title="Delete">
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Expandable detail row */}
      {expanded && hasDetails && (
        <TableRow className="bg-muted/30">
          <TableCell colSpan={13} className="py-3">
            <div className="space-y-2 text-sm pl-6">
              {t.strategy && (
                <div>
                  <span className="text-muted-foreground">Strategy: </span>
                  <span className="font-medium">{t.strategy}</span>
                  {t.score != null && (
                    <span className="ml-3 text-muted-foreground">Score: <span className="font-mono font-medium text-foreground">{t.score >= 0 ? "+" : ""}{t.score}</span></span>
                  )}
                  {t.confidence && (
                    <Badge variant="outline" className="ml-2 text-xs">{t.confidence}</Badge>
                  )}
                  {t.success_probability != null && (
                    <span className="ml-3 text-muted-foreground">Est. success: <span className="font-semibold text-foreground">{t.success_probability}%</span></span>
                  )}
                </div>
              )}
              {t.triggered_signals && t.triggered_signals.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Why this trade was picked:</p>
                  <div className="space-y-1">
                    {t.triggered_signals.map((s: any, i: number) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between p-2 rounded text-xs ${
                          s.direction === "BULLISH" ? "bg-green-50 text-green-800" :
                          s.direction === "BEARISH" ? "bg-red-50 text-red-800" :
                          "bg-gray-50 text-gray-700"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">{s.direction}</Badge>
                          <span className="font-medium">{s.type}</span>
                          {s.value && <span className="text-muted-foreground">({s.value})</span>}
                        </div>
                        <span className="font-mono text-[10px]">
                          {s.weight >= 0 ? "+" : ""}{s.weight} pts
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {t.notes && (
                <div>
                  <span className="text-muted-foreground">Notes: </span>
                  <span>{t.notes}</span>
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export default function SimulationPage() {
  const [tab, setTab] = useState("paper");
  const [trades, setTrades] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Historical backtest state
  const [bt_universe, setBtUniverse] = useState("nifty50");
  const [bt_interval, setBtInterval] = useState(5);
  const [bt_running, setBtRunning] = useState(false);
  const [bt_result, setBtResult] = useState<any>(null);
  const [bt_history, setBtHistory] = useState<any[]>([]);

  const loadPaperData = async () => {
    setLoading(true);
    try {
      const [tradesRes, statsRes]: any[] = await Promise.all([
        listPaperTrades(),
        getPaperTradingStats(),
      ]);
      setTrades(tradesRes.trades || []);
      setStats(statsRes);
    } catch (e: any) {
      toast.error("Failed to load paper trades");
    } finally {
      setLoading(false);
    }
  };

  const loadBacktestHistory = async () => {
    try {
      const data: any = await listRecommenderBacktests();
      setBtHistory(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => {
    loadPaperData();
    loadBacktestHistory();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const r: any = await refreshPaperTrades();
      toast.success(`Refreshed ${r.updated} trades`);
      await loadPaperData();
    } catch (e: any) {
      toast.error(e.message || "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this paper trade?")) return;
    await deletePaperTrade(id);
    toast.success("Deleted");
    loadPaperData();
  };

  const handleClose = async (id: number) => {
    await closePaperTrade(id);
    toast.success("Closed");
    loadPaperData();
  };

  const handleRunBacktest = async () => {
    setBtRunning(true);
    setBtResult(null);
    try {
      const result: any = await runRecommenderBacktest({
        universe: bt_universe,
        interval_days: bt_interval,
      });
      setBtResult(result);
      toast.success(`Backtest complete: ${result.total_signals} signals, ${result.win_rate_5d}% win rate at 5d`);
      loadBacktestHistory();
    } catch (e: any) {
      toast.error(e.message || "Backtest failed");
    } finally {
      setBtRunning(false);
    }
  };

  const handleLoadHistoricalRun = async (runId: string) => {
    try {
      const data: any = await getRecommenderBacktestResult(runId);
      // Reconstruct summary from rows
      const rows = data.rows || [];
      const with5d = rows.filter((r: any) => r.return_5d !== null);
      const wins = with5d.filter((r: any) => r.return_5d > 0).length;
      const avg = with5d.length > 0 ? with5d.reduce((s: number, r: any) => s + r.return_5d, 0) / with5d.length : 0;

      const bySignal: Record<string, any> = {};
      ["STRONG BUY", "BUY", "SELL", "STRONG SELL"].forEach((sig) => {
        const sigRows = rows.filter((r: any) => r.signal === sig && r.return_5d !== null);
        if (sigRows.length > 0) {
          const sigWins = sigRows.filter((r: any) => r.return_5d > 0).length;
          bySignal[sig] = {
            count: sigRows.length,
            win_rate: Math.round(sigWins / sigRows.length * 100 * 10) / 10,
            avg_return: Math.round(sigRows.reduce((s: number, r: any) => s + r.return_5d, 0) / sigRows.length * 100) / 100,
          };
        }
      });

      setBtResult({
        run_id: runId,
        total_signals: rows.length,
        wins_5d: wins,
        losses_5d: with5d.length - wins,
        win_rate_5d: with5d.length > 0 ? Math.round(wins / with5d.length * 100 * 10) / 10 : 0,
        avg_return_5d: Math.round(avg * 100) / 100,
        by_signal: bySignal,
        rows,
      });
    } catch (e: any) {
      toast.error("Failed to load backtest");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FlaskConical className="h-6 w-6" />
          Simulation
        </h1>
        <p className="text-sm text-muted-foreground">
          Paper trading + historical backtest. Validate the recommendation engine without risking real money.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="paper">Paper Trades ({trades.length})</TabsTrigger>
          <TabsTrigger value="historical">Historical Backtest</TabsTrigger>
        </TabsList>

        {/* === PAPER TRADING === */}
        <TabsContent value="paper" className="space-y-4">
          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card>
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground">Total Trades</p>
                  <p className="text-2xl font-bold">{stats.total_trades}</p>
                  <p className="text-xs text-muted-foreground">{stats.active} active</p>
                </CardContent>
              </Card>
              {["1d", "3d", "5d", "10d"].map((h) => {
                const s = stats[`horizon_${h}`];
                return (
                  <Card key={h} className={s.count > 0 && s.win_rate >= 55 ? "border-green-200" : ""}>
                    <CardContent className="p-3 text-center">
                      <p className="text-xs text-muted-foreground uppercase">{h} horizon</p>
                      <p className="text-lg font-bold">{s.win_rate}% win</p>
                      <p className={`text-xs ${s.avg_return >= 0 ? "text-green-600" : "text-red-600"}`}>
                        avg {s.avg_return >= 0 ? "+" : ""}{s.avg_return}%
                      </p>
                      <p className="text-[10px] text-muted-foreground">{s.count} closed</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Actions */}
          <Card>
            <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="text-sm text-muted-foreground">
                Open trades from <a href="/recommendations" className="text-primary hover:underline">Top Picks</a> or <a href="/" className="text-primary hover:underline">Dashboard</a>. Prices update automatically when you refresh.
              </div>
              <Button onClick={handleRefresh} disabled={refreshing} variant="outline" size="sm">
                {refreshing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Refresh Prices
              </Button>
            </CardContent>
          </Card>

          {/* Stats by Strategy */}
          {trades.length > 0 && (() => {
            const byStrategy: Record<string, any[]> = {};
            trades.forEach((t: any) => {
              const key = t.strategy || sourceConfig[t.source]?.label || t.source || "manual";
              if (!byStrategy[key]) byStrategy[key] = [];
              byStrategy[key].push(t);
            });

            const statsPerStrategy = Object.entries(byStrategy).map(([strategy, list]) => {
              const with5d = list.filter((t: any) => t.pnl_5d_pct != null);
              if (with5d.length === 0) return { strategy, count: list.length, win_rate: null, avg: null };
              const wins = with5d.filter((t: any) => t.pnl_5d_pct > 0).length;
              const avg = with5d.reduce((s: number, t: any) => s + t.pnl_5d_pct, 0) / with5d.length;
              return {
                strategy,
                count: list.length,
                closed: with5d.length,
                win_rate: Math.round(wins / with5d.length * 100),
                avg: Math.round(avg * 100) / 100,
              };
            });

            return statsPerStrategy.length > 1 ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Performance by Strategy (5-day horizon)</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Strategy</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Closed</TableHead>
                        <TableHead className="text-right">Win Rate</TableHead>
                        <TableHead className="text-right">Avg Return</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {statsPerStrategy.map((s: any) => (
                        <TableRow key={s.strategy}>
                          <TableCell className="font-medium">{s.strategy}</TableCell>
                          <TableCell className="text-right">{s.count}</TableCell>
                          <TableCell className="text-right">{s.closed || 0}</TableCell>
                          <TableCell className={`text-right font-semibold ${s.win_rate >= 55 ? "text-green-600" : s.win_rate != null && s.win_rate < 45 ? "text-red-600" : ""}`}>
                            {s.win_rate != null ? `${s.win_rate}%` : "—"}
                          </TableCell>
                          <TableCell className={`text-right ${s.avg >= 0 ? "text-green-600" : "text-red-600"}`}>
                            {s.avg != null ? `${s.avg >= 0 ? "+" : ""}${s.avg}%` : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : null;
          })()}

          {/* Trades table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">All Paper Trades</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-6"></TableHead>
                      <TableHead>Entry Date</TableHead>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Signal</TableHead>
                      <TableHead>Dir</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">+1d</TableHead>
                      <TableHead className="text-right">+3d</TableHead>
                      <TableHead className="text-right">+5d</TableHead>
                      <TableHead className="text-right">+10d</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={13} className="text-center py-6 text-muted-foreground">Loading...</TableCell></TableRow>
                    ) : trades.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={13} className="text-center py-8 text-muted-foreground">
                          No paper trades yet. Open one from the recommendations page.
                        </TableCell>
                      </TableRow>
                    ) : trades.map((t: any) => (
                      <PaperTradeRow key={t.id} t={t} onClose={handleClose} onDelete={handleDelete} />
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* === HISTORICAL BACKTEST === */}
        <TabsContent value="historical" className="space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div>
                <p className="text-sm font-medium mb-1">Run Historical Backtest</p>
                <p className="text-xs text-muted-foreground">
                  Replays the recommendation engine on past dates and measures actual outcomes 1/3/5/10 days later. FREE (no AI cost, ~30-120 sec).
                </p>
              </div>
              <div className="flex gap-3 items-end flex-wrap">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Universe</label>
                  <div className="flex gap-1">
                    {[
                      { v: "nifty50", l: "NIFTY 50" },
                      { v: "nifty100", l: "NIFTY 100" },
                      { v: "bse250", l: "BSE 250" },
                    ].map((u) => (
                      <Button
                        key={u.v}
                        size="sm"
                        variant={bt_universe === u.v ? "default" : "outline"}
                        onClick={() => setBtUniverse(u.v)}
                        disabled={bt_running}
                      >
                        {u.l}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Interval (days)</label>
                  <Input
                    type="number"
                    value={bt_interval}
                    onChange={(e) => setBtInterval(Number(e.target.value))}
                    className="w-24"
                    disabled={bt_running}
                  />
                </div>
                <Button onClick={handleRunBacktest} disabled={bt_running}>
                  {bt_running ? (
                    <><Loader2 className="h-3 w-3 animate-spin mr-1" />Running...</>
                  ) : (
                    <><Play className="h-3 w-3 mr-1" />Run Backtest</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Result */}
          {bt_result && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className={bt_result.win_rate_5d >= 55 ? "border-green-200" : "border-red-200"}>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Win Rate (5d)</p>
                    <p className={`text-2xl font-bold ${bt_result.win_rate_5d >= 55 ? "text-green-600" : "text-red-600"}`}>
                      {bt_result.win_rate_5d}%
                    </p>
                    <p className="text-xs text-muted-foreground">{bt_result.wins_5d}W / {bt_result.losses_5d}L</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Avg Return (5d)</p>
                    <p className={`text-2xl font-bold ${bt_result.avg_return_5d >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {bt_result.avg_return_5d >= 0 ? "+" : ""}{bt_result.avg_return_5d}%
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Total Signals</p>
                    <p className="text-2xl font-bold">{bt_result.total_signals}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground">Run ID</p>
                    <p className="text-sm font-mono">{bt_result.run_id}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Per-signal breakdown */}
              {bt_result.by_signal && Object.keys(bt_result.by_signal).length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">By Signal Type (5d horizon)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Signal</TableHead>
                          <TableHead className="text-right">Count</TableHead>
                          <TableHead className="text-right">Win Rate</TableHead>
                          <TableHead className="text-right">Avg Return</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(bt_result.by_signal).map(([sig, s]: any) => (
                          <TableRow key={sig}>
                            <TableCell>
                              <Badge variant="outline" className={signalColors[sig] || ""}>{sig}</Badge>
                            </TableCell>
                            <TableCell className="text-right">{s.count}</TableCell>
                            <TableCell className={`text-right font-semibold ${s.win_rate >= 55 ? "text-green-600" : s.win_rate < 45 ? "text-red-600" : ""}`}>
                              {s.win_rate}%
                            </TableCell>
                            <TableCell className={`text-right ${s.avg_return >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {s.avg_return >= 0 ? "+" : ""}{s.avg_return}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Trade details */}
              {bt_result.rows && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">All Signals ({bt_result.rows.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="max-h-[400px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Ticker</TableHead>
                            <TableHead>Signal</TableHead>
                            <TableHead className="text-right">Score</TableHead>
                            <TableHead className="text-right">Entry</TableHead>
                            <TableHead className="text-right">+1d</TableHead>
                            <TableHead className="text-right">+3d</TableHead>
                            <TableHead className="text-right">+5d</TableHead>
                            <TableHead className="text-right">+10d</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bt_result.rows.slice(0, 100).map((r: any, i: number) => (
                            <TableRow key={i}>
                              <TableCell className="text-xs">{r.trade_date}</TableCell>
                              <TableCell className="font-medium">{r.ticker}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={signalColors[r.signal] || ""}>{r.signal}</Badge>
                              </TableCell>
                              <TableCell className="text-right text-xs">{r.score}</TableCell>
                              <TableCell className="text-right text-xs">Rs.{r.entry_price}</TableCell>
                              <TableCell className="text-right text-xs"><PnLCell value={r.return_1d} /></TableCell>
                              <TableCell className="text-right text-xs"><PnLCell value={r.return_3d} /></TableCell>
                              <TableCell className="text-right text-xs"><PnLCell value={r.return_5d} /></TableCell>
                              <TableCell className="text-right text-xs"><PnLCell value={r.return_10d} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* Past runs */}
          {bt_history.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Past Backtest Runs
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Run ID</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Signals</TableHead>
                      <TableHead className="text-right">Wins</TableHead>
                      <TableHead className="text-right">Avg 5d Return</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bt_history.map((h: any) => (
                      <TableRow key={h.run_id}>
                        <TableCell className="font-mono text-xs">{h.run_id}</TableCell>
                        <TableCell className="text-xs">{h.created_at}</TableCell>
                        <TableCell className="text-right">{h.signals}</TableCell>
                        <TableCell className="text-right">{h.wins}/{h.signals}</TableCell>
                        <TableCell className={`text-right ${h.avg_return_5d >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {h.avg_return_5d >= 0 ? "+" : ""}{(h.avg_return_5d || 0).toFixed(2)}%
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="ghost" className="h-6" onClick={() => handleLoadHistoricalRun(h.run_id)}>
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <HelpSection title="How to Use Simulation" items={simulationHelp} />
    </div>
  );
}
