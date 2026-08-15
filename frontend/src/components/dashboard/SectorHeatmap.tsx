"use client";

import { useEffect, useState } from "react";
import { getSectorRotation } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, LayoutGrid, RefreshCw } from "lucide-react";
import { sectorHeatmapColor, splitStatusColor, statusColors } from "@/lib/status-colors";

interface Sector {
  sector: string;
  avg_return_pct: number;
  stocks_analyzed: number;
  top_stocks: string[];
  signal: string;
}

// Convert return % to a color intensity
function getSectorColor(returnPct: number) {
  return sectorHeatmapColor(returnPct);
}

export function SectorHeatmap() {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(3);

  const load = async (months: number = period) => {
    setLoading(true);
    try {
      const data: any = await getSectorRotation(months);
      setSectors(data.sectors || []);
    } catch {
      setSectors([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Sector Heatmap</h3>
            <span className="text-xs text-muted-foreground">({period}-month performance)</span>
          </div>
          <div className="flex gap-1">
            {[1, 3, 6].map((m) => (
              <Button
                key={m}
                size="sm"
                variant={period === m ? "default" : "outline"}
                className="h-6 px-2 text-xs"
                onClick={() => { setPeriod(m); load(m); }}
                disabled={loading}
              >
                {m}M
              </Button>
            ))}
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => load()} disabled={loading}>
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            </Button>
          </div>
        </div>

        {loading && sectors.length === 0 && (
          <div className="py-6 text-center">
            <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
            <p className="text-xs text-muted-foreground mt-2">Fetching sector data...</p>
          </div>
        )}

        {sectors.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {sectors.map((s) => {
              const colors = getSectorColor(s.avg_return_pct);
              return (
                <div
                  key={s.sector}
                  className={`p-3 rounded-lg border ${colors.bg} ${colors.text} ${colors.border} transition-all hover:scale-105 cursor-default`}
                  title={`${s.sector}: ${s.avg_return_pct >= 0 ? "+" : ""}${s.avg_return_pct}%\nTop stocks: ${s.top_stocks.join(", ")}`}
                >
                  <p className="font-semibold text-sm">{s.sector}</p>
                  <p className="text-lg font-bold">
                    {s.avg_return_pct >= 0 ? "+" : ""}{s.avg_return_pct.toFixed(1)}%
                  </p>
                  <p className="text-[10px] opacity-75 truncate">
                    {s.top_stocks.slice(0, 3).join(", ")}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {!loading && sectors.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Unable to load sector data. Try refreshing.
          </p>
        )}

        {sectors.length > 0 && (
          <div className="mt-3 pt-3 border-t flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-red-400"></div>
                <span>Weak</span>
              </div>
              <div className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded ${splitStatusColor(statusColors.bullish).bg} border ${splitStatusColor(statusColors.bullish).border}`}></div>
                <span>Flat</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-400"></div>
                <span>Strong</span>
              </div>
            </div>
            <span>Hover for details</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
