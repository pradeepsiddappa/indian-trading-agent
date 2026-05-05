"use client";

import { useEffect, useState } from "react";
import { getDailyVerdict } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  AlertTriangle,
  ShieldX,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const verdictStyles: Record<string, {
  bg: string;
  border: string;
  text: string;
  icon: any;
  pillBg: string;
}> = {
  GREEN: {
    bg: "bg-gradient-to-br from-green-50 to-emerald-50",
    border: "border-green-300",
    text: "text-green-800",
    icon: TrendingUp,
    pillBg: "bg-green-600",
  },
  YELLOW: {
    bg: "bg-gradient-to-br from-yellow-50 to-amber-50",
    border: "border-yellow-300",
    text: "text-yellow-900",
    icon: AlertTriangle,
    pillBg: "bg-yellow-600",
  },
  RED: {
    bg: "bg-gradient-to-br from-red-50 to-rose-50",
    border: "border-red-300",
    text: "text-red-900",
    icon: ShieldX,
    pillBg: "bg-red-600",
  },
};

export function DailyVerdict() {
  const [verdict, setVerdict] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    getDailyVerdict()
      .then((data: any) => setVerdict(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="border-2">
        <CardContent className="p-6 flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Computing today&apos;s trading verdict...
        </CardContent>
      </Card>
    );
  }

  if (!verdict) {
    return null;
  }

  const style = verdictStyles[verdict.verdict] || verdictStyles.YELLOW;
  const Icon = style.icon;
  const sizePct = Math.round(verdict.recommended_position_size_pct * 100);

  return (
    <Card className={`border-2 ${style.border} ${style.bg} shadow-md`}>
      <CardContent className="p-5">
        {/* Top row — big verdict pill + title */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <div className={`${style.pillBg} text-white rounded-xl p-3 shadow`}>
              <Icon className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Today&apos;s Verdict</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-2xl font-bold ${style.text}`}>{verdict.label}</span>
                <Badge className={`${style.pillBg} text-white text-xs`}>{verdict.verdict}</Badge>
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Position Size</p>
            <p className={`text-2xl font-bold ${style.text}`}>{sizePct}%</p>
            <p className="text-xs text-muted-foreground">
              max {verdict.max_trades_today} trade{verdict.max_trades_today !== 1 ? "s" : ""} today
            </p>
          </div>
        </div>

        {/* Action — what to do */}
        <div className={`mt-4 p-3 rounded-lg bg-white/60 ${style.text}`}>
          <p className="font-medium leading-relaxed">{verdict.action}</p>
        </div>

        {/* Quick reasoning bullets */}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Caution flags */}
          {verdict.caution_flags?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-red-700 mb-1.5">CAUTION</p>
              <div className="space-y-1">
                {verdict.caution_flags.map((f: string, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-sm">
                    <XCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Favorable flags */}
          {verdict.favorable_flags?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-green-700 mb-1.5">FAVORABLE</p>
              <div className="space-y-1">
                {verdict.favorable_flags.map((f: string, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-sm">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                    <span>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Expand for details */}
        <Button
          size="sm"
          variant="ghost"
          className="mt-3 -ml-2"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
          {expanded ? "Hide details" : "Show how this was calculated"}
        </Button>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-current/10 space-y-3 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="p-2 rounded bg-white/40">
                <p className="text-xs text-muted-foreground">Min Conviction Required</p>
                <p className="font-semibold">{verdict.min_conviction_required}</p>
              </div>
              <div className="p-2 rounded bg-white/40">
                <p className="text-xs text-muted-foreground">Caution Flags</p>
                <p className="font-semibold">{verdict.caution_flags?.length || 0}</p>
              </div>
              <div className="p-2 rounded bg-white/40">
                <p className="text-xs text-muted-foreground">Favorable Flags</p>
                <p className="font-semibold">{verdict.favorable_flags?.length || 0}</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">DECISION RULE</p>
              <div className="text-xs text-muted-foreground space-y-1 leading-relaxed">
                <p>• <strong>2+ caution flags</strong> → STAND DOWN (skip the day)</p>
                <p>• <strong>1 caution flag</strong> → SELECTIVE (HIGH conviction only, smaller size)</p>
                <p>• <strong>1+ favorable, 0 caution</strong> → TRADE (full size)</p>
                <p>• <strong>2+ favorable, 0 caution</strong> → AGGRESSIVE (multiple setups)</p>
              </div>
            </div>

            <p className="text-xs text-muted-foreground italic">
              This synthesizes FII/DII flow, calendar events, sector concentration, and the count of HIGH-conviction setups into one decision.
              The goal: prevent forced trades on bad days, scale up on good days.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
