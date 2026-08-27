"use client";

import { useEffect, useState } from "react";
import { getAnalysisHistory, getMemoryStats } from "@/lib/api";
import type { AnalysisHistoryItem } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Brain, DollarSign, Clock, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { PnLDialog } from "@/components/history/PnLDialog";

const signalColors: Record<string, string> = {
  BUY: "bg-green-500/20 text-green-400",
  "STRONG BUY": "bg-green-500/20 text-green-400",
  OVERWEIGHT: "bg-green-500/15 text-green-300",
  HOLD: "bg-yellow-500/20 text-yellow-400",
  SELL: "bg-red-500/20 text-red-400",
  SHORT: "bg-red-500/20 text-red-400",
  UNDERWEIGHT: "bg-red-500/15 text-red-300",
};

const pnlStatusColors: Record<string, string> = {
  win: "bg-green-500/20 text-green-700",
  loss: "bg-red-500/20 text-red-700",
  breakeven: "bg-yellow-500/20 text-yellow-700",
  open: "bg-blue-500/20 text-blue-700",
  pending: "bg-muted text-muted-foreground",
};

export default function HistoryPage() {
  const [analyses, setAnalyses] = useState<AnalysisHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ taskId: string; ticker: string; signal: string } | null>(null);
  const [memoryStats, setMemoryStats] = useState<any>(null);

  const load = () => {
    setLoading(true);
    Promise.all([getAnalysisHistory(100), getMemoryStats().catch(() => null)])
      .then(([history, mem]: any[]) => {
        setAnalyses(history);
        setMemoryStats(mem);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  // Summary stats
  const closedTrades = analyses.filter((a) => a.pnl_status === "win" || a.pnl_status === "loss" || a.pnl_status === "breakeven");
  const openTrades = analyses.filter((a) => a.pnl_status === "open");
  const untracked = analyses.filter((a) => !a.pnl_status || a.pnl_status === "pending");
  const wins = closedTrades.filter((a) => a.pnl_status === "win").length;
  const losses = closedTrades.filter((a) => a.pnl_status === "loss").length;
  const totalPnl = closedTrades.reduce((sum, a) => sum + (a.pnl_pct || 0), 0);
  const winRate = closedTrades.length > 0 ? Math.round((wins / closedTrades.length) * 100) : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">My Trades</h1>
          <p className="text-sm text-muted-foreground">Past analyses with P&L tracking and agent learning</p>
        </div>
        {memoryStats && memoryStats.total > 0 && (
          <Card className="border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20">
            <CardContent className="px-4 py-3 flex items-center gap-3">
              <Brain className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-xs text-blue-700 font-medium">Agent Memory</p>
                <p className="text-sm">
                  <span className="font-semibold">{memoryStats.total}</span> lessons learned from past trades
                </p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* P&L Summary */}
      {closedTrades.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Win Rate</p>
              <p className="text-xl font-bold">{winRate}%</p>
              <p className="text-xs text-muted-foreground">{wins}W / {losses}L</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Avg Return</p>
              <p className={`text-xl font-bold ${totalPnl / closedTrades.length >= 0 ? "text-green-600" : "text-red-600"}`}>
                {(totalPnl / closedTrades.length).toFixed(2)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Total P&L %</p>
              <p className={`text-xl font-bold ${totalPnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground">Closed Trades</p>
              <p className="text-xl font-bold">{closedTrades.length}</p>
              {openTrades.length > 0 && <p className="text-xs text-muted-foreground">{openTrades.length} open</p>}
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({analyses.length})</TabsTrigger>
          <TabsTrigger value="open">
            <Clock className="h-3 w-3 mr-1" /> Open ({openTrades.length})
          </TabsTrigger>
          <TabsTrigger value="closed">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Closed ({closedTrades.length})
          </TabsTrigger>
          <TabsTrigger value="untracked">Untracked ({untracked.length})</TabsTrigger>
        </TabsList>

        {[
          { key: "all", data: analyses, emptyMsg: "No analyses yet" },
          { key: "open", data: openTrades, emptyMsg: "No open trades. Enter a trade? Log it with just the entry price to mark it as open." },
          { key: "closed", data: closedTrades, emptyMsg: "No closed trades yet. Once you exit a trade, log the exit price." },
          { key: "untracked", data: untracked, emptyMsg: "All analyses are tracked!" },
        ].map((tab) => (
          <TabsContent key={tab.key} value={tab.key}>
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Ticker</TableHead>
                      <TableHead>Trade Date</TableHead>
                      <TableHead>Signal</TableHead>
                      <TableHead className="text-right">Entry</TableHead>
                      <TableHead className="text-right">Exit</TableHead>
                      <TableHead className="text-right">P&L</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead className="text-right">Duration</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : tab.data.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                          {tab.emptyMsg}
                          {tab.key === "all" && analyses.length === 0 && (
                            <> <Link href="/analysis" className="text-primary hover:underline">Run your first analysis</Link></>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : (
                      tab.data.map((a: any) => (
                        <TableRow key={a.task_id}>
                          <TableCell className="text-sm">
                            {a.created_at ? new Date(a.created_at).toLocaleDateString() : "-"}
                          </TableCell>
                          <TableCell className="font-medium">{a.ticker}</TableCell>
                          <TableCell className="text-sm">{a.trade_date}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={signalColors[a.signal] || ""}>
                              {a.signal}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {a.entry_price ? `Rs.${a.entry_price}` : "-"}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {a.exit_price ? `Rs.${a.exit_price}` : "-"}
                          </TableCell>
                          <TableCell className={`text-right text-sm ${
                            (a.pnl_pct || 0) >= 0 ? "text-green-600" : "text-red-600"
                          }`}>
                            {a.pnl_pct != null ? `${a.pnl_pct >= 0 ? "+" : ""}${a.pnl_pct}%` : "-"}
                          </TableCell>
                          <TableCell>
                            {a.pnl_status ? (
                              <Badge variant="outline" className={pnlStatusColors[a.pnl_status] || ""}>
                                {a.pnl_status}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {a.duration_seconds ? `${Math.round(a.duration_seconds)}s` : "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Link href={`/analysis/${a.task_id}`} className="text-xs text-primary hover:underline">
                                View
                              </Link>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 text-xs"
                                onClick={() => setDialog({ taskId: a.task_id, ticker: a.ticker, signal: a.signal })}
                              >
                                <DollarSign className="h-3 w-3 mr-1" />
                                {a.pnl_status === "open" ? "Close Trade" : a.pnl_status && a.pnl_status !== "pending" ? "Update" : "Log P&L"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {dialog && (
        <PnLDialog
          open={!!dialog}
          onClose={() => setDialog(null)}
          taskId={dialog.taskId}
          ticker={dialog.ticker}
          signal={dialog.signal}
          onSaved={load}
        />
      )}
    </div>
  );
}
