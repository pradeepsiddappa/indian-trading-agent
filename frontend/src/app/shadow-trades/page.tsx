"use client";

import { useEffect, useState } from "react";
import {
  listShadowTrades,
  getShadowComparison,
  refreshShadowTrades,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpSection } from "@/components/HelpSection";
import {
  Loader2,
  RefreshCw,
  Eye,
  CheckCircle2,
  XCircle,
  Database,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";

type Signal = { type: string; direction: string; value: string; weight: number };
type ShadowTrade = {
  ticker: string;
  signal_date: string;
  signal: string;
  score: number;
  confidence: string;
  success_probability: number;
  triggered_signals: Signal[] | string | null;
  regime_at_entry: string | null;
  entry_price: number;
  price_1d: number | null;
  price_3d: number | null;
  price_5d: number | null;
  price_10d: number | null;
  pnl_1d_pct: number | null;
  pnl_3d_pct: number | null;
  pnl_5d_pct: number | null;
  pnl_10d_pct: number | null;
  user_tracked: number;
};
type ListResp = { window_days: number; count: number; trades: ShadowTrade[] };
type Stats = { n: number; win_rate_5d: number | null; avg_return_5d_pct: number | null; median_return_5d_pct: number | null };
type Comparison = {
  lookback_days: number;
  all_shadow: Stats;
  tracked_by_user: Stats;
  skipped_by_user: Stats;
  strong_buys: Stats;
  high_conf_buys: Stats;
  filter_verdict: string;
  filter_message: string;
};

const helpItems = [
  {
    question: "What does this page do?",
    answer:
      "Every time the recommender produces a STRONG BUY (or HIGH-confidence BUY), the system auto-records it here as a 'shadow trade' regardless of whether you clicked Track.\n\nAfter 1/3/5/10 trading days, actual price moves are backfilled. You now have ground-truth data on what would have happened to every recommendation, not just the ones you acted on.",
  },
  {
    question: "Why is this useful?",
    answer:
      "Without shadow trades, you only learn from picks you took. Every winner you skipped is invisible. Shadow trades capture those false negatives.\n\nThe Comparison card surfaces: did your skipped picks win MORE than your tracked picks? If yes, you're filtering out winners — your gut is wrong about which recs to act on. If skipped < tracked, your filter is adding value.",
  },
  {
    question: "When does data populate?",
    answer:
      "Shadow recording happens automatically every time you load Top Picks or call /api/recommend/. Backfill runs whenever you click 'Refresh' on a paper trade or this page's button.\n\nMost shadow trades will have null P&L for a few days after the signal date — that's expected. Come back in 5 days for the full picture.",
  },
  {
    question: "What's user_tracked?",
    answer:
      "1 means you ALSO opened a paper trade for this ticker on the same day (you acted on the rec).\n0 means you skipped it.\n\nThe Comparison card splits stats by this flag so you can see if your acting-vs-skipping decisions are profitable.",
  },
  {
    question: "How do I use this practically?",
    answer:
      "1. Wait for ~30 days of data (need 5+ tracked + 5+ skipped picks for a verdict)\n\n2. Read the verdict pill at the top:\n  • 'Filter helps' → keep being selective\n  • 'Filter hurts' → trust the recommender more, take more picks\n  • 'Filter neutral' → no edge yet, act less and watch more data\n\n3. Scan the table for tickers you skipped that turned into big winners — these are training data for what your filter is missing\n\n4. After 50+ shadows, the recommender's true win rate (independent of your behavior) becomes solid. Use it to size positions.",
  },
];

const VERDICT_STYLES: Record<string, { color: string; label: string; icon: any }> = {
  filter_hurts: { color: "text-red-700", label: "Filter HURTS", icon: AlertTriangle },
  filter_helps: { color: "text-green-700", label: "Filter HELPS", icon: CheckCircle2 },
  filter_neutral: { color: "text-amber-700", label: "Filter NEUTRAL", icon: Sparkles },
  insufficient_data: { color: "text-muted-foreground", label: "Insufficient data", icon: Database },
};

const REGIME_COLORS: Record<string, string> = {
  BULL: "text-green-700 bg-green-50 border-green-200",
  BEAR: "text-red-700 bg-red-50 border-red-200",
  SIDEWAYS: "text-amber-700 bg-amber-50 border-amber-200",
  HIGH_VOL: "text-purple-700 bg-purple-50 border-purple-200",
};

function formatPnl(pct: number | null) {
  if (pct == null) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={pct > 0 ? "text-green-700" : pct < 0 ? "text-red-700" : ""}>
      {pct > 0 ? "+" : ""}
      {pct.toFixed(2)}%
    </span>
  );
}

