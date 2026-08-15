"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Activity, Coins, Cpu, Zap } from "lucide-react";

interface Stats {
  llm_calls: number;
  tool_calls: number;
  tokens_in: number;
  tokens_out: number;
  total_tokens: number;
  cost_usd: number;
  cost_inr: number;
  per_model?: Record<string, { input: number; output: number }>;
}

export function StatsCard({ stats, duration }: { stats: Stats; duration?: number | null }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4" /> Analysis Stats
          </h3>
          {duration && (
            <span className="text-xs text-muted-foreground">
              {Math.round(duration)}s total
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Cpu className="h-3 w-3" /> LLM Calls
            </div>
            <p className="text-lg font-semibold">{stats.llm_calls}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Zap className="h-3 w-3" /> Tool Calls
            </div>
            <p className="text-lg font-semibold">{stats.tool_calls}</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              Tokens
            </div>
            <p className="text-lg font-semibold">{(stats.total_tokens / 1000).toFixed(1)}K</p>
            <p className="text-[10px] text-muted-foreground">
              {(stats.tokens_in / 1000).toFixed(1)}K in / {(stats.tokens_out / 1000).toFixed(1)}K out
            </p>
          </div>
          <div className="p-3 rounded-lg bg-green-50 border border-green-100 dark:bg-green-950/40 dark:border-green-800">
            <div className="flex items-center gap-1 text-xs text-green-700 mb-1">
              <Coins className="h-3 w-3" /> Cost
            </div>
            <p className="text-lg font-semibold text-green-800">Rs.{stats.cost_inr}</p>
            <p className="text-[10px] text-green-600">${stats.cost_usd.toFixed(4)} USD</p>
          </div>
        </div>

        {stats.per_model && Object.keys(stats.per_model).length > 0 && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">By Model:</p>
            <div className="space-y-1">
              {Object.entries(stats.per_model).map(([model, tokens]) => (
                <div key={model} className="flex items-center justify-between text-xs">
                  <span className="font-mono truncate flex-1">{model}</span>
                  <span className="text-muted-foreground ml-2">
                    {((tokens.input + tokens.output) / 1000).toFixed(1)}K tokens
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
