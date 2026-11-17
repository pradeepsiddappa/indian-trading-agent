"use client";

import { useEffect, useState } from "react";
import { getMarketStatus } from "@/lib/api";
import type { MarketStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export function MarketOverview() {
  const [data, setData] = useState<MarketStatus | null>(null);

  useEffect(() => {
    getMarketStatus().then((d) => setData(d as MarketStatus)).catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="flex gap-4 p-4 bg-card rounded-lg border border-border animate-pulse">
        <div className="h-8 w-48 bg-muted rounded" />
        <div className="h-8 w-48 bg-muted rounded" />
      </div>
    );
  }

  const sessionColors: Record<string, string> = {
    open: "bg-green-500/20 text-green-400",
    pre_market: "bg-yellow-500/20 text-yellow-400",
    closing_hour: "bg-orange-500/20 text-orange-400",
    post_market: "bg-blue-500/20 text-blue-400",
    closed: "bg-red-500/20 text-red-400",
  };

  const formatChange = (change: number, pct: number) => {
    const color = change >= 0 ? "text-green-400" : "text-red-400";
    const arrow = change >= 0 ? "+" : "";
    return <span className={color}>{arrow}{change.toFixed(2)} ({arrow}{pct.toFixed(2)}%)</span>;
  };

  return (
    <div className="flex items-center gap-6 p-4 bg-card rounded-lg border border-border">
      <Badge className={sessionColors[data.session] || sessionColors.closed}>
        {data.session.replace("_", " ").toUpperCase()}
      </Badge>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">NIFTY 50</span>
        <span className="font-sans font-semibold">{data.nifty.price.toLocaleString()}</span>
        {formatChange(data.nifty.change, data.nifty.change_percent)}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">BANK NIFTY</span>
        <span className="font-sans font-semibold">{data.banknifty.price.toLocaleString()}</span>
        {formatChange(data.banknifty.change, data.banknifty.change_percent)}
      </div>
    </div>
  );
}
