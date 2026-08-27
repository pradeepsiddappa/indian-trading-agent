"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Search, History, ArrowRight } from "lucide-react";
import Link from "next/link";
import { iconBadge } from "@/lib/status-colors";

const steps = [
  {
    number: 1,
    title: "Find opportunities",
    description: "Today's Top Picks shows you ranked trade ideas combining all signals",
    cta: "See Top Picks",
    href: "/recommendations",
    icon: Sparkles,
    color: iconBadge("caution"),
    cost: "FREE",
  },
  {
    number: 2,
    title: "Deep analyze the best ones",
    description: "Click 'Analyze' on top 2-3 picks for AI-powered analysis with entry/SL/target",
    cta: "Deep Analysis",
    href: "/analysis",
    icon: Search,
    color: iconBadge("info"),
    cost: "Rs.15-25 each",
  },
  {
    number: 3,
    title: "Track your trades",
    description: "After the trade closes, log your P&L to see your actual win rate over time",
    cta: "My Trades",
    href: "/history",
    icon: History,
    color: iconBadge("bullish"),
    cost: "FREE",
  },
];

export function WorkflowGuide() {
  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="font-semibold text-lg mb-4">Your Daily Workflow</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {steps.map((step) => (
            <div
              key={step.number}
              className="relative p-4 rounded-lg border border-border hover:border-primary/30 transition-colors"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-2 rounded-lg ${step.color}`}>
                  <step.icon className="h-4 w-4" />
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  STEP {step.number}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {step.cost}
                </span>
              </div>
              <h3 className="font-medium text-sm mb-1">{step.title}</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                {step.description}
              </p>
              <Link href={step.href}>
                <Button variant="ghost" size="sm" className="h-7 text-xs -ml-2">
                  {step.cta} <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
