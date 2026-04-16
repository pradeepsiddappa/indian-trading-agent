"use client";

import { useState } from "react";
import { getRecommendations, openPaperTrade } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HelpSection } from "@/components/HelpSection";
import { Loader2, TrendingUp, TrendingDown, Sparkles, ChevronDown, ChevronUp, Target, Search, FlaskConical } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { NextStep } from "@/components/NextStep";

const recommendationsHelp = [
  {
    question: "What is this?",
    answer: "This is the CONSOLIDATED RECOMMENDATION ENGINE. Instead of you checking each scanner/strategy separately, this runs ALL signals for EVERY stock and combines them:\n\n  \u2022 Gap Up/Down detection\n  \u2022 Volume spike analysis\n  \u2022 Breakout detection\n  \u2022 Support/Resistance proximity\n  \u2022 RSI overbought/oversold\n  \u2022 Cyclical/seasonal patterns\n  \u2022 Trend (50/200 SMA alignment)\n\nEach signal has a weight based on historical win rate. Stocks are then ranked and classified: Strong Buy, Buy, Sell, Strong Sell.",
  },
  {
    question: "How does the scoring work?",
    answer: "Each signal adds or subtracts points:\n\nBullish signals (add points):\n  \u2022 Volume-confirmed breakout: +3.0 (historically best signal)\n  \u2022 Volume spike bullish: +2.0\n  \u2022 Near major support: +2.0\n  \u2022 Gap filled (reversal): +1.5\n  \u2022 RSI oversold: +1.5\n  \u2022 Cyclical bullish month: +1.5\n  \u2022 Strong uptrend: +1.0\n\nBearish signals (subtract points):\n  \u2022 Breakdown below support: -2.5\n  \u2022 Volume spike bearish: -2.0\n  \u2022 Near major resistance: -1.5\n  \u2022 Cyclical bearish month: -1.5\n  \u2022 RSI overbought: -1.0\n  \u2022 Strong downtrend: -1.0\n\nRatings:\n  \u2022 Score >=4: STRONG BUY (4+ aligned bullish signals)\n  \u2022 Score 2-4: BUY\n  \u2022 Score -2 to -4: SELL\n  \u2022 Score <=-4: STRONG SELL\n  \u2022 Otherwise: NEUTRAL (filtered out)",
  },
  {
    question: "How to use the recommendations?",
    answer: "Simple workflow:\n\n1. Run the recommender (takes ~30 sec for NIFTY 100)\n2. Focus on STRONG BUY / STRONG SELL first (highest confidence)\n3. Click \"View Signals\" on interesting ones to see WHY it's recommended\n4. Click \"Analyze\" to run AI analysis (Rs.15-25) on top 2-3 candidates\n5. Only take trades where AI agrees with the recommendation\n\nThe key benefit: you go from scanning 100 stocks manually to a ranked list of ~5-20 high-conviction trade ideas in 30 seconds.",
  },
  {
    question: "What does \"Confidence\" mean?",
    answer: "Confidence = number of aligned signals pointing the same direction:\n\n  \u2022 HIGH: 4+ signals aligned (very strong conviction, rare)\n  \u2022 MEDIUM: 2-3 signals aligned (good setups)\n  \u2022 LOW: 1 signal (only 1 indicator flashing, weak)\n\nAlways prefer HIGH confidence signals. A stock with Score +3 and 4 signals is better than Score +4 with only 1 signal.",
  },
  {
    question: "What is the % estimated success?",
    answer: "A rough probability estimate based on:\n  \u2022 Baseline: 50% (random chance)\n  \u2022 +4% per point of absolute score (up to +30%)\n  \u2022 +2% per aligned signal (up to +15%)\n  \u2022 Max: 85% (never 100% certain)\n\nInterpretation:\n  \u2022 >=70% = high probability setup (rare, take it)\n  \u2022 60-70% = good probability (worth considering)\n  \u2022 50-60% = barely better than coin flip\n\nThis is an estimate based on signal strength, NOT guaranteed. Actual win rates depend on market conditions. Always use Performance page to validate actual historical win rates.",
  },
  {
    question: "What does \"AI Analyze\" button do?",
    answer: "Clicking \"AI Analyze\" takes you to the full AI analysis pipeline:\n\n  \u2022 10 AI agents analyze the stock (market, social, news, fundamentals, bull/bear debate, trader, risk debate, portfolio manager)\n  \u2022 Reads actual news articles, checks P&L/balance sheet\n  \u2022 Returns specific entry price, stop-loss, target, position size, time horizon\n  \u2022 Takes 1-3 minutes per stock\n  \u2022 Costs ~Rs.15-25 per analysis (Anthropic Claude API)\n\nThis is MUCH deeper than the recommendation engine. Use it for your TOP 2-3 picks, not every recommendation.\n\nThink of it as:\n  \u2022 Recommendations = Quick filter (FREE, 30 sec for 100 stocks)\n  \u2022 AI Analyze = Expert opinion (PAID, deep analysis of ONE stock)",
  },
  {
    question: "How often should I run this?",
    answer: "Best practice:\n  \u2022 Once per day, 30 min after market open (9:45 AM) \u2014 captures gaps and opening moves\n  \u2022 Once more at 2 PM \u2014 for intraday or next-day swing trade ideas\n\nThe data is real-time from yfinance, so signals change as prices move. A stock that was \"Buy\" at 10 AM might be \"Neutral\" by 2 PM if the price ran up too much.\n\nIt's completely FREE to run \u2014 no API cost. So run it as often as you like.",
  },
];