export default function ShadowTradesPage() {
  const [list, setList] = useState<ListResp | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [windowDays, setWindowDays] = useState(90);

  const load = async () => {
    setLoading(true);
    try {
      const [l, c]: any[] = await Promise.all([
        listShadowTrades(windowDays),
        getShadowComparison(windowDays),
      ]);
      setList(l);
      setComparison(c);
    } catch (e: any) {
      toast.error(e.message || "Failed to load shadow trades");
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [windowDays]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r: any = await refreshShadowTrades();
      toast.success(`Refreshed ${r.updated} shadow trade(s)`);
      await load();
    } catch (e: any) {
      toast.error(e.message || "Refresh failed");
    }
    setRefreshing(false);
  };

  const verdict = comparison
    ? VERDICT_STYLES[comparison.filter_verdict] || VERDICT_STYLES.insufficient_data
    : VERDICT_STYLES.insufficient_data;
  const VIcon = verdict.icon;

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Eye className="h-6 w-6 text-indigo-600" />
            Shadow Trades
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Counterfactual learning — every STRONG BUY auto-tracked, even if you skipped it.
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
          <Button onClick={refresh} disabled={refreshing} size="sm" variant="outline">
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Database className="h-3 w-3 mr-1" />}
            Backfill prices
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* How to use callout */}
      <Card className="border-indigo-200 bg-indigo-50/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-indigo-100 flex-shrink-0">
              <Eye className="h-5 w-5 text-indigo-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm mb-2">How to use this page</h3>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li><span className="text-foreground font-medium">It runs itself:</span> Every time you load Top Picks, STRONG BUYs and HIGH-confidence BUYs are auto-recorded as shadow trades. No action needed.</li>
                <li><span className="text-foreground font-medium">Wait ~30 days:</span> Need ≥5 tracked + ≥5 skipped picks before the verdict pill is meaningful.</li>
                <li><span className="text-foreground font-medium">Read the comparison:</span> The "Skipped vs Tracked" delta tells you if your gut is filtering out winners. Skipped &gt; Tracked = your filter hurts.</li>
                <li><span className="text-foreground font-medium">Scan for missed winners:</span> Look at rows with <code>user_tracked=0</code> and big positive 5d P&L. These are picks you wrongly skipped — what made you skip?</li>
                <li><span className="text-foreground font-medium">Click 'Backfill prices':</span> Forces yfinance lookup for ripe horizons. Normally happens automatically with paper trade refreshes.</li>
                <li><span className="text-foreground font-medium">Long-term:</span> Once you have 50+ shadow trades, the recommender's true win rate becomes solid — use it to calibrate position sizing rather than relying on stated success_probability alone.</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison: tracked vs skipped */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Filter Verdict — are you skipping winners?</CardTitle>
        </CardHeader>
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <VIcon className={`h-6 w-6 ${verdict.color}`} />
            <span className={`text-lg font-semibold ${verdict.color}`}>{verdict.label}</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">{comparison?.filter_message}</p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">All shadow trades</p>
              <p className="text-2xl font-bold">{comparison?.all_shadow.n ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                {comparison?.all_shadow.win_rate_5d != null
                  ? `${(comparison.all_shadow.win_rate_5d * 100).toFixed(0)}% win, +${comparison.all_shadow.avg_return_5d_pct?.toFixed(2)}% avg`
                  : "no ripe data yet"}
              </p>
            </div>
            <div>
              <p className="text-xs text-green-700">You tracked these</p>
              <p className="text-2xl font-bold text-green-700">{comparison?.tracked_by_user.n ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                {comparison?.tracked_by_user.win_rate_5d != null
                  ? `${(comparison.tracked_by_user.win_rate_5d * 100).toFixed(0)}% win, +${comparison.tracked_by_user.avg_return_5d_pct?.toFixed(2)}% avg`
                  : "no ripe data"}
              </p>
            </div>
            <div>
              <p className="text-xs text-red-700">You SKIPPED these</p>
              <p className="text-2xl font-bold text-red-700">{comparison?.skipped_by_user.n ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                {comparison?.skipped_by_user.win_rate_5d != null
                  ? `${(comparison.skipped_by_user.win_rate_5d * 100).toFixed(0)}% win, +${comparison.skipped_by_user.avg_return_5d_pct?.toFixed(2)}% avg`
                  : "no ripe data"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">STRONG BUYs only</p>
              <p className="text-2xl font-bold">{comparison?.strong_buys.n ?? 0}</p>
              <p className="text-xs text-muted-foreground">
                {comparison?.strong_buys.win_rate_5d != null
                  ? `${(comparison.strong_buys.win_rate_5d * 100).toFixed(0)}% win, +${comparison.strong_buys.avg_return_5d_pct?.toFixed(2)}% avg`
                  : "no ripe data"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trades list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All Shadow Trades ({list?.count ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-y">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-2 py-2 font-medium">Ticker</th>
                  <th className="px-2 py-2 font-medium">Signal</th>
                  <th className="px-2 py-2 font-medium">Conf</th>
                  <th className="px-2 py-2 font-medium">Regime</th>
                  <th className="px-2 py-2 font-medium text-right">Pred%</th>
                  <th className="px-2 py-2 font-medium text-right">Entry</th>
                  <th className="px-2 py-2 font-medium text-right">1d</th>
                  <th className="px-2 py-2 font-medium text-right">3d</th>
                  <th className="px-2 py-2 font-medium text-right">5d</th>
                  <th className="px-2 py-2 font-medium text-right">10d</th>
                  <th className="px-4 py-2 font-medium text-center">Tracked</th>
                </tr>
              </thead>
              <tbody>
                {(!list || list.trades.length === 0) && (
                  <tr><td colSpan={12} className="text-center py-8 text-muted-foreground text-xs">
                    {loading ? <Loader2 className="h-5 w-5 animate-spin inline" /> :
                      "No shadow trades yet — visit Top Picks to generate some."}
                  </td></tr>
                )}
                {list?.trades.map((t) => (
                  <tr key={`${t.ticker}-${t.signal_date}`} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-2 font-mono text-xs">{t.signal_date}</td>
                    <td className="px-2 py-2 font-semibold">{t.ticker}</td>
                    <td className="px-2 py-2">
                      <Badge variant="outline" className={t.signal === "STRONG BUY" ? "bg-green-100 text-green-800 border-green-300 text-xs" : "bg-blue-50 text-blue-700 border-blue-200 text-xs"}>
                        {t.signal}
                      </Badge>
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">{t.confidence}</td>
                    <td className="px-2 py-2">
                      {t.regime_at_entry && (
                        <Badge variant="outline" className={`text-xs ${REGIME_COLORS[t.regime_at_entry] || ""}`}>
                          {t.regime_at_entry}
                        </Badge>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{t.success_probability}%</td>
                    <td className="px-2 py-2 text-right tabular-nums">Rs.{t.entry_price?.toFixed(0)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatPnl(t.pnl_1d_pct)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatPnl(t.pnl_3d_pct)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatPnl(t.pnl_5d_pct)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">{formatPnl(t.pnl_10d_pct)}</td>
                    <td className="px-4 py-2 text-center">
                      {t.user_tracked === 1
                        ? <CheckCircle2 className="h-4 w-4 text-green-600 inline" aria-label="you tracked this" />
                        : <XCircle className="h-4 w-4 text-muted-foreground inline" aria-label="you skipped this" />}
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
