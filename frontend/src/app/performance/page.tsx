"use client";

import { useState } from "react";
import { getPerformanceAll } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpSection } from "@/components/HelpSection";
import { Loader2, TrendingUp, TrendingDown, Zap, ArrowUpRight, Volume2, Target, Award, AlertTriangle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { NextStep } from "@/components/NextStep";
import { iconBadge, cautionSubtle } from "@/lib/status-colors";

const performanceHelp = [
  {
    question: "What does this measure?",
    answer: "Each strategy has a signal (e.g., gap up >2%, volume >2x average, breakout above 20-day high). This tool retroactively checks every signal that fired in the past N days and tracks what happened to the price 1, 3, and 5 days later.\n\nIt answers: \"If I had blindly followed this strategy's signals, what would my win rate and average return be?\"",
  },
  {
    question: "How to read the results?",
    answer: "Win Rate: % of signals that made money\n  \u2022 >55% = worth considering\n  \u2022 50-55% = marginal, needs to be combined with other confirmations\n  \u2022 <50% = probably fade the signal (do opposite)\n\nAverage Return: expected return per trade (across wins and losses)\n  \u2022 Positive = strategy profitable\n  \u2022 Negative = strategy loses money overall\n\nBest to combine: look at both win rate AND avg return. A strategy can have 60% win rate but lose money if the losers are bigger than winners.",
  },
  {
    question: "Why does this take time?",
    answer: "It has to fetch 60+ days of history for 50-100 stocks, then analyze every day to find signals. For NIFTY 50 (60 days), expect ~30-60 seconds. For BSE 250, expect 2-3 minutes.\n\nAll computation is FREE \u2014 just math on yfinance data, no AI API calls.",
  },
  {
    question: "What's the best hold period?",
    answer: "Most short-term strategies are designed for 1-5 day holds:\n  \u2022 Day 1 = intraday / overnight hold (gap trades)\n  \u2022 Day 3 = short swing trades\n  \u2022 Day 5 = weekly swing trades\n\nCompare all three columns. If a strategy has 40% win rate on day 1 but 60% on day 5, it needs more time to play out. Adjust your holding period accordingly.",
  },
  {
    question: "How to use this with the AI Analysis?",
    answer: "Use this to identify which signals are WORTH running AI analysis on:\n\n1. See which strategy has best win rate in current market\n2. Run Scanner to find stocks triggering that strategy today\n3. Run AI Analysis on top candidates (costs Rs.15-25 each)\n4. Take only the trades where both the strategy AND the AI agree\n\nThis lets you spend API money only on high-probability setups.",
  },
];

const strategyIcons: Record<string, any> = {
  gap: ArrowUpRight,
  volume: Volume2,
  breakout: TrendingUp,
  sr_bounce: Target,
};

const strategyColors: Record<string, string> = {
  gap: iconBadge("orange") + " border border-orange-200 dark:border-orange-800",
  volume: iconBadge("info") + " border border-blue-200 dark:border-blue-800",
  breakout: iconBadge("bullish") + " border border-green-200 dark:border-green-800",
  sr_bounce: iconBadge("purple") + " border border-purple-200 dark:border-purple-800",
};

const strategyNames: Record<string, string> = {
  gap: "Gap Up/Down",
  volume: "Volume Spike",
  breakout: "Breakout (20-day)",
  sr_bounce: "Support Bounce",
};

function getRatingLabel(winRate: number, avgReturn: number): { label: string; color: string } {
  if (winRate >= 60 && avgReturn > 1) return { label: "EXCELLENT", color: "bg-green-100 text-green-800 border-green-300 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800" };
  if (winRate >= 55 && avgReturn > 0.5) return { label: "GOOD", color: "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800" };
  if (winRate >= 50 && avgReturn > 0) return { label: "MARGINAL", color: "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800" };
  if (winRate < 45 || avgReturn < -0.5) return { label: "AVOID", color: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" };
  return { label: "WEAK", color: "bg-gray-50 text-gray-600 border-gray-200 dark:bg-muted dark:text-muted-foreground dark:border-border" };
}

export default function PerformancePage() {
  const [universe, setUniverse] = useState("nifty50");
  const [lookbackDays, setLookbackDays] = useState(60);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [results, setResults] = useState<any>(null);
  const [startTime, setStartTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  const handleRun = async () => {
    setStatus("running");
    setResults(null);
    setStartTime(Date.now());
    setDuration(0);

    try {
      const data: any = await getPerformanceAll(universe, lookbackDays);
      setResults(data);
      setDuration((Date.now() - startTime) / 1000);
      setStatus("done");
    } catch (e: any) {
      toast.error(e.message || "Failed to measure performance");
      setStatus("idle");
    }
  };

  // Find best strategy
  const bestStrategy = results
    ? Object.entries(results.strategies).reduce((best: any, [key, val]: any) => {
        const day3 = val.hold_periods?.day_3;
        if (!day3) return best;
        const score = day3.win_rate + day3.avg_return * 10; // Combined metric
        if (!best || score > best.score) return { key, name: strategyNames[key], score, stats: day3 };
        return best;
      }, null)
    : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Strategy Performance</h1>
        <p className="text-sm text-muted-foreground">
          Measure historical success rate of each strategy. Completely FREE — no AI API cost.
        </p>
      </div>

      {/* Config */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Universe</label>
              <div className="flex gap-1">
                {[
                  { value: "nifty50", label: "NIFTY 50" },
                  { value: "nifty100", label: "NIFTY 100" },
                  { value: "bse250", label: "BSE 250" },
                ].map((u) => (
                  <Button
                    key={u.value}
                    variant={universe === u.value ? "default" : "outline"}
                    size="sm"
                    onClick={() => setUniverse(u.value)}
                    disabled={status === "running"}
                  >
                    {u.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Lookback Period</label>
              <div className="flex gap-1">
                {[30, 60, 90].map((d) => (
                  <Button
                    key={d}
                    variant={lookbackDays === d ? "default" : "outline"}
                    size="sm"
                    onClick={() => setLookbackDays(d)}
                    disabled={status === "running"}
                  >
                    {d} days
                  </Button>
                ))}
              </div>
            </div>
            <Button onClick={handleRun} disabled={status === "running"}>
              {status === "running" ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Measuring...</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" />Measure All Strategies</>
              )}
            </Button>
          </div>
          {status === "running" && (
            <p className="text-xs text-muted-foreground mt-3">
              Analyzing {universe.toUpperCase()} over {lookbackDays} days across 4 strategies... (30-120 seconds)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Best Strategy Highlight */}
      {bestStrategy && (
        <Card className={cautionSubtle()}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Award className="h-6 w-6 text-yellow-600" />
              <div>
                <p className="text-xs text-muted-foreground">Best performing strategy (3-day hold)</p>
                <p className="text-lg font-bold">{bestStrategy.name}</p>
                <p className="text-sm text-muted-foreground">
                  {bestStrategy.stats.win_rate}% win rate • {bestStrategy.stats.avg_return >= 0 ? "+" : ""}{bestStrategy.stats.avg_return}% avg return • {bestStrategy.stats.total_signals} signals analyzed
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Strategy Cards */}
      {results && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.entries(results.strategies).map(([key, data]: any) => {
            const Icon = strategyIcons[key] || Zap;
            const colorClass = strategyColors[key];
            const day3 = data.hold_periods?.day_3;
            const rating = day3 ? getRatingLabel(day3.win_rate, day3.avg_return) : null;

            return (
              <Card key={key} className={colorClass.split(" ")[2]}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`h-5 w-5 ${colorClass.split(" ")[0]}`} />
                      {strategyNames[key]}
                    </div>
                    {rating && <Badge variant="outline" className={rating.color}>{rating.label}</Badge>}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    {data.total_signals} signals detected over {lookbackDays} days
                  </p>
                </CardHeader>
                <CardContent>
                  {data.total_signals === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No signals found in this period</p>
                  ) : (
                    <div className="space-y-3">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Hold</TableHead>
                            <TableHead className="text-xs text-right">Win Rate</TableHead>
                            <TableHead className="text-xs text-right">Avg Return</TableHead>
                            <TableHead className="text-xs text-right">Best</TableHead>
                            <TableHead className="text-xs text-right">Worst</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {Object.entries(data.hold_periods).map(([periodKey, stats]: any) => (
                            <TableRow key={periodKey}>
                              <TableCell className="text-sm font-medium">{stats.hold_days} day{stats.hold_days > 1 ? "s" : ""}</TableCell>
                              <TableCell className={`text-right font-semibold ${stats.win_rate >= 55 ? "text-green-600" : stats.win_rate < 45 ? "text-red-600" : ""}`}>
                                {stats.win_rate}%
                              </TableCell>
                              <TableCell className={`text-right ${stats.avg_return > 0 ? "text-green-600" : "text-red-600"}`}>
                                {stats.avg_return >= 0 ? "+" : ""}{stats.avg_return}%
                              </TableCell>
                              <TableCell className="text-right text-green-600 text-xs">+{stats.best_trade}%</TableCell>
                              <TableCell className="text-right text-red-600 text-xs">{stats.worst_trade}%</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detailed trades */}
      {results && (
        <Tabs defaultValue="gap">
          <TabsList>
            {Object.keys(results.strategies).map((key) => (
              <TabsTrigger key={key} value={key}>
                {strategyNames[key]}
              </TabsTrigger>
            ))}
          </TabsList>
          {Object.entries(results.strategies).map(([key, data]: any) => (
            <TabsContent key={key} value={key}>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Top Trades — {strategyNames[key]}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[350px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticker</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Direction</TableHead>
                          <TableHead className="text-right">Entry</TableHead>
                          <TableHead className="text-right">+1 day</TableHead>
                          <TableHead className="text-right">+3 days</TableHead>
                          <TableHead className="text-right">+5 days</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(data.trades || []).slice(0, 50).map((t: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{t.ticker}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{t.date}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={t.direction === "LONG" ? iconBadge("bullish") : iconBadge("bearish")}>
                                {t.direction}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">Rs.{t.entry_price}</TableCell>
                            {[1, 3, 5].map((d) => {
                              const r = t.returns?.[`day_${d}`];
                              if (r === undefined) return <TableCell key={d} className="text-right text-muted-foreground">-</TableCell>;
                              return (
                                <TableCell key={d} className={`text-right ${r > 0 ? "text-green-600" : "text-red-600"}`}>
                                  {r >= 0 ? "+" : ""}{r}%
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}

      {/* Idle */}
      {status === "idle" && !results && (
        <Card className="h-[200px] flex items-center justify-center">
          <CardContent className="text-center">
            <p className="text-muted-foreground">Click &quot;Measure All Strategies&quot; to see historical success rates.</p>
            <p className="text-xs text-muted-foreground mt-2">
              Tests Gap, Volume, Breakout, and Support Bounce strategies on {universe.toUpperCase()} over {lookbackDays} days.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Next Step */}
      {results && (
        <NextStep
          title="Apply these insights to today's trades"
          description="Now that you know which strategies work, use Recommendations to find stocks triggering those signals today"
          href="/recommendations"
          buttonText="See Top Picks"
          icon={Sparkles}
        />
      )}

      <HelpSection title="How to Use Performance Tracker" items={performanceHelp} />
    </div>
  );
}
