"use client";

import { Card, CardContent } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus, AlertTriangle, type LucideIcon } from "lucide-react";

const signalConfig: Record<string, { color: string; bg: string; icon: LucideIcon }> = {
  BUY: { color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", icon: TrendingUp },
  "STRONG BUY": { color: "text-green-400", bg: "bg-green-500/10 border-green-500/30", icon: TrendingUp },
  OVERWEIGHT: { color: "text-green-300", bg: "bg-green-500/10 border-green-500/20", icon: TrendingUp },
  HOLD: { color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30", icon: Minus },
  SELL: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", icon: TrendingDown },
  SHORT: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", icon: AlertTriangle },
  UNDERWEIGHT: { color: "text-red-300", bg: "bg-red-500/10 border-red-500/20", icon: TrendingDown },
};

interface Props {
  signal: string | null;
  ticker: string;
  duration?: number | null;
}

export function DecisionCard({ signal, ticker, duration }: Props) {
  if (!signal) return null;

  const config = signalConfig[signal] || signalConfig.HOLD;
  const Icon = config.icon;

  return (
    <Card className={`${config.bg} border-2`}>
      <CardContent className="p-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-full ${config.bg}`}>
            <Icon className={`h-8 w-8 ${config.color}`} />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Final Decision for {ticker}</p>
            <p className={`text-3xl font-bold ${config.color}`}>{signal}</p>
          </div>
        </div>
        {duration && (
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Analysis Duration</p>
            <p className="text-lg font-sans">{Math.round(duration)}s</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
