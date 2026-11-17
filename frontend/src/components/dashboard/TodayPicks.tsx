"use client";

import { useCallback, useEffect, useState } from "react";
import { getRecommendations, getWatchlist, openPaperTrade } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Sparkles, RefreshCw, ArrowRight, Bell, Star, FlaskConical } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { statusColors, splitStatusColor } from "@/lib/status-colors";
import { errorMessage } from "@/lib/utils";
import type { WatchlistItem } from "@/lib/types";

// One signal behind a pick (backend/recommender.py _analyze_stock, plus the
// FII/DII, event and sector-concentration signals the _apply_* filters add).
type RecommendationSignal = {
  type: string;
  direction: "BULLISH" | "BEARISH" | "FADE" | "NEUTRAL";
  value: string;
  weight: number;
};

// One ranked stock (backend/recommender.py _analyze_stock + _apply_* filters).
type Recommendation = {
  ticker: string;
  symbol: string;
  price: number;
  change_pct: number;
  rsi: number | null;
  score: number;
  direction: "STRONG BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG SELL";
  confidence: "HIGH" | "MEDIUM" | "LOW";
  success_probability: number;
  signals: RecommendationSignal[];
  bullish_signal_count: number;
  bearish_signal_count: number;
  near_support: number;
  near_resistance: number;
  market_bias_applied?: string;
  sector?: string;
  concentration_warning?: string | null;
  concentration_breach?: boolean;
  event_warning?: string;
  upcoming_events?: unknown[];
};

// GET /api/recommend/ (backend/recommender.py recommend).
type RecommendationsResponse = {
  universe: string;
  total_analyzed: number;
  total_with_signals: number;
  market_bias: unknown;
  today_market_events: unknown[];
  concentration_summary: unknown;
  active_regime: string | null;
  regime_weight_overrides_active: number;
  strong_buys: Recommendation[];
  buys: Recommendation[];
  sells: Recommendation[];
  strong_sells: Recommendation[];
};

