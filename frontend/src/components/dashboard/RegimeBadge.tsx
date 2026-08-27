"use client";

import { useEffect, useState } from "react";
import { getCurrentRegime } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Move, Zap, HelpCircle, Loader2 } from "lucide-react";
import { statusColors, splitStatusColor } from "@/lib/status-colors";

const styles: Record<string, { bg: string; text: string; border: string; icon: any; label: string; desc: string }> = {
  BULL: {
    ...splitStatusColor(statusColors.bullish),
    border: "border-green-300 dark:border-green-800",
    icon: TrendingUp,
    label: "BULL",
    desc: "Trend favors longs. Breakout signals reliable.",
  },
  BEAR: {
    ...splitStatusColor(statusColors.bearish),
    border: "border-red-300 dark:border-red-800",
    icon: TrendingDown,
    label: "BEAR",
    desc: "Trend favors shorts. Bounce signals fail more often.",
  },
  SIDEWAYS: {
    ...splitStatusColor(statusColors.amber),
    border: "border-amber-300 dark:border-amber-800",
    icon: Move,
    label: "SIDEWAYS",
    desc: "Range-bound. Mean-reversion works, breakouts fakeout.",
  },
  HIGH_VOL: {
    ...splitStatusColor(statusColors.purple),
    border: "border-purple-300 dark:border-purple-800",
    icon: Zap,
    label: "HIGH VOL",
    desc: "Extreme moves. Reduce size. Most signals less reliable.",
  },
  UNKNOWN: {
    ...splitStatusColor(statusColors.neutral),
    border: "border-gray-300 dark:border-border",
    icon: HelpCircle,
    label: "UNKNOWN",
    desc: "Insufficient data to classify.",
  },
};

export function RegimeBadge() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentRegime()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="border-muted">
        <CardContent className="p-3 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Classifying market regime...</span>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const style = styles[data.regime] || styles.UNKNOWN;
  const Icon = style.icon;

  return (
    <Card className={`${style.border} ${style.bg}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${style.bg} border ${style.border}`}>
            <Icon className={`h-5 w-5 ${style.text}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">Market Regime</span>
              <Badge variant="outline" className={`${style.bg} ${style.text} ${style.border}`}>
                {style.label}
              </Badge>
              {data.annualized_vol_pct != null && (
                <span className="text-xs text-muted-foreground">
                  Vol {data.annualized_vol_pct}% (baseline {data.vol_baseline_pct}%)
                </span>
              )}
            </div>
            <p className="text-sm mt-1">{style.desc}</p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate" title={data.reasoning}>
              {data.reasoning}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
