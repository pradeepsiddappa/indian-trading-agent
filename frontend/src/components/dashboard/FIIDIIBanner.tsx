"use client";

import { useEffect, useState } from "react";
import { getFiiDiiBias, getFiiDiiToday } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Loader2,
  Building2,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const biasColors: Record<string, { bg: string; border: string; text: string; icon: any }> = {
  BULLISH: { bg: "bg-green-50", border: "border-green-200", text: "text-green-800", icon: TrendingUp },
  BEARISH: { bg: "bg-red-50", border: "border-red-200", text: "text-red-800", icon: TrendingDown },
  MIXED: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800", icon: Minus },
  NEUTRAL: { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-700", icon: Minus },
};

function formatCr(value: number | null | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  const sign = value >= 0 ? "+" : "-";
  return `${sign}Rs.${abs.toLocaleString("en-IN", { maximumFractionDigits: 0 })} Cr`;
}

export function FIIDIIBanner() {
  const [bias, setBias] = useState<any>(null);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [biasRes, dataRes]: any[] = await Promise.all([
        getFiiDiiBias().catch(() => null),
        getFiiDiiToday().catch(() => null),
      ]);
      setBias(biasRes);
      setData(dataRes);
    } catch {}
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await getFiiDiiToday(true);
      await load();
    } catch {}
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading FII/DII flow...
        </CardContent>
      </Card>
    );
  }

  if (!bias || !bias.today_fii_net) {
    return (
      <Card className="border-yellow-200 bg-yellow-50/30">
        <CardContent className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <AlertCircle className="h-4 w-4 text-yellow-700" />
            <span className="text-yellow-800">FII/DII data unavailable. NSE may be blocking requests right now.</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleRefresh} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const style = biasColors[bias.bias] || biasColors.NEUTRAL;
  const Icon = style.icon;

  const fiiToday = bias.today_fii_net;
  const diiToday = bias.today_dii_net;

  return (
    <Card className={`${style.border} ${style.bg}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white">
              <Building2 className={`h-5 w-5 ${style.text}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Institutional Flow ({bias.data_date})</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">FII: <span className={fiiToday >= 0 ? "text-green-700" : "text-red-700"}>{formatCr(fiiToday)}</span></span>
                <span className="font-semibold text-sm">DII: <span className={diiToday >= 0 ? "text-green-700" : "text-red-700"}>{formatCr(diiToday)}</span></span>
                <Badge variant="outline" className={`${style.text} border-current`}>
                  <Icon className="h-3 w-3 mr-1" />
                  {bias.bias} ({bias.confidence})
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              Why
            </Button>
            <Button size="sm" variant="ghost" onClick={handleRefresh} disabled={refreshing} title="Refresh from NSE">
              {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-current/10 space-y-2 text-sm">
            <p className={style.text}>{bias.reasoning}</p>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div className="p-2 rounded bg-white/60">
                <p className="text-xs text-muted-foreground">Today's FII Net</p>
                <p className={`font-semibold ${fiiToday >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {formatCr(fiiToday)}
                </p>
                <p className="text-xs text-muted-foreground">5-day: {formatCr(bias.fii_5d_net)}</p>
              </div>
              <div className="p-2 rounded bg-white/60">
                <p className="text-xs text-muted-foreground">Today's DII Net</p>
                <p className={`font-semibold ${diiToday >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {formatCr(diiToday)}
                </p>
                <p className="text-xs text-muted-foreground">5-day: {formatCr(bias.dii_5d_net)}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground italic">
              The Recommendation Engine adjusts all stock scores by{" "}
              <span className="font-mono">{bias.score_adjustment >= 0 ? "+" : ""}{bias.score_adjustment}</span> points based on this bias.
              {bias.bias === "BEARISH" && " Be selective on long positions today."}
              {bias.bias === "BULLISH" && " Tailwind for long positions today."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
