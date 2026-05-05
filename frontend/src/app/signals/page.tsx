"use client";

import { useEffect, useState } from "react";
import {
  getSignalPerformance,
  getActiveSignalWeights,
  applySignalWeights,
  resetSignalWeights,
  getSignalPerformanceByRegime,
  backfillTradeRegimes,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpSection } from "@/components/HelpSection";
import {
  Loader2,
  RefreshCw,
  Sparkles,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
  Minus,
  Undo2,
  Brain,
} from "lucide-react";
import { toast } from "sonner";

type SignalRow = {
  signal_type: string;
  weight_key: string;
  current_weight: number;
  n: number;
  wins: number;
  losses: number;
  win_rate: number;
  wilson_lower_80: number;
  avg_return_5d_pct: number;
  suggested_weight: number;
  delta: number;
  verdict: "TUNE_UP" | "TUNE_DOWN" | "KEEP" | "INSUFFICIENT_DATA";
};

type Performance = {
  lookback_days: number;
  total_closed_trades: number;
  min_sample_size: number;
  signals: SignalRow[];
};

const helpItems = [
  {
    question: "What is this page?",
    answer:
      "This is the feedback loop for the Recommendation Engine. Every paper trade stores which signals fired. After each trade closes (5-day P&L), we credit/blame each signal that was present.\n\nOver time, real win rates emerge: maybe 'Volume Spike Bullish' wins 70% of the time but 'Cyclical Bearish' only 40%. The system can then auto-tune its scoring weights so good signals count for more and bad signals count for less.",
  },
  {
    question: "How is 'win rate' calculated?",
    answer:
      "For each closed paper trade, we look at every signal that fired:\n  • Bullish signals 'win' if the stock went UP after 5 days\n  • Bearish signals 'win' if the stock went DOWN\n  • One trade with 4 signals contributes 4 observations\n\nThis is multi-attribution — it doesn't perfectly isolate which signal caused the move, but in aggregate it tells you which signals correlate with profitable trades.",
  },
  {
    question: "What's the Wilson lower bound?",
    answer:
      "A win rate of 4/5 (80%) looks great but is unreliable on 5 trades. Wilson lower bound at 80% confidence gives a more honest estimate:\n  • 4/5 wins → Wilson 0.55 (much closer to truth with small N)\n  • 40/50 wins → Wilson 0.72 (large sample, close to raw rate)\n\nWeight tuning uses Wilson, not raw win rate. This prevents over-reacting to lucky streaks.",
  },
  {
    question: "What does 'Apply Suggested Weights' do?",
    answer:
      "It writes the suggested weights to the settings table. The recommender reloads them at the start of every run, so future Top Picks will use your tuned weights.\n\nClick 'Reset to Defaults' anytime to go back to the original hardcoded weights.\n\nMinimum 10 trades per signal before a change is suggested — below that, the data isn't reliable enough.",
  },
];

type RegimeStats = {
  n: number;
  wins: number;
  win_rate: number | null;
  avg_return_5d_pct: number | null;
};
type RegimeSignal = {
  signal_type: string;
  weight_key: string;
  current_weight: number;
  total_n: number;
  by_regime: Record<string, RegimeStats>;
  regime_spread: number | null;
  is_regime_dependent: boolean;
};
type RegimePerf = {
  lookback_days: number;
  regimes: string[];
  by_signal: RegimeSignal[];
  total_tagged_trades: number;
};

const REGIME_COLORS: Record<string, string> = {
  BULL: "text-green-700",
  BEAR: "text-red-700",
  SIDEWAYS: "text-amber-700",
  HIGH_VOL: "text-purple-700",
};