export function TodayPicks({ universe = "nifty100" }: { universe?: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<RecommendationsResponse | null>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [watchlistTickers, setWatchlistTickers] = useState<string[]>([]);

  // Show the spinner again when the universe prop changes (adjusting state
  // during render, so there's no extra render from an effect).
  const [prevUniverse, setPrevUniverse] = useState(universe);
  if (universe !== prevUniverse) {
    setPrevUniverse(universe);
    setLoading(true);
  }

  // Fetches picks; callers that need the spinner set `loading` first.
  const fetchData = useCallback(
    () =>
      Promise.all([
        getRecommendations(universe, 2) as Promise<RecommendationsResponse>,
        getWatchlist().catch(() => []) as Promise<WatchlistItem[]>,
      ])
        .then(([result, watchlist]) => {
          setData(result);
          setLastRun(new Date());

          const wlTickers: string[] = (watchlist || []).map((w) => w.ticker);
          setWatchlistTickers(wlTickers);

          // Alert for watchlist matches
          const allPicks = [...(result.strong_buys || []), ...(result.buys || [])];
          const matches = allPicks.filter((p) => wlTickers.includes(p.ticker));
          if (matches.length > 0) {
            toast.success(`${matches.length} watchlist stock${matches.length > 1 ? "s" : ""} in Top Picks: ${matches.map((m) => m.ticker).join(", ")}`, {
              duration: 6000,
              icon: <Bell className="h-4 w-4" />,
            });
          }
        })
        .catch(() => {})
        .finally(() => setLoading(false)),
    [universe],
  );

  const load = () => {
    setLoading(true);
    return fetchData();
  };

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const topPicks = data
    ? [...(data.strong_buys || []), ...(data.buys || [])].slice(0, 5)
    : [];
  const topSells = data
    ? [...(data.strong_sells || []), ...(data.sells || [])].slice(0, 3)
    : [];

  return (
    <Card className="border-yellow-200 dark:border-yellow-800">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-yellow-100 dark:bg-yellow-950/40">
              <Sparkles className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Today&apos;s Top Picks</h2>
              <p className="text-xs text-muted-foreground">
                {lastRun ? `Updated ${lastRun.toLocaleTimeString()}` : "Loading..."} · {universe.toUpperCase()}
                {data?.active_regime && (
                  <>
                    {" · "}
                    <span title={data.regime_weight_overrides_active > 0
                      ? `Recommender is using ${data.regime_weight_overrides_active} ${data.active_regime}-specific weight override(s)`
                      : `${data.active_regime} regime active. Visit Signal Performance to apply regime-specific weight overrides.`}>
                      <span className="font-medium">{data.active_regime}</span>
                      {data.regime_weight_overrides_active > 0 && (
                        <span className="text-purple-600 ml-1">⚡{data.regime_weight_overrides_active}</span>
                      )}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              Refresh
            </Button>
            <Link href="/recommendations">
              <Button size="sm" variant="ghost">
                View all <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </div>
        </div>

        {loading && !data && (
          <div className="py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            <p className="text-xs text-muted-foreground mt-2">Scanning {universe.toUpperCase()} stocks for opportunities...</p>
          </div>
        )}

        {data && topPicks.length === 0 && topSells.length === 0 && (
          <div className="py-6 text-center">
            <p className="text-sm text-muted-foreground">No strong signals in the market right now.</p>
            <p className="text-xs text-muted-foreground mt-1">Try again later or check the Market Scan.</p>
          </div>
        )}

        {data && topPicks.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-2">BUY OPPORTUNITIES</p>
            {topPicks.map((pick, i: number) => (
              <div
                key={pick.ticker}
                className="flex items-center justify-between p-3 rounded-lg bg-green-50/50 border border-green-100 hover:bg-green-50 dark:bg-green-950/20 dark:border-green-800/50 dark:hover:bg-green-950/40 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-semibold text-muted-foreground w-5">{i + 1}.</span>
                  <TrendingUp className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{pick.ticker}</span>
                      {watchlistTickers.includes(pick.ticker) && (
                        <Badge variant="outline" className={`${splitStatusColor(statusColors.caution).bg} ${splitStatusColor(statusColors.caution).text} border-yellow-300 dark:border-yellow-800 text-xs`}>
                          <Star className="h-2.5 w-2.5 mr-0.5 fill-yellow-600" />
                          Watchlist
                        </Badge>
                      )}
                      <span className="text-sm text-muted-foreground">Rs.{pick.price}</span>
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800 text-xs">
                        {pick.direction}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {pick.success_probability}% chance
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {pick.bullish_signal_count} signals · RSI {pick.rsi || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Open paper trade (simulated)"
                    onClick={async () => {
                      try {
                        await openPaperTrade({
                          ticker: pick.ticker,
                          source: "recommendation",
                          strategy: "Recommendation Engine (combined signals)",
                          signal: pick.direction,
                          score: pick.score,
                          confidence: pick.confidence,
                          success_probability: pick.success_probability,
                          triggered_signals: pick.signals,
                        });
                        toast.success(`${pick.ticker} tracked at Rs.${pick.price}`, {
                          description: "Paper trade opened. Check P&L at 1/3/5/10 days on the Simulation page.",
                          duration: 6000,
                          action: {
                            label: "View Simulation",
                            onClick: () => { window.location.href = "/simulation"; },
                          },
                        });
                      } catch (e) {
                        toast.error(errorMessage(e, "Failed to track"));
                      }
                    }}
                  >
                    <FlaskConical className="h-3 w-3 mr-1" /> Track
                  </Button>
                  <Link href={`/analysis?ticker=${pick.ticker}`}>
                    <Button size="sm" variant="outline">
                      Analyze <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {data && topSells.length > 0 && (
          <div className="space-y-2 mt-4">
            <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-2">AVOID / EXIT</p>
            {topSells.map((pick) => (
              <div
                key={pick.ticker}
                className="flex items-center justify-between p-3 rounded-lg bg-red-50/50 border border-red-100 dark:bg-red-950/20 dark:border-red-800/50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TrendingDown className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{pick.ticker}</span>
                      <span className="text-sm text-muted-foreground">Rs.{pick.price}</span>
                      <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800 text-xs">
                        {pick.direction}
                      </Badge>
                    </div>
                  </div>
                </div>
                <Link href={`/analysis?ticker=${pick.ticker}`}>
                  <Button size="sm" variant="outline">
                    View
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
