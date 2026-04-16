"use client";

import { useEffect, useState } from "react";
import { getRecommendations, getWatchlist, openPaperTrade } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, TrendingUp, TrendingDown, Sparkles, RefreshCw, ArrowRight, Bell, Star, FlaskConical } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export function TodayPicks({ universe = "nifty100" }: { universe?: string }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [watchlistTickers, setWatchlistTickers] = useState<string[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const [result, watchlist]: any[] = await Promise.all([
        getRecommendations(universe, 2),
        getWatchlist().catch(() => []),
      ]);
      setData(result);
      setLastRun(new Date());

      const wlTickers: string[] = (watchlist || []).map((w: any) => w.ticker);
      setWatchlistTickers(wlTickers);

      // Alert for watchlist matches
      const allPicks = [...(result.strong_buys || []), ...(result.buys || [])];
      const matches = allPicks.filter((p: any) => wlTickers.includes(p.ticker));
      if (matches.length > 0) {
        toast.success(`${matches.length} watchlist stock${matches.length > 1 ? "s" : ""} in Top Picks: ${matches.map((m: any) => m.ticker).join(", ")}`, {
          duration: 6000,
          icon: <Bell className="h-4 w-4" />,
        });
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [universe]);

  const topPicks = data
    ? [...(data.strong_buys || []), ...(data.buys || [])].slice(0, 5)
    : [];
  const topSells = data
    ? [...(data.strong_sells || []), ...(data.sells || [])].slice(0, 3)
    : [];

  return (
    <Card className="border-yellow-200">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-yellow-100">
              <Sparkles className="h-5 w-5 text-yellow-600" />
            </div>
            <div>
              <h2 className="font-semibold text-lg">Today's Top Picks</h2>
              <p className="text-xs text-muted-foreground">
                {lastRun ? `Updated ${lastRun.toLocaleTimeString()}` : "Loading..."} · {universe.toUpperCase()}
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
            <p className="text-xs font-medium text-green-700 mb-2">BUY OPPORTUNITIES</p>
            {topPicks.map((pick: any, i: number) => (
              <div
                key={pick.ticker}
                className="flex items-center justify-between p-3 rounded-lg bg-green-50/50 border border-green-100 hover:bg-green-50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-semibold text-muted-foreground w-5">{i + 1}.</span>
                  <TrendingUp className="h-4 w-4 text-green-600 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{pick.ticker}</span>
                      {watchlistTickers.includes(pick.ticker) && (
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300 text-xs">
                          <Star className="h-2.5 w-2.5 mr-0.5 fill-yellow-600" />
                          Watchlist
                        </Badge>
                      )}
                      <span className="text-sm text-muted-foreground">Rs.{pick.price}</span>
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 text-xs">
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
                        } as any);
                        toast.success(`Opened paper trade for ${pick.ticker} at Rs.${pick.price}`);
                      } catch (e: any) {
                        toast.error(e.message || "Failed to track");
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
            <p className="text-xs font-medium text-red-700 mb-2">AVOID / EXIT</p>
            {topSells.map((pick: any) => (
              <div
                key={pick.ticker}
                className="flex items-center justify-between p-3 rounded-lg bg-red-50/50 border border-red-100"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <TrendingDown className="h-4 w-4 text-red-600 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{pick.ticker}</span>
                      <span className="text-sm text-muted-foreground">Rs.{pick.price}</span>
                      <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300 text-xs">
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