export default function SignalsPage() {
  const [data, setData] = useState<Performance | null>(null);
  const [regimeData, setRegimeData] = useState<RegimePerf | null>(null);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [windowDays, setWindowDays] = useState(90);

  const load = async () => {
    setLoading(true);
    try {
      const [perf, weights, regime]: any[] = await Promise.all([
        getSignalPerformance(windowDays),
        getActiveSignalWeights(),
        getSignalPerformanceByRegime(Math.max(windowDays, 180)),
      ]);
      setData(perf);
      setOverrides(weights?.overrides || {});
      setRegimeData(regime);
    } catch (e: any) {
      toast.error(e.message || "Failed to load signal performance");
    }
    setLoading(false);
  };

  const backfillRegimes = async () => {
    try {
      const r: any = await backfillTradeRegimes();
      toast.success(`Tagged ${r.trades_updated} trade(s) with regime`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Backfill failed");
    }
  };

  useEffect(() => {
    load();
  }, [windowDays]);

  const apply = async () => {
    setApplying(true);
    try {
      const result: any = await applySignalWeights(windowDays);
      const n = result.applied?.length || 0;
      if (n === 0) {
        toast.info("No changes applied — all signals within tolerance.");
      } else {
        toast.success(`Applied ${n} weight change${n > 1 ? "s" : ""}`, {
          description: "Recommender will use these on the next run.",
        });
      }
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to apply weights");
    }
    setApplying(false);
  };

  const reset = async () => {
    if (!confirm("Reset all weights back to defaults?")) return;
    setApplying(true);
    try {
      await resetSignalWeights();
      toast.success("Weights reset to defaults");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Failed to reset");
    }
    setApplying(false);
  };

  const tunable = data?.signals.filter((s) => s.verdict !== "INSUFFICIENT_DATA") ?? [];
  const tuneUpCount = tunable.filter((s) => s.verdict === "TUNE_UP").length;
  const tuneDownCount = tunable.filter((s) => s.verdict === "TUNE_DOWN").length;
  const overrideCount = Object.keys(overrides).length;

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-600" />
            Signal Performance
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real win rate of each recommender signal — auto-tune the engine from your trade outcomes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border rounded-md px-2 py-1.5 text-sm"
            value={windowDays}
            onChange={(e) => setWindowDays(parseInt(e.target.value, 10))}
          >
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
            <option value={365}>Last 365 days</option>
          </select>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* How to use this callout */}
      <Card className="border-purple-200 bg-purple-50/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-purple-100 flex-shrink-0">
              <Brain className="h-5 w-5 text-purple-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm mb-2">How to use this page</h3>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li><span className="text-foreground font-medium">Wait for data:</span> Need ≥10 closed trades per signal. Track at least 30 paper trades from <a href="/recommendations" className="text-purple-700 underline">Top Picks</a> to get tunable signals.</li>
                <li><span className="text-foreground font-medium">Read the table:</span> Look for signals with high <em>Honest WR</em> (≥55%) — these are reliably profitable. Low <em>Honest WR</em> (≤40%) signals are fooling you.</li>
                <li><span className="text-foreground font-medium">Apply tuning:</span> Click <em>Apply Suggested Weights</em> when verdict shows <span className="text-green-700">Tune up</span> or <span className="text-red-700">Tune down</span>. Recommender uses new weights on next refresh.</li>
                <li><span className="text-foreground font-medium">Re-tune monthly:</span> Markets change. Come back every 30 days and apply again — weights drift toward what's currently working.</li>
                <li><span className="text-foreground font-medium">Reset if regime shifts:</span> After a major market event (crash, rate cut), defaults may beat stale tuned weights. Reset and re-collect data.</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary card */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Closed trades (window)</p>
              <p className="text-2xl font-bold">{data?.total_closed_trades ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tunable signals</p>
              <p className="text-2xl font-bold">{tunable.length}</p>
              <p className="text-xs text-muted-foreground">
                of {data?.signals.length ?? 0} (need ≥{data?.min_sample_size ?? 10} trades each)
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Suggested changes</p>
              <p className="text-2xl font-bold">
                <span className="text-green-700">{tuneUpCount}↑</span>{" "}
                <span className="text-red-700">{tuneDownCount}↓</span>
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Active overrides</p>
              <p className="text-2xl font-bold">{overrideCount}</p>
              <p className="text-xs text-muted-foreground">
                {overrideCount === 0 ? "Using defaults" : "Tuned weights live"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-4 pt-4 border-t">
            <Button onClick={apply} disabled={applying || tunable.length === 0} size="sm">
              {applying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
              Apply Suggested Weights
            </Button>
            <Button onClick={reset} disabled={applying || overrideCount === 0} size="sm" variant="outline">
              <Undo2 className="h-3 w-3 mr-1" />
              Reset to Defaults
            </Button>
            {data && data.total_closed_trades < 10 && (
              <span className="text-xs text-amber-700 ml-auto">
                <AlertTriangle className="h-3 w-3 inline mr-1" />
                Need more closed trades for reliable tuning ({data.total_closed_trades}/10)
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Per-signal table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-Signal Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-y">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Signal</th>
                  <th className="px-2 py-2 font-medium text-right">N</th>
                  <th className="px-2 py-2 font-medium text-right">Win Rate</th>
                  <th className="px-2 py-2 font-medium text-right" title="Wilson lower bound at 80% confidence">Honest WR</th>
                  <th className="px-2 py-2 font-medium text-right">Avg 5d %</th>
                  <th className="px-2 py-2 font-medium text-right">Current</th>
                  <th className="px-2 py-2 font-medium text-right">Suggested</th>
                  <th className="px-4 py-2 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {loading && !data && (
                  <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin inline" />
                  </td></tr>
                )}
                {data?.signals.map((s) => {
                  const overridden = s.weight_key in overrides;
                  const liveWeight = overridden ? overrides[s.weight_key] : s.current_weight;
                  return (
                    <tr key={s.weight_key} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2 font-medium">
                        {s.signal_type}
                        {overridden && (
                          <Badge variant="outline" className="ml-2 text-xs bg-purple-50 text-purple-700 border-purple-200">
                            tuned
                          </Badge>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{s.n}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {s.n > 0 ? `${(s.win_rate * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                        {s.n > 0 ? `${(s.wilson_lower_80 * 100).toFixed(0)}%` : "—"}
                      </td>
                      <td className={`px-2 py-2 text-right tabular-nums ${s.avg_return_5d_pct > 0 ? "text-green-700" : s.avg_return_5d_pct < 0 ? "text-red-700" : ""}`}>
                        {s.n > 0 ? `${s.avg_return_5d_pct > 0 ? "+" : ""}${s.avg_return_5d_pct.toFixed(2)}` : "—"}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        <span className={overridden ? "line-through text-muted-foreground" : ""}>
                          {s.current_weight > 0 ? "+" : ""}{s.current_weight.toFixed(1)}
                        </span>
                        {overridden && (
                          <span className="ml-1 font-semibold text-purple-700">
                            {liveWeight > 0 ? "+" : ""}{liveWeight.toFixed(1)}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {s.verdict === "INSUFFICIENT_DATA" ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className={s.delta > 0 ? "text-green-700 font-semibold" : s.delta < 0 ? "text-red-700 font-semibold" : ""}>
                            {s.suggested_weight > 0 ? "+" : ""}{s.suggested_weight.toFixed(1)}
                            {s.delta !== 0 && (
                              <span className="text-xs ml-1">
                                ({s.delta > 0 ? "+" : ""}{s.delta.toFixed(1)})
                              </span>
                            )}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {s.verdict === "TUNE_UP" && (
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs">
                            <TrendingUp className="h-3 w-3 mr-1" /> Tune up
                          </Badge>
                        )}
                        {s.verdict === "TUNE_DOWN" && (
                          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 text-xs">
                            <TrendingDown className="h-3 w-3 mr-1" /> Tune down
                          </Badge>
                        )}
                        {s.verdict === "KEEP" && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" /> Keep
                          </Badge>
                        )}
                        {s.verdict === "INSUFFICIENT_DATA" && (
                          <Badge variant="outline" className="text-muted-foreground text-xs">
                            <Minus className="h-3 w-3 mr-1" /> Need more trades
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Regime-conditional signal performance */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Regime-Conditional Win Rates</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Same signals, split by what the market regime was when the trade opened.
              Regime-dependent signals are flagged ⚡ — these need different weights per regime.
            </p>
          </div>
          <Button onClick={backfillRegimes} size="sm" variant="outline">
            Backfill Regimes
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-y">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Signal</th>
                  {(regimeData?.regimes || ["BULL", "BEAR", "SIDEWAYS", "HIGH_VOL"]).map((r) => (
                    <th key={r} className={`px-2 py-2 font-medium text-right ${REGIME_COLORS[r]}`}>
                      {r}
                    </th>
                  ))}
                  <th className="px-2 py-2 font-medium text-right" title="Max - min win rate across regimes with n>=5">
                    Spread
                  </th>
                  <th className="px-4 py-2 font-medium text-center">Note</th>
                </tr>
              </thead>
              <tbody>
                {(!regimeData || regimeData.by_signal.length === 0) && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-muted-foreground text-xs">
                      {regimeData?.total_tagged_trades === 0
                        ? "No trades have regime tags yet — click 'Backfill Regimes' above."
                        : "No closed trades in window."}
                    </td>
                  </tr>
                )}
                {regimeData?.by_signal.map((s) => (
                  <tr key={s.weight_key} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">
                      {s.signal_type}
                      {s.is_regime_dependent && (
                        <Badge variant="outline" className="ml-2 text-xs bg-amber-50 text-amber-700 border-amber-200">
                          ⚡ regime-dependent
                        </Badge>
                      )}
                    </td>
                    {regimeData.regimes.map((regime) => {
                      const stats = s.by_regime[regime];
                      if (!stats || stats.n === 0) {
                        return (
                          <td key={regime} className="px-2 py-2 text-right text-muted-foreground text-xs">
                            —
                          </td>
                        );
                      }
                      const wr = stats.win_rate ?? 0;
                      return (
                        <td key={regime} className="px-2 py-2 text-right tabular-nums">
                          <span className={`${wr >= 0.55 ? "text-green-700 font-semibold" : wr <= 0.40 ? "text-red-700 font-semibold" : ""}`}>
                            {(wr * 100).toFixed(0)}%
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            (n={stats.n})
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-right tabular-nums">
                      {s.regime_spread != null ? (
                        <span className={s.is_regime_dependent ? "text-amber-700 font-semibold" : "text-muted-foreground"}>
                          {(s.regime_spread * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {s.is_regime_dependent
                        ? "Use only in best-performing regime"
                        : s.regime_spread != null
                        ? "Works across regimes"
                        : "Need n≥5 in 2+ regimes"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {regimeData && regimeData.total_tagged_trades > 0 && (
              <div className="px-4 py-2 text-xs text-muted-foreground border-t">
                {regimeData.total_tagged_trades} tagged trades in last {regimeData.lookback_days} days.
                Need n≥5 in at least 2 regimes for spread calculation.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <HelpSection items={helpItems} />
    </div>
  );
}
