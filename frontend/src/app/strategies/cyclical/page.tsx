"use client";

import { useState } from "react";
import { getMonthlySeasonality, getDayOfWeek, getSectorRotation, backtestSeasonal } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TickerSearch } from "@/components/TickerSearch";
import { HelpSection } from "@/components/HelpSection";
import { Loader2, BarChart3, TrendingUp, TrendingDown, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { statusColors, splitStatusColor } from "@/lib/status-colors";

function generateInsight(data: any): string {
  if (!data || !data.months || data.months.length === 0) return "";

  const ticker = data.ticker || "This stock";
  const months = data.months;
  const best = data.best_months || [];
  const worst = data.worst_months || [];
  const current = data.current_month;
  const currentMonthName = current?.month_name || "";

  const bullishMonths = months.filter((m: any) => m.signal === "BULLISH");
  const bearishMonths = months.filter((m: any) => m.signal === "BEARISH");

  let lines: string[] = [];

  // Best months
  if (best.length > 0) {
    const bestNames = best.map((m: any) => `${m.month_name} (avg +${m.avg_return_pct}%, ${m.win_rate}% win rate)`).join(", ");
    lines.push(`Historically strongest months: ${bestNames}.`);
  }

  // Worst months
  if (worst.length > 0) {
    const worstNames = worst.map((m: any) => `${m.month_name} (avg ${m.avg_return_pct}%)`).join(", ");
    lines.push(`Weakest months: ${worstNames}. Avoid fresh entries or consider hedging during these periods.`);
  }

  // Bullish/bearish count
  if (bullishMonths.length > 0) {
    lines.push(`${bullishMonths.length} out of 12 months show a bullish pattern (avg return >1% and win rate >60%).`);
  }
  if (bearishMonths.length > 0) {
    lines.push(`${bearishMonths.length} months show a bearish pattern — historically negative returns with <40% win rate.`);
  }

  // Current month insight
  if (current) {
    if (current.signal === "BULLISH") {
      lines.push(`Current month (${currentMonthName}): BULLISH — historically averages +${current.avg_return_pct}% with ${current.win_rate}% win rate. This is a good time to be invested.`);
    } else if (current.signal === "BEARISH") {
      lines.push(`Current month (${currentMonthName}): BEARISH — historically averages ${current.avg_return_pct}%. Consider waiting for a better entry or tightening stop-losses.`);
    } else {
      lines.push(`Current month (${currentMonthName}): NEUTRAL — avg ${current.avg_return_pct}%, ${current.win_rate}% win rate. No strong seasonal edge this month.`);
    }
  }

  // Best entry timing
  if (best.length > 0 && worst.length > 0) {
    const bestBuyMonth = worst[worst.length - 1]; // Buy at the end of worst month
    const bestSellMonth = best[0]; // Sell at the peak of best month
    if (bestBuyMonth && bestSellMonth && bestBuyMonth.month !== bestSellMonth.month) {
      lines.push(`Suggested seasonal strategy: Buy in ${bestBuyMonth.month_name} (historically weakest, prices tend to be lower) and sell in ${bestSellMonth.month_name} (historically strongest). Use the backtest below to validate this.`);
    }
  }

  return lines.join("\n\n");
}

function generateDowInsight(data: any): string {
  if (!data || !data.days || data.days.length === 0) return "";

  const days = data.days;
  const bestDay = [...days].sort((a: any, b: any) => b.avg_return_pct - a.avg_return_pct)[0];
  const worstDay = [...days].sort((a: any, b: any) => a.avg_return_pct - b.avg_return_pct)[0];

  let lines: string[] = [];

  if (bestDay) {
    lines.push(`Best day to buy: ${bestDay.day_name} — avg return +${bestDay.avg_return_pct}%, ${bestDay.win_rate}% of ${bestDay.day_name}s are positive.`);
  }
  if (worstDay && worstDay.avg_return_pct < 0) {
    lines.push(`Weakest day: ${worstDay.day_name} — avg return ${worstDay.avg_return_pct}%. Avoid placing new buy orders on ${worstDay.day_name}s if possible.`);
  }

  const mondayData = days.find((d: any) => d.day_name === "Monday");
  const fridayData = days.find((d: any) => d.day_name === "Friday");
  if (mondayData && fridayData) {
    if (mondayData.avg_return_pct < 0 && fridayData.avg_return_pct > 0) {
      lines.push("Pattern: Weak Mondays + Strong Fridays — suggests weekend gap-down risk and Friday buying pressure. Consider entering positions on Monday dips and booking profits on Fridays.");
    } else if (mondayData.avg_return_pct > 0 && fridayData.avg_return_pct < 0) {
      lines.push("Pattern: Strong Mondays + Weak Fridays — Monday gap-up momentum fades by Friday. Consider entering early in the week.");
    }
  }

  return lines.join("\n\n");
}

interface EntryExitWindow {
  type: "entry" | "exit";
  months: string[];
  reasoning: string;
  confidence: "High" | "Medium" | "Low";
  expectedReturn: string;
}

function generateEntryExitWindows(data: any): { windows: EntryExitWindow[]; summary: string } | null {
  if (!data || !data.months || data.months.length === 0) return null;

  const months = data.months;
  const currentMonth = new Date().getMonth() + 1;
  const currentMonthData = months.find((m: any) => m.month === currentMonth);

  // Sort months by return to find clear entry/exit windows
  const sorted = [...months].sort((a: any, b: any) => a.avg_return_pct - b.avg_return_pct);
  const bullish = months.filter((m: any) => m.avg_return_pct > 0.5 && m.win_rate > 55);
  const bearish = months.filter((m: any) => m.avg_return_pct < -0.5 && m.win_rate < 50);
  const strongBull = months.filter((m: any) => m.signal === "BULLISH");
  const strongBear = months.filter((m: any) => m.signal === "BEARISH");

  const windows: EntryExitWindow[] = [];

  // Best entry windows — months just before the strongest rally months
  if (strongBull.length > 0) {
    // Buy at the END of the month before the bullish month
    const entryMonths = strongBull.map((m: any) => {
      const prevMonth = m.month === 1 ? 12 : m.month - 1;
      const prevData = months.find((x: any) => x.month === prevMonth);
      return prevData || m;
    });
    const uniqueEntryMonthNames = entryMonths.map((m: any) => String(m.month_name)).filter((v: string, i: number, a: string[]) => a.indexOf(v) === i);
    const targetMonthNames = strongBull.map((m: any) => m.month_name).join(", ");

    windows.push({
      type: "entry",
      months: uniqueEntryMonthNames,
      reasoning: `Enter positions in these months to capture the rally that historically follows in ${targetMonthNames}. Prices tend to be relatively lower before the bullish months begin.`,
      confidence: strongBull.length >= 2 ? "High" : "Medium",
      expectedReturn: `+${strongBull.reduce((s: number, m: any) => s + m.avg_return_pct, 0).toFixed(1)}% combined from the bullish months`,
    });
  }

  // Best exit windows — sell during or just after peak months
  if (strongBull.length > 0) {
    const exitMonthNames = strongBull.map((m: any) => m.month_name);
    windows.push({
      type: "exit",
      months: exitMonthNames,
      reasoning: `Book profits during or at the end of these months. Historically the strongest months — prices tend to peak here before pulling back.`,
      confidence: strongBull.length >= 2 ? "High" : "Medium",
      expectedReturn: `Capture the +${strongBull[0].avg_return_pct}% to +${strongBull[strongBull.length - 1]?.avg_return_pct}% seasonal rally`,
    });
  }

  // Avoid windows — months to stay away
  if (strongBear.length > 0) {
    const avoidMonths = strongBear.map((m: any) => m.month_name);
    windows.push({
      type: "exit",
      months: avoidMonths,
      reasoning: `Historically weak months with negative average returns. Reduce exposure or hedge positions. If not invested, wait for these months to pass before entering.`,
      confidence: strongBear.length >= 2 ? "High" : "Medium",
      expectedReturn: `Avoid ${strongBear.reduce((s: number, m: any) => s + m.avg_return_pct, 0).toFixed(1)}% average loss`,
    });
  }

  // Accumulation windows — months with slight negative or flat returns but high win rate
  const accumulate = months.filter((m: any) => m.avg_return_pct >= -1 && m.avg_return_pct <= 0.5 && m.win_rate >= 45 && m.win_rate <= 55);
  if (accumulate.length > 0 && accumulate.length <= 4) {
    windows.push({
      type: "entry",
      months: accumulate.map((m: any) => m.month_name),
      reasoning: `Sideways/consolidation months. Good for gradual accumulation (SIP or staggered buying) as prices are neither strongly up nor down.`,
      confidence: "Low",
      expectedReturn: "Flat to slightly positive — use for building positions cheaply",
    });
  }

  // Generate current month action
  let summary = "";
  if (currentMonthData) {
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextMonthData = months.find((m: any) => m.month === nextMonth);
    const next2Month = nextMonth === 12 ? 1 : nextMonth + 1;
    const next2MonthData = months.find((m: any) => m.month === next2Month);

    summary = `RIGHT NOW (${currentMonthData.month_name}): `;

    if (currentMonthData.signal === "BULLISH") {
      summary += `You are in a historically strong month (+${currentMonthData.avg_return_pct}% avg). Hold existing positions and ride the momentum.`;
      if (nextMonthData && nextMonthData.avg_return_pct < 0) {
        summary += ` However, next month (${nextMonthData.month_name}) tends to be weak — consider booking partial profits by end of this month.`;
      }
    } else if (currentMonthData.signal === "BEARISH") {
      summary += `This is historically a weak month (${currentMonthData.avg_return_pct}% avg). Avoid new entries. `;
      if (nextMonthData && nextMonthData.avg_return_pct > 0) {
        summary += `Good news: ${nextMonthData.month_name} tends to recover (+${nextMonthData.avg_return_pct}%). Start building positions towards end of this month for the upcoming rally.`;
      } else {
        summary += `Wait for a bullish month signal before entering.`;
      }
    } else {
      summary += `Neutral month — no strong seasonal edge. `;
      if (nextMonthData && nextMonthData.signal === "BULLISH") {
        summary += `But ${nextMonthData.month_name} is historically bullish (+${nextMonthData.avg_return_pct}%). Consider entering positions NOW to catch the upcoming rally.`;
      } else if (nextMonthData && nextMonthData.signal === "BEARISH") {
        summary += `And ${nextMonthData.month_name} tends to be weak. Hold off on new entries.`;
      } else {
        summary += `Focus on other signals (technicals, scanner) rather than seasonality this month.`;
      }
    }

    // 3-month outlook
    if (nextMonthData && next2MonthData) {
      const outlook3m = (currentMonthData.avg_return_pct + nextMonthData.avg_return_pct + next2MonthData.avg_return_pct);
      summary += `\n\n3-Month Outlook (${currentMonthData.month_name} to ${next2MonthData.month_name}): ${outlook3m >= 0 ? "+" : ""}${outlook3m.toFixed(1)}% expected based on seasonal patterns.`;
    }
  }

  return { windows, summary };
}

const signalColors: Record<string, string> = {
  BULLISH: statusColors.bullish,
  BEARISH: statusColors.bearish,
  NEUTRAL: statusColors.neutral,
  STRONG: "bg-green-100 text-green-800 border-green-300 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800",
  WEAK: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
};

const cyclicalHelp = [
  {
    question: "What is monthly seasonality?",
    answer: "Stocks often follow repeating monthly patterns. For example, RELIANCE might historically rally in October-December (festive season, strong demand) and dip in March (financial year-end selling). By analyzing 5 years of monthly returns, you can see which months tend to be bullish or bearish for a stock.\n\nBULLISH = avg return >1% AND win rate >60%\nBEARISH = avg return <-1% AND win rate <40%\nNEUTRAL = everything else\n\nThis is completely FREE \u2014 just math on historical prices.",
  },
  {
    question: "How to use the seasonal backtest?",
    answer: "If the monthly analysis shows RELIANCE is bullish in Jan and bearish in Mar:\n  1. Set Buy Months = 1 (January)\n  2. Set Sell Months = 3 (March)\n  3. Click Backtest\n  4. See what would have happened if you followed this strategy for 5 years\n\nThis tells you if the seasonal pattern is actually tradeable or just noise. Look for:\n  \u2022 Win rate >60%\n  \u2022 Positive total return\n  \u2022 Consistent across years (not just one lucky year)",
  },
  {
    question: "What is sector rotation?",
    answer: "Different market sectors take turns leading the market:\n  \u2022 Rate cuts \u2192 Banks and Realty rally\n  \u2022 Weak rupee \u2192 IT exporters benefit (earn in USD)\n  \u2022 Rising crude oil \u2192 Energy stocks rally, but hurts overall market\n  \u2022 Festive season \u2192 FMCG and Auto see higher demand\n\nThe sector rotation analysis shows which sectors are currently outperforming and which are lagging. Focus your analysis on stocks in the top-performing sectors.",
  },
];

export default function CyclicalPage() {
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [dowData, setDowData] = useState<any>(null);
  const [sectorData, setSectorData] = useState<any>(null);
  const [sectorLoading, setSectorLoading] = useState(false);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [buyMonths, setBuyMonths] = useState("");
  const [sellMonths, setSellMonths] = useState("");

  const handleAnalyze = async () => {
    if (!ticker.trim()) return;
    setLoading(true);
    setMonthlyData(null);
    setDowData(null);
    setBacktestResult(null);
    try {
      const [monthly, dow]: any[] = await Promise.all([
        getMonthlySeasonality(ticker.trim()),
        getDayOfWeek(ticker.trim()),
      ]);
      setMonthlyData(monthly);
      setDowData(dow);
      // Auto-suggest buy/sell months
      if (monthly.best_months?.length > 0) {
        setBuyMonths(monthly.best_months.map((m: any) => m.month).join(","));
      }
      if (monthly.worst_months?.length > 0) {
        setSellMonths(monthly.worst_months.map((m: any) => m.month).join(","));
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to analyze");
    } finally {
      setLoading(false);
    }
  };

  const handleSectorScan = async () => {
    setSectorLoading(true);
    try {
      const data: any = await getSectorRotation(3);
      setSectorData(data);
    } catch (e: any) {
      toast.error(e.message || "Failed to load sectors");
    } finally {
      setSectorLoading(false);
    }
  };

  const handleBacktest = async () => {
    if (!ticker.trim() || !buyMonths || !sellMonths) {
      toast.error("Enter ticker, buy months, and sell months");
      return;
    }
    try {
      const result: any = await backtestSeasonal(ticker.trim(), buyMonths, sellMonths);
      setBacktestResult(result);
    } catch (e: any) {
      toast.error(e.message || "Backtest failed");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/strategies">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" /> Strategies</Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Cyclical Patterns</h1>
          <p className="text-sm text-muted-foreground">Monthly seasonality, day-of-week patterns, and sector rotation. All FREE.</p>
        </div>
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Stock Seasonality</TabsTrigger>
          <TabsTrigger value="sectors">Sector Rotation</TabsTrigger>
        </TabsList>

        {/* Stock Seasonality Tab */}
        <TabsContent value="stock" className="space-y-4">
          <Card className="overflow-visible">
            <CardContent className="p-4 overflow-visible">
              <div className="flex gap-3 items-end">
                <div className="w-64">
                  <label className="text-xs text-muted-foreground mb-1 block">Ticker Symbol</label>
                  <TickerSearch value={ticker} onChange={setTicker} placeholder="Search stock (e.g., Infosys)" />
                </div>
                <Button onClick={handleAnalyze} disabled={loading || !ticker.trim()}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BarChart3 className="h-4 w-4 mr-2" />}
                  Analyze Patterns
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Seasonality */}
          {monthlyData && !monthlyData.error && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  Monthly Seasonality — {monthlyData.ticker}
                  <Badge variant="outline">{monthlyData.years_analyzed} years of data</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Bar chart style visualization */}
                <div className="grid grid-cols-12 gap-1 mb-4">
                  {(monthlyData.months || []).map((m: any) => {
                    const maxAbs = Math.max(...monthlyData.months.map((x: any) => Math.abs(x.avg_return_pct)), 1);
                    const height = Math.max(20, Math.abs(m.avg_return_pct) / maxAbs * 80);
                    const isPositive = m.avg_return_pct >= 0;
                    return (
                      <div key={m.month} className="flex flex-col items-center">
                        <div className="h-24 flex items-end justify-center w-full">
                          <div
                            className={`w-full rounded-t ${isPositive ? "bg-green-400" : "bg-red-400"}`}
                            style={{ height: `${height}%` }}
                            title={`${m.month_name}: ${m.avg_return_pct}% avg, ${m.win_rate}% win rate`}
                          />
                        </div>
                        <span className="text-xs mt-1 font-medium">{m.month_name}</span>
                        <span className={`text-xs ${isPositive ? "text-green-600" : "text-red-600"}`}>
                          {isPositive ? "+" : ""}{m.avg_return_pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Insight */}
                {generateInsight(monthlyData) && (
                  <div className={`p-4 rounded-lg ${statusColors.info} space-y-2`}>
                    <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" /> Pattern Insight
                    </p>
                    {generateInsight(monthlyData).split("\n\n").map((line, i) => (
                      <p key={i} className="text-sm text-blue-700 leading-relaxed">{line}</p>
                    ))}
                  </div>
                )}

                {/* Entry/Exit Windows */}
                {(() => {
                  const analysis = generateEntryExitWindows(monthlyData);
                  if (!analysis) return null;
                  const confColors = { High: "bg-green-100 text-green-800", Medium: "bg-yellow-100 text-yellow-800", Low: "bg-gray-100 text-gray-600" };
                  return (
                    <div className="space-y-3">
                      {/* Current Action */}
                      {analysis.summary && (
                        <div className={`p-4 rounded-lg ${statusColors.amber}`}>
                          <p className="text-sm font-semibold text-amber-800 mb-2">What To Do Now</p>
                          {analysis.summary.split("\n\n").map((line, i) => (
                            <p key={i} className="text-sm text-amber-700 leading-relaxed">{line}</p>
                          ))}
                        </div>
                      )}

                      {/* Windows */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {analysis.windows.map((w, i) => (
                          <div key={i} className={`p-4 rounded-lg border ${w.type === "entry" ? statusColors.bullish : statusColors.bearish}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                {w.type === "entry" ? <TrendingUp className="h-4 w-4 text-green-600" /> : <TrendingDown className="h-4 w-4 text-red-600" />}
                                <span className={`text-sm font-semibold ${w.type === "entry" ? "text-green-800" : "text-red-800"}`}>
                                  {w.type === "entry" ? "ENTRY Window" : "EXIT / AVOID Window"}
                                </span>
                              </div>
                              <Badge className={confColors[w.confidence]}>{w.confidence} confidence</Badge>
                            </div>
                            <div className="flex gap-1 mb-2 flex-wrap">
                              {w.months.map((m) => (
                                <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                              ))}
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">{w.reasoning}</p>
                            <p className="text-xs font-medium mt-1">{w.expectedReturn}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Table */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead className="text-right">Avg Return</TableHead>
                      <TableHead className="text-right">Win Rate</TableHead>
                      <TableHead className="text-right">Best</TableHead>
                      <TableHead className="text-right">Worst</TableHead>
                      <TableHead>Signal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(monthlyData.months || []).map((m: any) => (
                      <TableRow key={m.month} className={m.month === new Date().getMonth() + 1 ? "bg-blue-50 dark:bg-blue-950/20" : ""}>
                        <TableCell className="font-medium">
                          {m.month_name}
                          {m.month === new Date().getMonth() + 1 && <Badge className="ml-2 bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 text-xs">Current</Badge>}
                        </TableCell>
                        <TableCell className={`text-right ${m.avg_return_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {m.avg_return_pct >= 0 ? "+" : ""}{m.avg_return_pct}%
                        </TableCell>
                        <TableCell className="text-right">{m.win_rate}%</TableCell>
                        <TableCell className="text-right text-green-600">+{m.best_return}%</TableCell>
                        <TableCell className="text-right text-red-600">{m.worst_return}%</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={signalColors[m.signal] || ""}>{m.signal}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Day of Week */}
          {dowData && !dowData.error && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Day-of-Week Pattern — {dowData.ticker}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-5 gap-3">
                  {(dowData.days || []).map((d: any) => (
                    <Card key={d.day} className={d.avg_return_pct >= 0 ? "border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20" : "border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"}>
                      <CardContent className="p-3 text-center">
                        <p className="font-medium text-sm">{d.day_name}</p>
                        <p className={`text-lg font-bold ${d.avg_return_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {d.avg_return_pct >= 0 ? "+" : ""}{d.avg_return_pct}%
                        </p>
                        <p className="text-xs text-muted-foreground">Win: {d.win_rate}% ({d.sample_size} days)</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                {/* Day-of-week insight */}
                {generateDowInsight(dowData) && (
                  <div className={`mt-3 p-4 rounded-lg ${statusColors.info} space-y-2`}>
                    <p className="text-sm font-semibold text-blue-800">Day-of-Week Insight</p>
                    {generateDowInsight(dowData).split("\n\n").map((line, i) => (
                      <p key={i} className="text-sm text-blue-700 leading-relaxed">{line}</p>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Seasonal Backtest */}
          {monthlyData && !monthlyData.error && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Seasonal Backtest (FREE)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-3 items-end">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Buy Months (1-12, comma sep)</label>
                    <Input value={buyMonths} onChange={(e) => setBuyMonths(e.target.value)} placeholder="e.g., 1,10" className="w-40" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Sell Months</label>
                    <Input value={sellMonths} onChange={(e) => setSellMonths(e.target.value)} placeholder="e.g., 3,12" className="w-40" />
                  </div>
                  <Button onClick={handleBacktest} variant="outline">Backtest Strategy</Button>
                </div>

                {backtestResult && !backtestResult.error && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-3">
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-xs text-muted-foreground">Total Return</p>
                        <p className={`text-xl font-bold ${backtestResult.total_return_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {backtestResult.total_return_pct >= 0 ? "+" : ""}{backtestResult.total_return_pct}%
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-xs text-muted-foreground">Win Rate</p>
                        <p className="text-xl font-bold">{backtestResult.win_rate}%</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-xs text-muted-foreground">Trades</p>
                        <p className="text-xl font-bold">{backtestResult.total_trades}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50 text-center">
                        <p className="text-xs text-muted-foreground">Avg Per Trade</p>
                        <p className={`text-xl font-bold ${backtestResult.avg_return_per_trade >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {backtestResult.avg_return_per_trade >= 0 ? "+" : ""}{backtestResult.avg_return_per_trade}%
                        </p>
                      </div>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Entry</TableHead>
                          <TableHead>Exit</TableHead>
                          <TableHead className="text-right">Entry Price</TableHead>
                          <TableHead className="text-right">Exit Price</TableHead>
                          <TableHead className="text-right">P&L</TableHead>
                          <TableHead>Result</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {backtestResult.trades.map((t: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell>{t.entry_date}</TableCell>
                            <TableCell>{t.exit_date}</TableCell>
                            <TableCell className="text-right">Rs.{t.entry_price}</TableCell>
                            <TableCell className="text-right">Rs.{t.exit_price}</TableCell>
                            <TableCell className={`text-right ${t.pnl_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {t.pnl_pct >= 0 ? "+" : ""}{t.pnl_pct}%
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={t.result === "win" ? splitStatusColor(statusColors.bullish).bg + " " + splitStatusColor(statusColors.bullish).text : splitStatusColor(statusColors.bearish).bg + " " + splitStatusColor(statusColors.bearish).text}>
                                {t.result}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Sector Rotation Tab */}
        <TabsContent value="sectors" className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <Button onClick={handleSectorScan} disabled={sectorLoading}>
                {sectorLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <TrendingUp className="h-4 w-4 mr-2" />}
                Scan Sector Performance (3 months)
              </Button>
            </CardContent>
          </Card>

          {sectorData && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {(sectorData.sectors || []).map((s: any, i: number) => (
                <Card key={s.sector} className={i < 3 ? "border-green-200" : i >= sectorData.sectors.length - 3 ? "border-red-200" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-semibold">{s.sector}</h3>
                      <Badge variant="outline" className={signalColors[s.signal] || ""}>{s.signal}</Badge>
                    </div>
                    <p className={`text-2xl font-bold ${s.avg_return_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {s.avg_return_pct >= 0 ? "+" : ""}{s.avg_return_pct}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Top stocks: {s.top_stocks.join(", ")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <HelpSection title="How to Use Cyclical Patterns" items={cyclicalHelp} />
    </div>
  );
}
