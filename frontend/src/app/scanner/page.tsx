"use client";

import { useState } from "react";
import { startScan } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Radar, TrendingUp, TrendingDown, Volume2, ArrowUpRight } from "lucide-react";
import { HelpSection } from "@/components/HelpSection";
import { scannerHelp } from "@/lib/help-content";
import { NextStep } from "@/components/NextStep";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { iconBadge, infoSubtle } from "@/lib/status-colors";

export default function ScannerPage() {
  const [universe, setUniverse] = useState("nifty50");
  const [gapThreshold, setGapThreshold] = useState(2);
  const [volumeMultiplier, setVolumeMultiplier] = useState(2);
  const [breakoutLookback, setBreakoutLookback] = useState(20);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [logs, setLogs] = useState<string[]>([]);
  const [results, setResults] = useState<any>(null);

  const handleScan = async () => {
    setStatus("running");
    setLogs(["Scanning... this takes 3-10 seconds depending on the universe size."]);
    setResults(null);

    try {
      const res: any = await startScan({
        universe,
        strategies: ["gap", "volume", "breakout"],
        gap_threshold: gapThreshold,
        volume_multiplier: volumeMultiplier,
        breakout_lookback: breakoutLookback,
      });

      if (res && res.results) {
        setResults(res);
        const g = res.results.gap?.length || 0;
        const v = res.results.volume?.length || 0;
        const b = res.results.breakout?.length || 0;
        setLogs([`Scan complete! Found: ${g} gaps, ${v} volume spikes, ${b} breakouts out of ${res.scanned} stocks.`]);
        setStatus("done");
      } else {
        setLogs(["Scan returned no results. The backend may not be running."]);
        setStatus("done");
      }
    } catch (e: any) {
      setLogs([`Error: ${e.message}`]);
      setStatus("done");
    }
  };

  const allGaps = results?.results?.gap || [];
  const gapUpCount = allGaps.filter((g: any) => g.direction === "UP").length;
  const gapDownCount = allGaps.filter((g: any) => g.direction === "DOWN").length;
  const volumeResults = results?.results?.volume || [];
  const breakoutResults = results?.results?.breakout || [];

  const [gapFilter, setGapFilter] = useState<"all" | "up" | "down">("all");
  const gapResults = allGaps.filter((g: any) =>
    gapFilter === "all" ? true : gapFilter === "up" ? g.direction === "UP" : g.direction === "DOWN"
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Market Scanner</h1>
        <p className="text-sm text-muted-foreground">
          Scan NSE/BSE stocks for gaps, volume spikes, and breakouts
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
            <div className="w-28">
              <label className="text-xs text-muted-foreground mb-1 block">Gap %</label>
              <Input type="number" value={gapThreshold} onChange={(e) => setGapThreshold(Number(e.target.value))} disabled={status === "running"} />
            </div>
            <div className="w-28">
              <label className="text-xs text-muted-foreground mb-1 block">Vol Multiplier</label>
              <Input type="number" value={volumeMultiplier} onChange={(e) => setVolumeMultiplier(Number(e.target.value))} disabled={status === "running"} />
            </div>
            <div className="w-28">
              <label className="text-xs text-muted-foreground mb-1 block">Breakout Days</label>
              <Input type="number" value={breakoutLookback} onChange={(e) => setBreakoutLookback(Number(e.target.value))} disabled={status === "running"} />
            </div>
            <Button onClick={handleScan} disabled={status === "running"}>
              {status === "running" ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Scanning...</>
              ) : (
                <><Radar className="h-4 w-4 mr-2" />Run Scan</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Progress / Status */}
      {logs.length > 0 && (
        <Card className={status === "running" ? infoSubtle() : ""}>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-sm">
              {status === "running" && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
              <span className={status === "running" ? "text-blue-600" : "text-muted-foreground"}>
                {logs[logs.length - 1]}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && (
        <>
          {/* Summary */}
          <div className="flex gap-3">
            <Badge variant="outline" className="px-3 py-1">
              Scanned: {results.scanned}/{results.total_stocks} stocks
            </Badge>
            <Badge variant="outline" className={`px-3 py-1 ${iconBadge("orange")} border border-orange-200 dark:border-orange-800`}>
              Gaps: {gapResults.length}
            </Badge>
            <Badge variant="outline" className={`px-3 py-1 ${iconBadge("info")} border border-blue-200 dark:border-blue-800`}>
              Volume Spikes: {volumeResults.length}
            </Badge>
            <Badge variant="outline" className={`px-3 py-1 ${iconBadge("purple")} border border-purple-200 dark:border-purple-800`}>
              Breakouts: {breakoutResults.length}
            </Badge>
          </div>

          <Tabs defaultValue="gap">
            <TabsList>
              <TabsTrigger value="gap" className="gap-1">
                <ArrowUpRight className="h-3 w-3" /> Gap ({gapResults.length})
              </TabsTrigger>
              <TabsTrigger value="volume" className="gap-1">
                <Volume2 className="h-3 w-3" /> Volume ({volumeResults.length})
              </TabsTrigger>
              <TabsTrigger value="breakout" className="gap-1">
                <TrendingUp className="h-3 w-3" /> Breakout ({breakoutResults.length})
              </TabsTrigger>
            </TabsList>

            {/* Gap Scanner Results */}
            <TabsContent value="gap">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
                    <span>Stocks with &gt;{gapThreshold}% gap from previous close</span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={gapFilter === "all" ? "default" : "outline"}
                        className="h-7 text-xs"
                        onClick={() => setGapFilter("all")}
                      >
                        All ({allGaps.length})
                      </Button>
                      <Button
                        size="sm"
                        variant={gapFilter === "up" ? "default" : "outline"}
                        className="h-7 text-xs text-green-700"
                        onClick={() => setGapFilter("up")}
                      >
                        <TrendingUp className="h-3 w-3 mr-1" /> Gap Up ({gapUpCount})
                      </Button>
                      <Button
                        size="sm"
                        variant={gapFilter === "down" ? "default" : "outline"}
                        className="h-7 text-xs text-red-700"
                        onClick={() => setGapFilter("down")}
                      >
                        <TrendingDown className="h-3 w-3 mr-1" /> Gap Down ({gapDownCount})
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticker</TableHead>
                          <TableHead>Direction</TableHead>
                          <TableHead className="text-right">Prev Close</TableHead>
                          <TableHead className="text-right">Open</TableHead>
                          <TableHead className="text-right">Gap %</TableHead>
                          <TableHead className="text-right">CMP</TableHead>
                          <TableHead>Gap Filled?</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gapResults.length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No gaps found</TableCell></TableRow>
                        ) : gapResults.map((r: any) => (
                          <TableRow key={r.ticker}>
                            <TableCell className="font-sans font-medium">{r.ticker}</TableCell>
                            <TableCell>
                              <Badge className={r.direction === "UP" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                                {r.direction === "UP" ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                                GAP {r.direction}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-sans">₹{r.prev_close}</TableCell>
                            <TableCell className="text-right font-sans">₹{r.open}</TableCell>
                            <TableCell className={`text-right font-sans font-semibold ${r.gap_pct > 0 ? "text-green-600" : "text-red-600"}`}>
                              {r.gap_pct > 0 ? "+" : ""}{r.gap_pct}%
                            </TableCell>
                            <TableCell className="text-right font-sans">₹{r.price}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={r.filled ? iconBadge("caution") : iconBadge("bullish")}>
                                {r.filled ? "Filled" : "Open"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Link href={`/analysis?ticker=${r.ticker}`} className="text-xs text-primary hover:underline">
                                Analyze
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Volume Spike Results */}
            <TabsContent value="volume">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Stocks with volume &gt;{volumeMultiplier}x average
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticker</TableHead>
                          <TableHead>Direction</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Change %</TableHead>
                          <TableHead className="text-right">Volume</TableHead>
                          <TableHead className="text-right">Avg Volume</TableHead>
                          <TableHead className="text-right">Ratio</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {volumeResults.length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No volume spikes found</TableCell></TableRow>
                        ) : volumeResults.map((r: any) => (
                          <TableRow key={r.ticker}>
                            <TableCell className="font-sans font-medium">{r.ticker}</TableCell>
                            <TableCell>
                              <Badge className={r.direction === "BULLISH" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                                {r.direction}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-sans">₹{r.price}</TableCell>
                            <TableCell className={`text-right font-sans ${r.change_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {r.change_pct >= 0 ? "+" : ""}{r.change_pct}%
                            </TableCell>
                            <TableCell className="text-right font-sans">{(r.volume / 100000).toFixed(1)}L</TableCell>
                            <TableCell className="text-right font-sans text-muted-foreground">{(r.avg_volume / 100000).toFixed(1)}L</TableCell>
                            <TableCell className="text-right font-sans font-semibold text-blue-600">{r.volume_ratio}x</TableCell>
                            <TableCell>
                              <Link href={`/analysis?ticker=${r.ticker}`} className="text-xs text-primary hover:underline">
                                Analyze
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Breakout Results */}
            <TabsContent value="breakout">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">
                    Stocks breaking {breakoutLookback}-day high
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticker</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead className="text-right">Breakout Level</TableHead>
                          <TableHead className="text-right">Above %</TableHead>
                          <TableHead className="text-right">Vol Ratio</TableHead>
                          <TableHead>Vol Confirmed</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {breakoutResults.length === 0 ? (
                          <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No breakouts found</TableCell></TableRow>
                        ) : breakoutResults.map((r: any) => (
                          <TableRow key={r.ticker}>
                            <TableCell className="font-sans font-medium">{r.ticker}</TableCell>
                            <TableCell className="text-right font-sans">₹{r.price}</TableCell>
                            <TableCell className="text-right font-sans text-muted-foreground">₹{r.breakout_level}</TableCell>
                            <TableCell className="text-right font-sans text-green-600">+{r.breakout_pct}%</TableCell>
                            <TableCell className="text-right font-sans">{r.volume_ratio}x</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={r.volume_confirmed ? iconBadge("bullish") : iconBadge("caution")}>
                                {r.volume_confirmed ? "Yes" : "Weak"}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Link href={`/analysis?ticker=${r.ticker}`} className="text-xs text-primary hover:underline">
                                Analyze
                              </Link>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Help */}
      {/* Next Step */}
      {results && (
        <NextStep
          title="Get ranked trade ideas"
          description="Recommendations combine Gap + Volume + Breakout + S/R + RSI + Cyclical into one ranked list"
          href="/recommendations"
          buttonText="See Top Picks"
          icon={Sparkles}
        />
      )}

      <HelpSection title="How to Use Scanner" items={scannerHelp} />
    </div>
  );
}
