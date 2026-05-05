"use client";

import { useEffect, useState } from "react";
import {
  getVerdictCalibration,
  forceSnapshotVerdict,
  backfillVerdictOutcomes,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpSection } from "@/components/HelpSection";
import {
  Loader2,
  RefreshCw,
  Target,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Camera,
  Database,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

type Outcomes = { correct: number; wrong: number; neutral: number; ripe: number };
type VerdictBucket = {
  n: number;
  avg_return_1d_pct: number | null;
  avg_return_3d_pct: number | null;
  avg_return_5d_pct: number | null;
  accuracy_1d: number | null;
  accuracy_3d: number | null;
  accuracy_5d: number | null;
  outcomes_1d: Outcomes;
  outcomes_3d: Outcomes;
  outcomes_5d: Outcomes;
};
type RecentRow = {
  date: string;
  verdict: string;
  label: string;
  caution_count: number;
  favorable_count: number;
  caution_flags: string[];
  favorable_flags: string[];
  nifty_close: number | null;
  nifty_return_1d_pct: number | null;
  nifty_return_3d_pct: number | null;
  nifty_return_5d_pct: number | null;
  outcome_1d: string | null;
  outcome_3d: string | null;
  outcome_5d: string | null;
};
type Calibration = {
  lookback_days: number;
  total_snapshots: number;
  by_verdict: Record<string, VerdictBucket>;
  recent: RecentRow[];
};

const helpItems = [
  {
    question: "What does this page measure?",
    answer:
      "Every day the dashboard's Daily Verdict makes a directional call:\n  • GREEN = market should rise → take trades\n  • RED = market is risky → stand down\n  • YELLOW = quiet day, no edge → trade selectively\n\nThis page checks if those calls actually came true. Each morning we snapshot the verdict + Nifty close. After 1, 3, and 5 trading days we record what Nifty actually did and grade the call.",
  },
  {
    question: "How is accuracy calculated?",
    answer:
      "GREEN is correct when Nifty rises >0.10% in the window, wrong when it falls >0.10%, neutral otherwise.\n\nRED is correct when Nifty falls >0.10%, wrong when it rises >0.10%, neutral otherwise.\n\nYELLOW says 'quiet day' — correct when Nifty stays inside ±0.50%, wrong when it breaks out either way.\n\nAccuracy = correct / (correct + wrong). Neutrals are excluded so a ±0.05% noise day doesn't pollute the score.",
  },
  {
    question: "What does this tell me?",
    answer:
      "If GREEN days have 65% accuracy and avg return +0.4%, the verdict is genuinely predictive on bullish days — trust it.\n\nIf RED days have 51% accuracy and avg return +0.1%, the verdict is calling RED too aggressively — the filter thresholds are too conservative, and you'd actually do better trading on RED days.\n\nIf YELLOW days have 70% 'quiet' accuracy, the system correctly identifies low-edge days you can skip without missing much.\n\nThe calibration evolves as you accumulate snapshots. After ~30 days of data you'll have honest verdict performance.",
  },
  {
    question: "When does data populate?",
    answer:
      "Snapshots happen automatically the first time you load the Dashboard each day (the /api/daily-verdict/ call has a hook).\n\nForward Nifty closes backfill on every visit to this page (1d ripens after 1 trading day, etc.).\n\nClick 'Force Snapshot' to overwrite today's snapshot if the verdict changed mid-day. Click 'Backfill Now' to manually fill any missing forward returns.",
  },
];

const VERDICT_ORDER = ["GREEN", "YELLOW", "RED"];

const verdictStyles: Record<string, string> = {
  GREEN: "bg-green-50 text-green-700 border-green-300",
  YELLOW: "bg-yellow-50 text-yellow-700 border-yellow-300",
  RED: "bg-red-50 text-red-700 border-red-300",
};

function OutcomeIcon({ outcome }: { outcome: string | null }) {
  if (!outcome) return <span className="text-muted-foreground text-xs">—</span>;
  if (outcome === "predicted_correctly")
    return <CheckCircle2 className="h-4 w-4 text-green-600 inline" aria-label="correct" />;
  if (outcome === "predicted_wrong")
    return <XCircle className="h-4 w-4 text-red-600 inline" aria-label="wrong" />;
  return <MinusCircle className="h-4 w-4 text-muted-foreground inline" aria-label="neutral" />;
}

function formatReturn(pct: number | null): string {
  if (pct === null || pct === undefined) return "—";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function formatAccuracy(acc: number | null, outcomes: Outcomes): string {
  if (acc === null) return outcomes.ripe === 0 ? "no ripe data" : "no decisive";
  return `${(acc * 100).toFixed(0)}%`;
}

export default function VerdictCalibrationPage() {
  const [data, setData] = useState<Calibration | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [windowDays, setWindowDays] = useState(90);

  const load = async () => {
    setLoading(true);
    try {
      const res: any = await getVerdictCalibration(windowDays);
      setData(res);
    } catch (e: any) {
      toast.error(e.message || "Failed to load calibration");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [windowDays]);

  const snapshot = async () => {
    setBusy(true);
    try {
      const res: any = await forceSnapshotVerdict();
      toast.success(
        res?.status === "ok"
          ? `Snapshotted ${res.verdict} for ${res.date}`
          : "Snapshot completed"
      );
      await load();
    } catch (e: any) {
      toast.error(e.message || "Snapshot failed");
    }
    setBusy(false);
  };

  const backfill = async () => {
    setBusy(true);
    try {
      const res: any = await backfillVerdictOutcomes();
      toast.success(`Backfilled ${res?.snapshots_updated ?? 0} snapshot(s)`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Backfill failed");
    }
    setBusy(false);
  };

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6 text-blue-600" />
            Verdict Calibration
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Does the Daily Verdict actually predict Nifty's move? Every day's call gets graded.
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
      <Card className="border-blue-200 bg-blue-50/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-blue-100 flex-shrink-0">
              <Target className="h-5 w-5 text-blue-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm mb-2">How to use this page</h3>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li><span className="text-foreground font-medium">Let it run:</span> Just load the Dashboard daily — snapshots happen automatically. No action needed for the first ~30 days.</li>
                <li><span className="text-foreground font-medium">Check accuracy weekly:</span> After 30 days you'll have ~22 ripe snapshots. Look at the 5d Acc column for each verdict.</li>
                <li><span className="text-foreground font-medium">Trust the verdicts that work:</span> If GREEN has 60%+ accuracy and positive avg return — trade with confidence on GREEN days at full size.</li>
                <li><span className="text-foreground font-medium">Override the ones that don't:</span> If RED has &lt;50% accuracy and positive avg return — the filter is over-cautious. Loosen thresholds in <code className="text-xs bg-muted px-1 rounded">backend/daily_verdict.py</code> or simply ignore RED days.</li>
                <li><span className="text-foreground font-medium">Watch YELLOW carefully:</span> If YELLOW's "quiet day" accuracy is high, you're correctly skipping noise. If low, the verdict is missing real opportunities — tighten its triggers.</li>
                <li><span className="text-foreground font-medium">Sanity check via Recent Snapshots:</span> Scan the table for ✗ patterns — if RED days keep getting wrong calls during a specific period, look for what regime change happened then.</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top row: snapshot count + actions */}
      <Card>
        <CardContent className="p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Total snapshots</p>
              <p className="text-2xl font-bold">{data?.total_snapshots ?? "—"}</p>
              <p className="text-xs text-muted-foreground">in last {windowDays} days</p>
            </div>
            {VERDICT_ORDER.map((v) => {
              const bucket = data?.by_verdict[v];
              return (
                <div key={v}>
                  <p className="text-xs text-muted-foreground">{v} days</p>
                  <p className="text-2xl font-bold">{bucket?.n ?? 0}</p>
                  <p className="text-xs text-muted-foreground">
                    {bucket?.accuracy_5d != null
                      ? `${(bucket.accuracy_5d * 100).toFixed(0)}% accurate at 5d`
                      : "no ripe data yet"}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 mt-4 pt-4 border-t">
            <Button onClick={snapshot} disabled={busy} size="sm" variant="outline">
              <Camera className="h-3 w-3 mr-1" />
              Force Snapshot Now
            </Button>
            <Button onClick={backfill} disabled={busy} size="sm" variant="outline">
              <Database className="h-3 w-3 mr-1" />
              Backfill Outcomes
            </Button>
            <p className="text-xs text-muted-foreground ml-auto">
              Auto-snapshots when you load the Dashboard each day.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Per-verdict accuracy table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Accuracy by Verdict</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-y">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Verdict</th>
                  <th className="px-2 py-2 font-medium text-right">Days</th>
                  <th className="px-2 py-2 font-medium text-right">1d Avg</th>
                  <th className="px-2 py-2 font-medium text-right">1d Acc</th>
                  <th className="px-2 py-2 font-medium text-right">3d Avg</th>
                  <th className="px-2 py-2 font-medium text-right">3d Acc</th>
                  <th className="px-2 py-2 font-medium text-right">5d Avg</th>
                  <th className="px-4 py-2 font-medium text-right">5d Acc</th>
                </tr>
              </thead>
              <tbody>
                {VERDICT_ORDER.map((v) => {
                  const bucket = data?.by_verdict[v];
                  if (!bucket) {
                    return (
                      <tr key={v} className="border-b">
                        <td className="px-4 py-2 font-medium">
                          <Badge variant="outline" className={verdictStyles[v]}>{v}</Badge>
                        </td>
                        <td colSpan={7} className="text-center text-muted-foreground py-2 text-xs">
                          No snapshots in window
                        </td>
                      </tr>
                    );
                  }
                  return (
                    <tr key={v} className="border-b hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={verdictStyles[v]}>{v}</Badge>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{bucket.n}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${(bucket.avg_return_1d_pct || 0) > 0 ? "text-green-700" : (bucket.avg_return_1d_pct || 0) < 0 ? "text-red-700" : ""}`}>
                        {formatReturn(bucket.avg_return_1d_pct)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatAccuracy(bucket.accuracy_1d, bucket.outcomes_1d)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${(bucket.avg_return_3d_pct || 0) > 0 ? "text-green-700" : (bucket.avg_return_3d_pct || 0) < 0 ? "text-red-700" : ""}`}>
                        {formatReturn(bucket.avg_return_3d_pct)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatAccuracy(bucket.accuracy_3d, bucket.outcomes_3d)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums ${(bucket.avg_return_5d_pct || 0) > 0 ? "text-green-700" : (bucket.avg_return_5d_pct || 0) < 0 ? "text-red-700" : ""}`}>
                        {formatReturn(bucket.avg_return_5d_pct)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{formatAccuracy(bucket.accuracy_5d, bucket.outcomes_5d)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Recent snapshots */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Snapshots</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-y">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Verdict</th>
                  <th className="px-2 py-2 font-medium">Flags</th>
                  <th className="px-2 py-2 font-medium text-right">Nifty</th>
                  <th className="px-2 py-2 font-medium text-right">1d</th>
                  <th className="px-2 py-2 font-medium text-center">1d?</th>
                  <th className="px-2 py-2 font-medium text-right">3d</th>
                  <th className="px-2 py-2 font-medium text-center">3d?</th>
                  <th className="px-2 py-2 font-medium text-right">5d</th>
                  <th className="px-4 py-2 font-medium text-center">5d?</th>
                </tr>
              </thead>
              <tbody>
                {(!data || data.recent.length === 0) && (
                  <tr><td colSpan={10} className="text-center py-8 text-muted-foreground">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin inline" /> : "No snapshots yet — load the Dashboard to take one."}
                  </td></tr>
                )}
                {data?.recent.map((row) => (
                  <tr key={row.date} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{row.date}</td>
                    <td className="px-2 py-2">
                      <Badge variant="outline" className={verdictStyles[row.verdict] || ""}>
                        {row.verdict}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      <span className="text-red-700">{row.caution_count}c</span>{" "}
                      <span className="text-green-700">{row.favorable_count}f</span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums text-xs">
                      {row.nifty_close ? row.nifty_close.toFixed(0) : "—"}
                    </td>
                    <td className={`px-2 py-2 text-right tabular-nums ${(row.nifty_return_1d_pct || 0) > 0 ? "text-green-700" : (row.nifty_return_1d_pct || 0) < 0 ? "text-red-700" : ""}`}>
                      {formatReturn(row.nifty_return_1d_pct)}
                    </td>
                    <td className="px-2 py-2 text-center"><OutcomeIcon outcome={row.outcome_1d} /></td>
                    <td className={`px-2 py-2 text-right tabular-nums ${(row.nifty_return_3d_pct || 0) > 0 ? "text-green-700" : (row.nifty_return_3d_pct || 0) < 0 ? "text-red-700" : ""}`}>
                      {formatReturn(row.nifty_return_3d_pct)}
                    </td>
                    <td className="px-2 py-2 text-center"><OutcomeIcon outcome={row.outcome_3d} /></td>
                    <td className={`px-2 py-2 text-right tabular-nums ${(row.nifty_return_5d_pct || 0) > 0 ? "text-green-700" : (row.nifty_return_5d_pct || 0) < 0 ? "text-red-700" : ""}`}>
                      {formatReturn(row.nifty_return_5d_pct)}
                    </td>
                    <td className="px-4 py-2 text-center"><OutcomeIcon outcome={row.outcome_5d} /></td>
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
