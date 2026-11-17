"use client";

import { useEffect, useState } from "react";
import { getAnalysisHistory } from "@/lib/api";
import type { AnalysisHistoryItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const signalColors: Record<string, string> = {
  BUY: "bg-green-500/20 text-green-400 border-green-500/30",
  "STRONG BUY": "bg-green-500/20 text-green-400 border-green-500/30",
  OVERWEIGHT: "bg-green-500/15 text-green-300 border-green-500/20",
  HOLD: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  SELL: "bg-red-500/20 text-red-400 border-red-500/30",
  SHORT: "bg-red-500/20 text-red-400 border-red-500/30",
  UNDERWEIGHT: "bg-red-500/15 text-red-300 border-red-500/20",
};

export function RecentAnalyses() {
  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>([]);

  useEffect(() => {
    getAnalysisHistory(5).then((data) => setAnalyses(data as AnalysisHistoryItem[])).catch(() => {});
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Recent Analyses</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {analyses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No analyses yet. <Link href="/analysis" className="text-primary hover:underline">Run your first analysis</Link>
          </p>
        ) : (
          analyses.map((a) => (
            <Link key={a.task_id} href={`/analysis/${a.task_id}`}>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                <div>
                  <span className="font-medium">{a.ticker}</span>
                  <span className="text-xs text-muted-foreground ml-2">{a.trade_date}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={signalColors[a.signal] || ""}>
                    {a.signal}
                  </Badge>
                  {a.duration_seconds && (
                    <span className="text-xs text-muted-foreground">
                      {Math.round(a.duration_seconds)}s
                    </span>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}
