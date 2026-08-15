"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Target, BarChart3, TrendingUp, Zap } from "lucide-react";

const strategies = [
  {
    id: "support-resistance",
    title: "Support & Resistance",
    description: "Calculate key S1-S3 / R1-R3 levels and daily Pivot Points for any stock. Identify buy zones (near support) and sell zones (near resistance).",
    icon: Target,
    color: "text-blue-600",
    bgColor: "bg-blue-50 dark:bg-blue-950/40",
    borderColor: "border-blue-200 dark:border-blue-800",
    tags: ["S/R Levels", "Pivot Points", "Intraday"],
    cost: "Free",
    href: "/strategies/support-resistance",
  },
  {
    id: "cyclical",
    title: "Cyclical Patterns",
    description: "Discover monthly seasonality, day-of-week patterns, and sector rotation cycles. Find which months a stock historically rallies or dips.",
    icon: BarChart3,
    color: "text-purple-600",
    bgColor: "bg-purple-50 dark:bg-purple-950/40",
    borderColor: "border-purple-200 dark:border-purple-800",
    tags: ["Seasonality", "Sector Rotation", "Day-of-Week"],
    cost: "Free",
    href: "/strategies/cyclical",
  },
  {
    id: "momentum",
    title: "Momentum & Breakout",
    description: "Use the Scanner to find stocks with gap ups, volume spikes, and breakouts. Then run AI analysis on the top picks.",
    icon: Zap,
    color: "text-orange-600",
    bgColor: "bg-orange-50 dark:bg-orange-950/40",
    borderColor: "border-orange-200 dark:border-orange-800",
    tags: ["Gap", "Volume", "Breakout"],
    cost: "Free (scan) + API (analysis)",
    href: "/scanner",
  },
  {
    id: "ai-analysis",
    title: "AI Multi-Agent Analysis",
    description: "Full 10-agent AI pipeline: technicals, fundamentals, news, sentiment, bull/bear debate, risk assessment. Gets you entry/SL/target.",
    icon: TrendingUp,
    color: "text-green-600",
    bgColor: "bg-green-50 dark:bg-green-950/40",
    borderColor: "border-green-200 dark:border-green-800",
    tags: ["AI Powered", "Entry/SL/Target", "Debate"],
    cost: "~Rs.15-25 per analysis",
    href: "/analysis",
  },
];

export default function StrategiesHub() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Strategies</h1>
        <p className="text-sm text-muted-foreground">Pick a strategy to analyze stocks. Free strategies use only historical price data — no API cost.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {strategies.map((strategy) => (
          <Link key={strategy.id} href={strategy.href}>
            <Card className={`h-full hover:shadow-md transition-all hover:border-${strategy.color.split("-")[1]}-300 cursor-pointer group ${strategy.borderColor}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-xl ${strategy.bgColor}`}>
                    <strategy.icon className={`h-6 w-6 ${strategy.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg">{strategy.title}</h3>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                      {strategy.description}
                    </p>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      {strategy.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      <Badge variant="outline" className={strategy.cost === "Free" ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800" : "bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800"}>
                        {strategy.cost}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
