"use client";

import { useEffect, useState } from "react";
import { getLearningInsights } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HelpSection } from "@/components/HelpSection";
import {
  Brain,
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  Sparkles,
  Target,
  Zap,
  Calendar,
  Award,
  MinusCircle,
} from "lucide-react";
import { toast } from "sonner";

const insightsHelp = [
  {
    question: "What is this page?",
    answer: "This analyzes your PAST trades (both paper trades and real ones with logged P&L) to surface patterns you wouldn't easily spot yourself.\n\nIt answers questions like:\n  \u2022 Which signals actually work for YOUR trades?\n  \u2022 Which stocks do you consistently win/lose on?\n  \u2022 Are HIGH confidence picks really better than LOW?\n  \u2022 Which months does your strategy fail in?\n\nMinimum 3 closed trades needed. More data = better insights.",
  },
  {
    question: "Does the AI train itself?",
    answer: "Not exactly. The LLM (Claude) never changes its weights. What happens:\n\n1. You log P&L on trades with 'Teach the agent' checked\n2. The Reflector writes a text reflection \u2014 \"This trade failed because...\"\n3. That reflection is stored in BM25 memory\n4. Next time you analyze a similar stock, past reflections are retrieved and added to the prompt\n\nSo the agent 'remembers' via context, not via training. This page gives you the same insights in a human-readable form, helping YOU learn to filter the agent's output.",
  },
  {
    question: "How to use these insights?",
    answer: "1. Check the SUMMARY card \u2014 key findings pop up first\n2. Look at STRENGTHS \u2014 where you have a real edge, trust these\n3. Look at WEAKNESSES \u2014 where you lose money, avoid or fade\n4. Each insight has a specific actionable tip\n5. Adjust your Recommendations + Scanner filters based on what works\n\nFor example: If HIGH confidence picks have 70% win rate but LOW has 40%, start filtering for HIGH only. If 'Volume Spike Bullish' has 65% win rate, make it a required signal.",
  },
  {
    question: "Why is the sample size so important?",
    answer: "With 3-5 trades, any pattern could be random chance. You need at least:\n  \u2022 10 trades for a signal-level insight to be meaningful\n  \u2022 20 trades for confidence-level analysis\n  \u2022 30+ trades for seasonal patterns\n\nThe 'count' on each insight shows sample size. Take insights with <10 trades with a pinch of salt.",
  },
];

const categoryIcons: Record<string, any> = {
  "Signal Type": Sparkles,
  "Confidence Level": Award,
  "Strategy": Target,
  "Seasonality": Calendar,
  "Ticker": TrendingUp,
  "Indicator": Zap,
  "Direction": TrendingUp,
};

const typeStyles: Record<string, { bg: string; border: string; text: string; icon: any }> = {
  strength: { bg: "bg-green-50", border: "border-green-300", text: "text-green-800", icon: CheckCircle2 },
  positive: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", icon: TrendingUp },
  neutral: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", icon: MinusCircle },
  caution: { bg: "bg-yellow-50", border: "border-yellow-300", text: "text-yellow-800", icon: AlertTriangle },
  weakness: { bg: "bg-red-50", border: "border-red-300", text: "text-red-800", icon: TrendingDown },
  insufficient: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-500", icon: Info },
};

