"use client";

import { useState } from "react";
import { getSupportResistance, getPivotPoints } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TickerSearch } from "@/components/TickerSearch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowDown, ArrowUp, Target, Loader2, Minus } from "lucide-react";
import { HelpSection } from "@/components/HelpSection";
import { strategiesHelp } from "@/lib/help-content";
import { toast } from "sonner";

const periods = [
  { value: "1mo", label: "1 Month" },
  { value: "3mo", label: "3 Months" },
  { value: "6mo", label: "6 Months" },
  { value: "1y", label: "1 Year" },
];

export default function StrategiesPage() {
  const [ticker, setTicker] = useState("");
  const [period, setPeriod] = useState("3mo");
  const [loading, setLoading] = useState(false);
  const [srData, setSrData] = useState<any>(null);
  const [pivotData, setPivotData] = useState<any>(null);

  const handleCalculate = async (overridePeriod?: string) => {
    if (!ticker.trim()) return;
    const activePeriod = overridePeriod ?? period;
    setLoading(true);
    setSrData(null);
    setPivotData(null);

    try {
      const [sr, pivots]: any[] = await Promise.all([
        getSupportResistance(ticker.trim(), activePeriod),
        getPivotPoints(ticker.trim()),
      ]);
      setSrData(sr);
      setPivotData(pivots);
    } catch (e: any) {
      toast.error(e.message || "Failed to calculate levels");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Strategies</h1>
        <p className="text-sm text-muted-foreground">Support/Resistance levels, Pivot Points, and trading strategies</p>
      </div>

      {/* Input */}
      <Card className="overflow-visible">
        <CardContent className="p-4 overflow-visible">
          <div className="flex gap-3 items-end">
            <div className="w-64">
              <label className="text-xs text-muted-foreground mb-1 block">Ticker Symbol</label>
              <TickerSearch
                value={ticker}
                onChange={setTicker}
                placeholder="Search stock (e.g., Infosys)"
              />
            </div>
            <div className="flex gap-1">
              {periods.map((p) => (
                <Button
                  key={p.value}
                  variant={period === p.value ? "default" : "outline"}
                  size="sm"
                  disabled={loading}
                  onClick={() => {
                    setPeriod(p.value);
                    // If results are already shown, refetch immediately for the new period.
                    if (srData) handleCalculate(p.value);
                  }}
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <Button onClick={() => handleCalculate()} disabled={loading || !ticker.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Target className="h-4 w-4 mr-2" />}
              Calculate Levels
            </Button>
          </div>
        </CardContent>
      </Card>

      {srData && !srData.error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Support & Resistance */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between gap-2">
                <span>
                  Support &amp; Resistance
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    · over the last {periods.find((p) => p.value === srData.period)?.label || srData.period}
                  </span>
                </span>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 whitespace-nowrap">
                  {periods.find((p) => p.value === srData.period)?.label || srData.period}
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Current:</span>
                <span className="font-sans font-bold text-lg">₹{srData.current_price}</span>
                <span className="text-muted-foreground">|</span>
                <span className="text-muted-foreground">Range: ₹{srData.period_low} — ₹{srData.period_high}</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Resistance Levels */}
              <div>
                <h3 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-1">
                  <ArrowUp className="h-4 w-4" /> Resistance Levels
                </h3>
                <div className="space-y-2">
                  {srData.support_resistance.resistances.length > 0 ? (
                    srData.support_resistance.resistances.map((r: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-100 dark:bg-red-950/40 dark:border-red-800">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800">
                            R{i + 1}
                          </Badge>
                          <span className="font-sans font-semibold text-lg">₹{r.level}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm text-red-600">
                            +{((r.level - srData.current_price) / srData.current_price * 100).toFixed(2)}% away
                          </span>
                          <span className="text-xs text-muted-foreground block">Strength: {r.strength}x touched</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No resistance levels found (near period high)</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 py-2">
                <Minus className="h-4 w-4 text-muted-foreground" />
                <Separator className="flex-1" />
                <span className="font-sans font-bold text-sm bg-muted px-3 py-1 rounded">
                  CMP ₹{srData.current_price}
                </span>
                <Separator className="flex-1" />
                <Minus className="h-4 w-4 text-muted-foreground" />
              </div>

              {/* Support Levels */}
              <div>
                <h3 className="text-sm font-semibold text-green-600 mb-2 flex items-center gap-1">
                  <ArrowDown className="h-4 w-4" /> Support Levels
                </h3>
                <div className="space-y-2">
                  {srData.support_resistance.supports.length > 0 ? (
                    srData.support_resistance.supports.map((s: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-green-50 border border-green-100 dark:bg-green-950/40 dark:border-green-800">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800">
                            S{i + 1}
                          </Badge>
                          <span className="font-sans font-semibold text-lg">₹{s.level}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm text-green-600">
                            -{((srData.current_price - s.level) / srData.current_price * 100).toFixed(2)}% away
                          </span>
                          <span className="text-xs text-muted-foreground block">Strength: {s.strength}x touched</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No support levels found (near period low)</p>
                  )}
                </div>
              </div>

              {/* Quick Analysis */}
              {srData.analysis.nearest_support && srData.analysis.nearest_resistance && (
                <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm">
                  <p className="font-medium mb-1">Quick Analysis:</p>
                  <p>
                    Price is <span className="font-semibold">{srData.analysis.distance_to_support_pct}%</span> above nearest support (S1: ₹{srData.analysis.nearest_support}) and{" "}
                    <span className="font-semibold">{srData.analysis.distance_to_resistance_pct}%</span> below nearest resistance (R1: ₹{srData.analysis.nearest_resistance}).
                    {srData.analysis.distance_to_support_pct < srData.analysis.distance_to_resistance_pct
                      ? " Closer to support — potential buy zone if support holds."
                      : " Closer to resistance — watch for breakout or reversal."}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pivot Points */}
          {pivotData && !pivotData.error && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center justify-between gap-2">
                  <span>
                    Daily Pivot Points
                    <span className="ml-2 text-sm font-normal text-amber-700">· Intraday (same all day)</span>
                  </span>
                  <Badge variant="outline" className="whitespace-nowrap">Based on {pivotData.based_on.date}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Previous session: H ₹{pivotData.based_on.high} | L ₹{pivotData.based_on.low} | C ₹{pivotData.based_on.close}
                </p>
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800 rounded px-2 py-1 mt-1.5">
                  ⓘ <b>Intraday</b> levels (labelled PR/PS), computed from the last session and reset each day — they do <b>not</b> change with the 1M/3M/6M/1Y selector (that only drives the Support &amp; Resistance card).
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {[
                    { label: "PR3", value: pivotData.pivot_points.r3, color: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" },
                    { label: "PR2", value: pivotData.pivot_points.r2, color: "bg-red-50 text-red-600 border-red-100 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800" },
                    { label: "PR1", value: pivotData.pivot_points.r1, color: "bg-red-50/50 text-red-500 border-red-100/50 dark:bg-red-950/20 dark:text-red-400 dark:border-red-800/50" },
                    { label: "PP", value: pivotData.pivot_points.pivot, color: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800" },
                    { label: "PS1", value: pivotData.pivot_points.s1, color: "bg-green-50/50 text-green-500 border-green-100/50 dark:bg-green-950/20 dark:text-green-400 dark:border-green-800/50" },
                    { label: "PS2", value: pivotData.pivot_points.s2, color: "bg-green-50 text-green-600 border-green-100 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800" },
                    { label: "PS3", value: pivotData.pivot_points.s3, color: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800" },
                  ].map((item) => {
                    const diff = ((item.value - pivotData.current_price) / pivotData.current_price * 100);
                    const isCurrentNear = Math.abs(diff) < 0.5;
                    return (
                      <div
                        key={item.label}
                        className={`flex items-center justify-between p-3 rounded-lg border ${isCurrentNear ? "ring-2 ring-blue-400" : ""}`}
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="outline" className={item.color}>
                            {item.label}
                          </Badge>
                          <span className="font-sans font-semibold">₹{item.value}</span>
                        </div>
                        <span className={`text-sm ${diff >= 0 ? "text-red-500" : "text-green-500"}`}>
                          {diff >= 0 ? "+" : ""}{diff.toFixed(2)}%
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm">
                  <p className="font-medium mb-1">Pivot Point Strategy:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>Price above PP (₹{pivotData.pivot_points.pivot}): Bullish bias, target PR1/PR2</li>
                    <li>Price below PP: Bearish bias, target PS1/PS2</li>
                    <li>PR1/PS1: First profit target / stop-loss level</li>
                    <li>PR2/PS2: Extended targets for strong trends</li>
                    <li>PR3/PS3: Extreme levels — expect reversal</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {srData?.error && (
        <Card className="border-red-200">
          <CardContent className="p-4 text-red-600">{srData.error}</CardContent>
        </Card>
      )}

      {/* Help */}
      <HelpSection title="How to Use Strategies" items={strategiesHelp} />
    </div>
  );
}