const ratingStyles: Record<string, { color: string; bg: string; border: string; icon: any }> = {
  "STRONG BUY": { color: "text-green-700", bg: "bg-green-100", border: "border-green-300", icon: TrendingUp },
  "BUY": { color: "text-green-600", bg: "bg-green-50", border: "border-green-200", icon: TrendingUp },
  "SELL": { color: "text-red-600", bg: "bg-red-50", border: "border-red-200", icon: TrendingDown },
  "STRONG SELL": { color: "text-red-700", bg: "bg-red-100", border: "border-red-300", icon: TrendingDown },
};

const confidenceStyles: Record<string, string> = {
  HIGH: "bg-blue-100 text-blue-800 border-blue-300",
  MEDIUM: "bg-yellow-50 text-yellow-700 border-yellow-200",
  LOW: "bg-gray-50 text-gray-600 border-gray-200",
};

function RecommendationCard({ rec }: { rec: any }) {
  const [expanded, setExpanded] = useState(false);
  const style = ratingStyles[rec.direction] || ratingStyles.BUY;
  const Icon = style.icon;

  return (
    <Card className={`${style.border}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className={`p-2 rounded-lg ${style.bg}`}>
              <Icon className={`h-5 w-5 ${style.color}`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-lg">{rec.ticker}</h3>
                <span className={`text-sm ${rec.change_pct >= 0 ? "text-green-600" : "text-red-600"}`}>
                  Rs.{rec.price} ({rec.change_pct >= 0 ? "+" : ""}{rec.change_pct}%)
                </span>
                <Badge className={`${style.bg} ${style.color} border`}>{rec.direction}</Badge>
                <Badge variant="outline" className={confidenceStyles[rec.confidence]}>
                  {rec.confidence} confidence
                </Badge>
                {rec.success_probability && (
                  <Badge variant="outline" className={rec.success_probability >= 70 ? "bg-green-100 text-green-800 border-green-300" : rec.success_probability >= 60 ? "bg-yellow-50 text-yellow-700 border-yellow-200" : "bg-gray-50 text-gray-600 border-gray-200"}>
                    {rec.success_probability}% estimated success
                  </Badge>
                )}
                <Badge variant="outline" className="text-xs">
                  Score: {rec.score >= 0 ? "+" : ""}{rec.score}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {rec.bullish_signal_count > 0 && <span className="text-green-600">{rec.bullish_signal_count} bullish signals</span>}
                {rec.bullish_signal_count > 0 && rec.bearish_signal_count > 0 && <span> / </span>}
                {rec.bearish_signal_count > 0 && <span className="text-red-600">{rec.bearish_signal_count} bearish signals</span>}
                {rec.rsi !== null && <span> / RSI: {rec.rsi}</span>}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              Signals
            </Button>
            <Button
              size="sm"
              variant="ghost"
              title="Open paper trade to track if this pick works"
              onClick={async () => {
                try {
                  await openPaperTrade({
                    ticker: rec.ticker,
                    source: "recommendation",
                    strategy: "Recommendation Engine (combined signals)",
                    signal: rec.direction,
                    score: rec.score,
                    confidence: rec.confidence,
                    success_probability: rec.success_probability,
                    triggered_signals: rec.signals,  // array of {type, direction, value, weight}
                  } as any);
                  toast.success(`Paper trade opened at Rs.${rec.price}`);
                } catch (e: any) {
                  toast.error(e.message || "Failed to track");
                }
              }}
            >
              <FlaskConical className="h-3 w-3 mr-1" /> Track
            </Button>
            <Link href={`/analysis?ticker=${rec.ticker}`}>
              <Button size="sm" variant="outline" title="Run full AI analysis (costs ~Rs.15-25, takes 1-3 min)">
                <Target className="h-3 w-3 mr-1" /> AI Analyze
              </Button>
            </Link>
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t space-y-2">
            <p className="text-xs font-medium text-muted-foreground mb-2">WHY THIS RECOMMENDATION:</p>
            {rec.signals.map((s: any, i: number) => {
              const dirColor = s.direction === "BULLISH" ? "text-green-700 bg-green-50" : s.direction === "BEARISH" ? "text-red-700 bg-red-50" : "text-gray-600 bg-gray-50";
              return (
                <div key={i} className={`flex items-center justify-between p-2 rounded text-sm ${dirColor}`}>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{s.direction}</Badge>
                    <span>{s.type}</span>
                    <span className="text-muted-foreground">({s.value})</span>
                  </div>
                  <span className="text-xs font-mono">
                    {s.weight >= 0 ? "+" : ""}{s.weight} pts
                  </span>
                </div>
              );
            })}
            <div className="flex items-center justify-between pt-2 border-t">
              <span className="text-xs text-muted-foreground">60-day range:</span>
              <span className="text-xs">
                Support: <span className="text-green-600">Rs.{rec.near_support}</span> • Resistance: <span className="text-red-600">Rs.{rec.near_resistance}</span>
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function RecommendationsPage() {
  const [universe, setUniverse] = useState("nifty100");
  const [minSignals, setMinSignals] = useState(2);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const handleRun = async () => {
    setLoading(true);
    setData(null);
    try {
      const result: any = await getRecommendations(universe, minSignals);
      setData(result);
    } catch (e: any) {
      toast.error(e.message || "Failed to get recommendations");
    } finally {
      setLoading(false);
    }
  };

  const totalRecs = data
    ? data.strong_buys.length + data.buys.length + data.sells.length + data.strong_sells.length
    : 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-yellow-500" /> Recommendations
        </h1>
        <p className="text-sm text-muted-foreground">
          AI-free unified recommendation engine. Combines ALL signals (gaps, volume, breakouts, S/R, RSI, cyclical, trend) into ranked trade ideas. FREE.
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
                    disabled={loading}
                  >
                    {u.label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Min Signals</label>
              <div className="flex gap-1">
                {[1, 2, 3].map((n) => (
                  <Button
                    key={n}
                    variant={minSignals === n ? "default" : "outline"}
                    size="sm"
                    onClick={() => setMinSignals(n)}
                    disabled={loading}
                  >
                    {n}+
                  </Button>
                ))}
              </div>
            </div>
            <Button onClick={handleRun} disabled={loading}>
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />Analyzing...</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-2" />Get Recommendations</>
              )}
            </Button>
          </div>
          {loading && (
            <p className="text-xs text-muted-foreground mt-3">
              Analyzing {universe.toUpperCase()} stocks — fetching prices, computing all signals, ranking... (~30-60 seconds)
            </p>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className="border-green-300">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Strong Buy</p>
              <p className="text-2xl font-bold text-green-700">{data.strong_buys.length}</p>
            </CardContent>
          </Card>
          <Card className="border-green-200">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Buy</p>
              <p className="text-2xl font-bold text-green-600">{data.buys.length}</p>
            </CardContent>
          </Card>
          <Card className="border-red-200">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Sell</p>
              <p className="text-2xl font-bold text-red-600">{data.sells.length}</p>
            </CardContent>
          </Card>
          <Card className="border-red-300">
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Strong Sell</p>
              <p className="text-2xl font-bold text-red-700">{data.strong_sells.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">Analyzed</p>
              <p className="text-2xl font-bold">{data.total_analyzed}</p>
              <p className="text-xs text-muted-foreground">{data.total_with_signals} with signals</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      {data && totalRecs > 0 && (
        <Tabs defaultValue="strong_buys">
          <TabsList>
            <TabsTrigger value="strong_buys">Strong Buy ({data.strong_buys.length})</TabsTrigger>
            <TabsTrigger value="buys">Buy ({data.buys.length})</TabsTrigger>
            <TabsTrigger value="sells">Sell ({data.sells.length})</TabsTrigger>
            <TabsTrigger value="strong_sells">Strong Sell ({data.strong_sells.length})</TabsTrigger>
          </TabsList>

          {(["strong_buys", "buys", "sells", "strong_sells"] as const).map((key) => (
            <TabsContent key={key} value={key} className="space-y-3">
              {data[key].length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    No {key.replace("_", " ")} recommendations. Try lowering Min Signals or switching universe.
                  </CardContent>
                </Card>
              ) : (
                data[key].map((rec: any) => <RecommendationCard key={rec.ticker} rec={rec} />)
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {data && totalRecs === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-muted-foreground">No strong recommendations found today.</p>
            <p className="text-xs text-muted-foreground mt-2">
              The market might be in a neutral state. Try again later or switch to a different universe.
            </p>
          </CardContent>
        </Card>
      )}

      {!data && !loading && (
        <Card className="h-[200px] flex items-center justify-center">
          <CardContent className="text-center">
            <p className="text-muted-foreground">Click &quot;Get Recommendations&quot; to scan all {universe.toUpperCase()} stocks and get ranked trade ideas.</p>
            <p className="text-xs text-muted-foreground mt-2">
              This replaces manual checking of Scanner + Strategies + Charts. One click, full analysis, ranked list.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Next Step */}
      {data && totalRecs > 0 && (
        <NextStep
          title="Deep-analyze your top pick with AI"
          description="Click 'AI Analyze' on a Strong Buy for entry/SL/target from the 10-agent AI pipeline (~Rs.15-25)"
          href="/analysis"
          buttonText="Open Analysis"
          icon={Search}
        />
      )}

      <HelpSection title="How to Use Recommendations" items={recommendationsHelp} />
    </div>
  );
}