function InsightCard({ insight }: { insight: any }) {
  const style = typeStyles[insight.type] || typeStyles.neutral;
  const CategoryIcon = categoryIcons[insight.category] || Info;
  const TypeIcon = style.icon;

  return (
    <Card className={`${style.border} ${style.bg}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-white">
              <CategoryIcon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{insight.category}</p>
              <p className="font-semibold">{insight.name}</p>
            </div>
          </div>
          <Badge variant="outline" className={`${style.text} ${style.border} text-xs flex items-center gap-1`}>
            <TypeIcon className="h-3 w-3" />
            {insight.label}
          </Badge>
        </div>

        <p className="text-sm text-muted-foreground mb-3">{insight.description}</p>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="text-center p-2 rounded bg-white/50">
            <p className="text-[10px] text-muted-foreground uppercase">Trades</p>
            <p className="font-semibold text-sm">{insight.stats.count}</p>
          </div>
          <div className="text-center p-2 rounded bg-white/50">
            <p className="text-[10px] text-muted-foreground uppercase">Win Rate</p>
            <p className={`font-semibold text-sm ${insight.stats.win_rate >= 55 ? "text-green-700" : insight.stats.win_rate < 45 ? "text-red-700" : ""}`}>
              {insight.stats.win_rate}%
            </p>
          </div>
          <div className="text-center p-2 rounded bg-white/50">
            <p className="text-[10px] text-muted-foreground uppercase">Avg</p>
            <p className={`font-semibold text-sm ${insight.stats.avg_return >= 0 ? "text-green-700" : "text-red-700"}`}>
              {insight.stats.avg_return >= 0 ? "+" : ""}{insight.stats.avg_return}%
            </p>
          </div>
          <div className="text-center p-2 rounded bg-white/50">
            <p className="text-[10px] text-muted-foreground uppercase">Best / Worst</p>
            <p className="font-semibold text-xs">
              <span className="text-green-700">+{insight.stats.best}%</span>
              {" / "}
              <span className="text-red-700">{insight.stats.worst}%</span>
            </p>
          </div>
        </div>

        {/* Actionable tip */}
        <div className={`p-3 rounded-lg ${style.bg} border ${style.border} text-sm`}>
          <div className="flex items-start gap-2">
            <Brain className={`h-4 w-4 mt-0.5 flex-shrink-0 ${style.text}`} />
            <p className={`${style.text} leading-relaxed`}>{insight.actionable_tip}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function InsightsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("strengths");

  const load = async () => {
    setLoading(true);
    try {
      const result: any = await getLearningInsights();
      setData(result);
    } catch (e: any) {
      toast.error(e.message || "Failed to load insights");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="py-20 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-3">Analyzing your trade history...</p>
        </div>
      </div>
    );
  }

  if (!data?.ok) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" /> Learning Insights
          </h1>
          <p className="text-sm text-muted-foreground">Pattern analysis of your trading history</p>
        </div>

        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="p-8 text-center">
            <Info className="h-8 w-8 mx-auto text-blue-600 mb-3" />
            <p className="text-sm font-medium mb-2">{data?.message || "Need more trade data"}</p>
            <p className="text-xs text-muted-foreground mb-4">
              You have {data?.total_trades || 0} closed trades so far. Aim for 10-20 to start seeing reliable patterns.
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button variant="outline" size="sm" onClick={() => (window.location.href = "/recommendations")}>
                Open Top Picks
              </Button>
              <Button variant="outline" size="sm" onClick={() => (window.location.href = "/simulation")}>
                View Paper Trades
              </Button>
              <Button variant="outline" size="sm" onClick={() => (window.location.href = "/history")}>
                Log P&L
              </Button>
            </div>
          </CardContent>
        </Card>

        <HelpSection title="About Learning Insights" items={insightsHelp} />
      </div>
    );
  }

  const strengths = data.insights.filter((i: any) => i.type === "strength" || i.type === "positive");
  const weaknesses = data.insights.filter((i: any) => i.type === "weakness" || i.type === "caution");
  const neutral = data.insights.filter((i: any) => i.type === "neutral");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6" /> Learning Insights
          </h1>
          <p className="text-sm text-muted-foreground">
            Pattern analysis of your {data.total_trades} closed trades
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Overall Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Trades</p>
            <p className="text-2xl font-bold">{data.total_trades}</p>
          </CardContent>
        </Card>
        <Card className={data.overall.win_rate >= 55 ? "border-green-200" : data.overall.win_rate < 45 ? "border-red-200" : ""}>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className={`text-2xl font-bold ${data.overall.win_rate >= 55 ? "text-green-600" : data.overall.win_rate < 45 ? "text-red-600" : ""}`}>
              {data.overall.win_rate}%
            </p>
            <p className="text-xs text-muted-foreground">{data.overall.wins}W / {data.overall.losses}L</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Avg Return</p>
            <p className={`text-2xl font-bold ${data.overall.avg_return >= 0 ? "text-green-600" : "text-red-600"}`}>
              {data.overall.avg_return >= 0 ? "+" : ""}{data.overall.avg_return}%
            </p>
          </CardContent>
        </Card>
        <Card className="border-green-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Strengths Found</p>
            <p className="text-2xl font-bold text-green-600">{data.summary.strength_count}</p>
          </CardContent>
        </Card>
        <Card className="border-red-200">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Weaknesses</p>
            <p className="text-2xl font-bold text-red-600">{data.summary.weakness_count}</p>
          </CardContent>
        </Card>
      </div>

      {/* Key Findings */}
      {data.summary.key_findings.length > 0 && (
        <Card className="border-blue-200 bg-blue-50/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" /> Key Findings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.summary.key_findings.map((f: string, i: number) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>{f}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="strengths">
            <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
            Strengths ({strengths.length})
          </TabsTrigger>
          <TabsTrigger value="weaknesses">
            <AlertTriangle className="h-3 w-3 mr-1 text-red-600" />
            Weaknesses ({weaknesses.length})
          </TabsTrigger>
          <TabsTrigger value="neutral">
            <MinusCircle className="h-3 w-3 mr-1" />
            Neutral ({neutral.length})
          </TabsTrigger>
          <TabsTrigger value="all">All ({data.insights.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="strengths" className="space-y-3 mt-4">
          {strengths.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">No clear strengths yet. Keep trading to build up patterns.</CardContent></Card>
          ) : (
            strengths.map((i: any, idx: number) => <InsightCard key={idx} insight={i} />)
          )}
        </TabsContent>

        <TabsContent value="weaknesses" className="space-y-3 mt-4">
          {weaknesses.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">No clear weaknesses detected! Good job — keep going.</CardContent></Card>
          ) : (
            weaknesses.map((i: any, idx: number) => <InsightCard key={idx} insight={i} />)
          )}
        </TabsContent>

        <TabsContent value="neutral" className="space-y-3 mt-4">
          {neutral.map((i: any, idx: number) => <InsightCard key={idx} insight={i} />)}
        </TabsContent>

        <TabsContent value="all" className="space-y-3 mt-4">
          {data.insights.map((i: any, idx: number) => <InsightCard key={idx} insight={i} />)}
        </TabsContent>
      </Tabs>

      <HelpSection title="About Learning Insights" items={insightsHelp} />
    </div>
  );
}
