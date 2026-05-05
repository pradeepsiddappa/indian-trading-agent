"use client";

import { useEffect, useState } from "react";
import { getConfidenceCalibration } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpSection } from "@/components/HelpSection";
import {
  Loader2,
  RefreshCw,
  Gauge,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

type Bin = {
  label: string;
  low: number;
  high: number;
  n: number;
  predicted_avg: number | null;
  actual_win_rate: number | null;
  gap: number | null;
};
type Calibration = {
  lookback_days: number;
  n: number;
  brier_score: number | null;
  brier_baseline_50: number;
  brier_improvement_pct: number | null;
  calibration_quality: string;
  overall_predicted_avg: number | null;
  overall_actual_win_rate: number | null;
  calibration_gap: number | null;
  verdict: string;
  bins: Bin[];
};

const helpItems = [
  {
    question: "What does this page measure?",
    answer:
      "The recommender outputs a `success_probability` (e.g., 65%) for every pick. This page checks if that number is honest:\n\n  • If it says 65% and trades actually win 65% of the time → well-calibrated, trustworthy\n  • If it says 65% but trades only win 50% → overconfident, the number is inflated\n  • If it says 65% but trades win 75% → underconfident, you should size up\n\nWithout calibration data, the probability shown to you is just marketing.",
  },
  {
    question: "What is Brier score?",
    answer:
      "A single number that measures how good your probability predictions are.\n\n  brier = mean((predicted_prob - actual_outcome)²)\n\nLower is better. Reference points:\n  • 0.00  = perfect\n  • 0.15  = excellent\n  • 0.20  = good\n  • 0.25  = fair (always-predict-50% baseline)\n  • >0.25 = worse than guessing\n\nThe % improvement vs baseline tells you how much real signal the model has — 25% improvement means the recommender is genuinely informative.",
  },
  {
    question: "What is the reliability diagram?",
    answer:
      "Bins trades by predicted probability (50-60%, 60-70%, etc.) and shows actual win rate per bucket.\n\nA perfectly calibrated system has bars equal to the bucket midpoint. Overconfidence shows as bars BELOW the midpoint (engine says 70%, reality is 55%). Underconfidence is the opposite.\n\nThe 'gap' column makes this concrete: positive = underconfident in that bucket, negative = overconfident.",
  },
  {
    question: "How is the verdict computed?",
    answer:
      "Compares the overall mean predicted probability to the overall actual win rate:\n\n  • |gap| ≤ 5%   → well-calibrated, trust the numbers\n  • gap < -5%   → overconfident, derate stated probabilities by the gap\n  • gap > +5%   → underconfident, the engine is conservative\n\nThis is per-window — a 30-day overconfidence streak doesn't mean the engine is broken forever, but it's a flag worth acting on.",
  },
  {
    question: "How do I use this practically?",
    answer:
      "1. If overconfident: mentally subtract the gap from any displayed probability. e.g., engine says 70%, gap is -10%, treat it as 60%.\n\n2. If underconfident: trust the engine more, take larger positions on its high-conviction calls.\n\n3. Watch for bin-specific patterns: maybe 60-70% is honest but 80%+ is wildly overconfident. That tells you the engine is bad at extreme calls.\n\n4. After 50+ closed trades the picture stabilizes. Re-check monthly and adjust the success_probability formula coefficients in backend/recommender.py if there's a persistent gap.",
  },
];

const QUALITY_STYLES: Record<string, string> = {
  excellent: "bg-green-100 text-green-800 border-green-300",
  good: "bg-green-50 text-green-700 border-green-200",
  fair: "bg-amber-50 text-amber-700 border-amber-300",
  poor: "bg-red-50 text-red-700 border-red-300",
  no_data: "bg-muted text-muted-foreground border",
};

const VERDICT_STYLES: Record<string, { color: string; icon: any; label: string }> = {
  well_calibrated: { color: "text-green-700", icon: CheckCircle2, label: "Well-calibrated" },
  overconfident: { color: "text-red-700", icon: TrendingDown, label: "Overconfident" },
  underconfident: { color: "text-amber-700", icon: TrendingUp, label: "Underconfident" },
  no_data: { color: "text-muted-foreground", icon: AlertTriangle, label: "No data" },
};

function pct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export default function ConfidenceCalibrationPage() {
  const [data, setData] = useState<Calibration | null>(null);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(180);

  const load = async () => {
    setLoading(true);
    try {
      const r: any = await getConfidenceCalibration(windowDays);
      setData(r);
    } catch (e: any) {
      toast.error(e.message || "Failed to load calibration");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [windowDays]);

  const verdict = data ? VERDICT_STYLES[data.verdict] || VERDICT_STYLES.no_data : VERDICT_STYLES.no_data;
  const VerdictIcon = verdict.icon;

  // Reliability diagram data — plot active bins only
  const activeBins = data?.bins.filter((b) => b.n > 0) ?? [];

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Gauge className="h-6 w-6 text-cyan-600" />
            Confidence Calibration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Is the recommender's stated probability honest? Brier score + reliability diagram from your closed trades.
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

      {/* How to use callout */}
      <Card className="border-cyan-200 bg-cyan-50/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-cyan-100 flex-shrink-0">
              <Gauge className="h-5 w-5 text-cyan-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm mb-2">How to use this page</h3>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li><span className="text-foreground font-medium">Read the verdict pill:</span> "Overconfident" means the recommender's % is inflated — derate it. "Underconfident" means trust the engine more on high-prob calls.</li>
                <li><span className="text-foreground font-medium">Check Brier improvement:</span> 20%+ improvement over the 50% baseline means the engine has real signal. &lt;5% means you may as well guess.</li>
                <li><span className="text-foreground font-medium">Scan the bin table:</span> Maybe 60-70% bin is honest but 80%+ is wildly overconfident — only trust the bucket where actual ≈ predicted.</li>
                <li><span className="text-foreground font-medium">Adjust your sizing:</span> If the engine claims 70% but reality is 55%, treat displayed probabilities as `actual = stated × 0.79` for position sizing decisions.</li>
                <li><span className="text-foreground font-medium">Re-check monthly:</span> Calibration drifts. Persistent overconfidence means the success_probability formula in backend/recommender.py needs retuning.</li>
                <li><span className="text-foreground font-medium">Need data:</span> Stable picture after ~50 closed trades. Below 20 trades, the gap is mostly noise.</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Headline metrics */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Verdict</p>
              <div className="flex items-center gap-2 mt-1">
                <VerdictIcon className={`h-5 w-5 ${verdict.color}`} />
                <span className={`text-base font-semibold ${verdict.color}`}>{verdict.label}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Gap: {data?.calibration_gap != null
                  ? `${data.calibration_gap > 0 ? "+" : ""}${(data.calibration_gap * 100).toFixed(1)}%`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Brier score</p>
              <p className="text-2xl font-bold">{data?.brier_score?.toFixed(3) ?? "—"}</p>
              <Badge variant="outline" className={`text-xs ${QUALITY_STYLES[data?.calibration_quality || "no_data"]}`}>
                {data?.calibration_quality?.replace("_", " ") || "no data"}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Improvement vs baseline</p>
              <p className="text-2xl font-bold">
                {data?.brier_improvement_pct != null
                  ? `${data.brier_improvement_pct > 0 ? "+" : ""}${data.brier_improvement_pct.toFixed(1)}%`
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">vs always-predict-50%</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sample size</p>
              <p className="text-2xl font-bold">{data?.n ?? 0}</p>
              <p className="text-xs text-muted-foreground">closed trades</p>
            </div>
          </div>

          {data && data.n > 0 && (
            <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Engine says (avg)</p>
                <p className="text-xl font-semibold">{pct(data.overall_predicted_avg, 1)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Reality (actual win rate)</p>
                <p className="text-xl font-semibold">{pct(data.overall_actual_win_rate, 1)}</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Reliability diagram */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reliability Diagram</CardTitle>
          <p className="text-xs text-muted-foreground">
            For each predicted-probability bin, blue = what the engine claimed, gold = actual win rate.
            Perfect calibration = bars match.
          </p>
        </CardHeader>
        <CardContent>
          {activeBins.length === 0 ? (
            <div className="text-center text-muted-foreground py-12 text-sm">
              {loading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : "No closed trades in window."}
            </div>
          ) : (
            <div className="space-y-3">
              {activeBins.map((bin) => {
                const predPct = (bin.predicted_avg ?? 0) * 100;
                const actualPct = (bin.actual_win_rate ?? 0) * 100;
                const gap = bin.gap ?? 0;
                return (
                  <div key={bin.label}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-medium">{bin.label} <span className="text-muted-foreground">(n={bin.n})</span></span>
                      <span className={gap < -0.05 ? "text-red-700" : gap > 0.05 ? "text-amber-700" : "text-muted-foreground"}>
                        gap {gap > 0 ? "+" : ""}{(gap * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-blue-700 w-20 flex-shrink-0">predicted</span>
                        <div className="flex-1 bg-muted rounded h-5 overflow-hidden relative">
                          <div className="bg-blue-500 h-full" style={{ width: `${predPct}%` }} />
                          <span className="absolute inset-0 flex items-center px-2 text-xs font-medium">
                            {predPct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-amber-700 w-20 flex-shrink-0">actual</span>
                        <div className="flex-1 bg-muted rounded h-5 overflow-hidden relative">
                          <div className="bg-amber-500 h-full" style={{ width: `${actualPct}%` }} />
                          <span className="absolute inset-0 flex items-center px-2 text-xs font-medium">
                            {actualPct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bin table — full breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-Bin Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-y">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Probability bin</th>
                  <th className="px-2 py-2 font-medium text-right">N</th>
                  <th className="px-2 py-2 font-medium text-right">Predicted avg</th>
                  <th className="px-2 py-2 font-medium text-right">Actual win rate</th>
                  <th className="px-4 py-2 font-medium text-right">Gap</th>
                </tr>
              </thead>
              <tbody>
                {data?.bins.map((bin) => (
                  <tr key={bin.label} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2 font-medium">{bin.label}</td>
                    <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{bin.n}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{pct(bin.predicted_avg, 1)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{pct(bin.actual_win_rate, 1)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {bin.gap == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className={bin.gap < -0.05 ? "text-red-700 font-semibold" : bin.gap > 0.05 ? "text-amber-700 font-semibold" : "text-muted-foreground"}>
                          {bin.gap > 0 ? "+" : ""}{(bin.gap * 100).toFixed(1)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <HelpSection items={helpItems} />
    </div>
  );
}
