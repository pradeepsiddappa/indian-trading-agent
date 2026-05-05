"use client";

import { useEffect, useState } from "react";
import { getConcentrationSummary } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PieChart as PieIcon,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const riskColors: Record<string, { bg: string; border: string; text: string; icon: any }> = {
  HIGH: { bg: "bg-red-50", border: "border-red-300", text: "text-red-800", icon: AlertTriangle },
  MEDIUM: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800", icon: AlertTriangle },
  LOW: { bg: "bg-green-50", border: "border-green-200", text: "text-green-800", icon: CheckCircle2 },
  NONE: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", icon: CheckCircle2 },
};

const sectorColors: Record<string, string> = {
  IT: "bg-blue-500",
  Banks: "bg-purple-500",
  Pharma: "bg-pink-500",
  Auto: "bg-orange-500",
  FMCG: "bg-green-500",
  Metal: "bg-gray-600",
  Energy: "bg-red-500",
  Realty: "bg-yellow-500",
  Finance: "bg-indigo-500",
  Other: "bg-slate-400",
};

export function ConcentrationWidget() {
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    getConcentrationSummary()
      .then((data: any) => setSummary(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking sector concentration...
        </CardContent>
      </Card>
    );
  }

  if (!summary || summary.total_positions === 0) {
    return null;  // No open positions, hide widget
  }

  const style = riskColors[summary.risk_level] || riskColors.LOW;
  const Icon = style.icon;
  const sectors = Object.entries(summary.by_sector || {})
    .map(([name, data]: any) => ({ name, ...data }))
    .sort((a: any, b: any) => b.percent - a.percent);

  return (
    <Card className={`${style.border} ${style.bg}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white">
              <Icon className={`h-5 w-5 ${style.text}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Sector Concentration ({summary.total_positions} open)</p>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={`${style.text} border-current`}>
                  {summary.risk_level} risk
                </Badge>
                <span className="text-sm">{summary.risk_reason}</span>
              </div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Details
          </Button>
        </div>

        {/* Stacked bar showing sector breakdown */}
        <div className="mt-3 flex h-3 rounded-full overflow-hidden border bg-white/40">
          {sectors.map((s: any) => (
            <div
              key={s.name}
              className={`${sectorColors[s.name] || sectorColors.Other} transition-all`}
              style={{ width: `${(s.percent / summary.total_allocated_pct) * 100}%` }}
              title={`${s.name}: ${s.percent}% (${s.count} position${s.count !== 1 ? "s" : ""})`}
            />
          ))}
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-current/10 space-y-3">
            <div className="space-y-2">
              {sectors.map((s: any) => {
                const isConcentrated = summary.concentrated_sectors?.includes(s.name);
                return (
                  <div key={s.name} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded ${sectorColors[s.name] || sectorColors.Other}`} />
                        <span className="font-medium">{s.name}</span>
                        {isConcentrated && (
                          <Badge variant="outline" className="bg-red-100 text-red-700 border-red-300 text-xs">
                            OVER LIMIT
                          </Badge>
                        )}
                      </div>
                      <span className="font-semibold">
                        {s.count} position{s.count !== 1 ? "s" : ""} · {s.percent}%
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground pl-5">
                      {s.positions?.map((p: any) => p.ticker).join(", ")}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-current/10 text-xs">
              <div>
                <p className="text-muted-foreground">Max positions per sector</p>
                <p className="font-semibold">{summary.limits?.max_positions_per_sector}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Max % per sector</p>
                <p className="font-semibold">{summary.limits?.max_percent_per_sector}%</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground italic">
              The Recommendation Engine warns when a new pick would push your sector exposure too high. This protects against accidentally opening 5 trades in the same sector (a hidden concentrated bet).
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
