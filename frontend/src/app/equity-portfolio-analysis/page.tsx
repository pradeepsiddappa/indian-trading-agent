"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getEquityPortfolioReviewHistory,
  getKiteLoginUrl,
  getKiteStatus,
  getLatestEquityPortfolioReview,
  getPositions,
  getTelegramStatus,
  logoutKite,
  runEquityPortfolioReview,
  saveTelegramSettings,
  sendLatestEquityPortfolioReviewTelegram,
  sendTelegramTest,
  saveKiteCredentials,
} from "@/lib/api";
import { PositionsPanel } from "@/components/portfolio/PositionsPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  LogOut,
  PieChart,
  ShieldCheck,
  Send,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { statusColors } from "@/lib/status-colors";
import { HelpSection } from "@/components/HelpSection";

const equityHelp = [
  {
    question: "How do I get holdings into the review?",
    answer: "Connect Kite and use Sync from Kite, or add a position manually. Sync is explicit and read-only; manual rows are preserved when Kite is synchronized.",
  },
  {
    question: "What does Run Review do?",
    answer: "It reviews the positions stored locally, calculates P&L, sector allocation, concentration warnings, and action flags, then saves a dated snapshot. It never places orders.",
  },
  {
    question: "Why is Kite login required each day?",
    answer: "Kite access tokens are treated as daily sessions. The app stores only the current token metadata needed for the read-only holdings fetch and asks you to reconnect when the token expires.",
  },
];

type KiteStatus = {
  configured: boolean;
  connected_today: boolean;
  token_date?: string | null;
  masked_api_key?: string | null;
  profile?: {
    user_shortname?: string;
    user_name?: string;
  } | null;
};

type TelegramStatus = {
  configured: boolean;
  enabled: boolean;
  masked_bot_token?: string | null;
  masked_chat_id?: string | null;
};

type Holding = {
  tradingsymbol: string;
  exchange?: string;
  sector?: string;
  quantity?: number;
  average_price?: number;
  last_price?: number;
  current_value?: number;
  pnl?: number;
  pnl_pct?: number;
  allocation_pct?: number;
  action?: string;
  reasons?: string[];
};

type SectorAllocation = {
  sector: string;
  value: number;
  allocation_pct: number;
  holdings: string[];
};

type Review = {
  review_id: string;
  review_date: string;
  holdings: Holding[];
  summary: {
    total_holdings?: number;
    total_invested?: number;
    total_current?: number;
    total_pnl?: number;
    total_pnl_pct?: number;
    total_day_pnl?: number;
    day_pnl_pct?: number;
    sector_allocation?: SectorAllocation[];
    top_winners?: Holding[];
    top_losers?: Holding[];
  };
  insights: {
    portfolio_status?: string;
    plain_summary?: string;
    high_risk_holdings?: Array<{
      tradingsymbol: string;
      action: string;
      pnl_pct?: number;
      allocation_pct?: number;
      reasons?: string[];
    }>;
    concentration_warnings?: string[];
  };
};

type LatestReviewResponse = {
  found: boolean;
  review: Review | null;
};

type ReviewHistoryResponse = {
  reviews: Review[];
};

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

const actionStyles: Record<string, string> = {
  HOLD: statusColors.bullish,
  WATCH: statusColors.info,
  REVIEW: statusColors.caution,
  TRIM_CONSIDER: statusColors.orange,
  EXIT_REVIEW: statusColors.bearish,
};

function money(value: number | null | undefined) {
  const n = Number(value || 0);
  return `Rs.${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function pct(value: number | null | undefined) {
  const n = Number(value || 0);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function pnlClass(value: number | null | undefined) {
  return Number(value || 0) >= 0 ? "text-green-600 dark:text-green-300" : "text-red-600 dark:text-red-300";
}

function SummaryCards({ review }: { review: Review }) {
  const summary = review?.summary || {};
  const insights = review?.insights || {};
  return (
    <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Current Value</p>
          <p className="text-2xl font-bold">{money(summary.total_current)}</p>
          <p className="text-xs text-muted-foreground">{summary.total_holdings || 0} holdings</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Invested</p>
          <p className="text-2xl font-bold">{money(summary.total_invested)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Unrealized P&L</p>
          <p className={`text-2xl font-bold ${pnlClass(summary.total_pnl)}`}>{money(summary.total_pnl)}</p>
          <p className={`text-xs ${pnlClass(summary.total_pnl_pct)}`}>{pct(summary.total_pnl_pct)}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Day P&L</p>
          <p className={`text-2xl font-bold ${pnlClass(summary.total_day_pnl)}`}>{money(summary.total_day_pnl)}</p>
          <p className={`text-xs ${pnlClass(summary.day_pnl_pct)}`}>{pct(summary.day_pnl_pct)}</p>
        </CardContent>
      </Card>
      <Card className={insights.portfolio_status === "REVIEW_NEEDED" ? "border-yellow-200 dark:border-yellow-800" : ""}>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="text-lg font-semibold">{insights.portfolio_status || "NO REVIEW"}</p>
          <p className="text-xs text-muted-foreground">{review?.review_date || "-"}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticker</TableHead>
              <TableHead>Sector</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Avg</TableHead>
              <TableHead className="text-right">LTP</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">Alloc</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {holdings.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                  No equity holdings found.
                </TableCell>
              </TableRow>
            ) : (
              holdings.map((h) => (
                <TableRow key={`${h.exchange}-${h.tradingsymbol}`}>
                  <TableCell className="font-medium">{h.tradingsymbol}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{h.sector || "Other"}</TableCell>
                  <TableCell className="text-right">{h.quantity}</TableCell>
                  <TableCell className="text-right">{money(h.average_price)}</TableCell>
                  <TableCell className="text-right">{money(h.last_price)}</TableCell>
                  <TableCell className="text-right">{money(h.current_value)}</TableCell>
                  <TableCell className="text-right">{Number(h.allocation_pct || 0).toFixed(1)}%</TableCell>
                  <TableCell className={`text-right ${pnlClass(h.pnl)}`}>
                    {money(h.pnl)}
                    <div className="text-[10px]">{pct(h.pnl_pct)}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={actionStyles[h.action || "WATCH"] || statusColors.neutral}>
                      {h.action || "WATCH"}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs text-xs text-muted-foreground">
                    {(h.reasons || []).join(" ")}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RiskPanel({ review }: { review: Review }) {
  const insights = review?.insights || {};
  const risks = insights.high_risk_holdings || [];
  const warnings = insights.concentration_warnings || [];
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Review Flags
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {risks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No urgent holding-level review flags.</p>
          ) : (
            risks.map((r) => (
              <div key={r.tradingsymbol} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{r.tradingsymbol}</p>
                  <Badge variant="outline" className={actionStyles[r.action] || statusColors.neutral}>{r.action}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{(r.reasons || []).join(" ")}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-4 w-4" /> Concentration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {warnings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No concentration warnings.</p>
          ) : (
            warnings.map((w: string) => (
              <div key={w} className="rounded-lg border border-yellow-200 bg-yellow-50/40 p-3 text-sm dark:border-yellow-800 dark:bg-yellow-950/20">
                {w}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EquityPortfolioAnalysisContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<KiteStatus | null>(null);
  const [latest, setLatest] = useState<LatestReviewResponse | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [history, setHistory] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [positionCount, setPositionCount] = useState(0);

  const latestReview = latest?.review || null;

  const load = async () => {
    setLoading(true);
    try {
      const [kiteStatus, telegramStatusRes, latestReviewRes, historyRes, positionsRes] = await Promise.all([
        getKiteStatus() as Promise<KiteStatus>,
        getTelegramStatus().catch(() => null),
        getLatestEquityPortfolioReview().catch(() => ({ found: false, review: null })),
        getEquityPortfolioReviewHistory(30).catch(() => ({ reviews: [] })),
        getPositions().catch(() => ({ count: 0 })),
      ]);
      setStatus(kiteStatus);
      setTelegramStatus(telegramStatusRes as TelegramStatus | null);
      setLatest(latestReviewRes as LatestReviewResponse);
      setHistory((historyRes as ReviewHistoryResponse).reviews || []);
      setPositionCount(Number((positionsRes as { count?: number }).count || 0));
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to load equity portfolio analysis"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const kite = searchParams.get("kite");
    const message = searchParams.get("message");
    if (kite === "connected") toast.success("Kite connected for today");
    if (kite === "error") toast.error(message || "Kite login failed");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveCredentials = async () => {
    setSaving(true);
    try {
      const result = await saveKiteCredentials({ api_key: apiKey, api_secret: apiSecret }) as KiteStatus;
      setStatus(result);
      setApiKey("");
      setApiSecret("");
      toast.success("Kite credentials saved");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to save Kite credentials"));
    } finally {
      setSaving(false);
    }
  };

  const connectKite = async () => {
    try {
      const result = await getKiteLoginUrl() as { login_url: string };
      window.location.href = result.login_url;
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to create Kite login URL"));
    }
  };

  const runReview = async () => {
    setRunning(true);
    try {
      const review = await runEquityPortfolioReview() as Review;
      setLatest({ found: true, review });
      await load();
      toast.success("Equity portfolio review saved");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to run portfolio review"));
      load();
    } finally {
      setRunning(false);
    }
  };

  const disconnect = async () => {
    try {
      const result = await logoutKite() as { kite: KiteStatus };
      setStatus(result.kite);
      toast.success("Kite session cleared");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to clear Kite session"));
    }
  };

  const saveTelegram = async () => {
    setSavingTelegram(true);
    try {
      const result = await saveTelegramSettings({ bot_token: botToken, chat_id: chatId, enabled: true }) as TelegramStatus;
      setTelegramStatus(result);
      setBotToken("");
      setChatId("");
      toast.success("Telegram settings saved");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to save Telegram settings"));
    } finally {
      setSavingTelegram(false);
    }
  };

  const testTelegram = async () => {
    setSendingTelegram(true);
    try {
      await sendTelegramTest("Trading Agent Telegram notifications are connected.");
      toast.success("Telegram test sent");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to send Telegram test"));
    } finally {
      setSendingTelegram(false);
    }
  };

  const sendLatestReview = async () => {
    setSendingTelegram(true);
    try {
      await sendLatestEquityPortfolioReviewTelegram();
      toast.success("Portfolio review sent to Telegram");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to send review to Telegram"));
    } finally {
      setSendingTelegram(false);
    }
  };

  const visibleHoldings = useMemo(() => {
    return latestReview?.holdings || [];
  }, [latestReview]);
  const topWinners = latestReview?.summary?.top_winners || [];
  const topLosers = latestReview?.summary?.top_losers || [];

  if (loading) {
    return (
      <div className="p-6">
        <div className="py-20 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground mt-3">Loading Kite portfolio state...</p>
        </div>
      </div>
    );
}

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wallet className="h-6 w-6" /> Equity portfolio analysis
          </h1>
          <p className="text-sm text-muted-foreground">Read-only Kite holdings review with stored daily insights</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={runReview} disabled={running || positionCount === 0}>
            {running ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
            Run Review
          </Button>
          {status?.connected_today && (
              <Button variant="ghost" size="sm" onClick={disconnect}>
                <LogOut className="h-3 w-3 mr-1" /> Clear Session
              </Button>
          )}
        </div>
      </div>

      {!status?.connected_today && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {status?.configured ? "Update Kite Credentials" : "Kite Credentials"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-w-xl">
            <Input placeholder="KITE_API_KEY" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            <Input
              placeholder="KITE_API_SECRET"
              type="password"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
            />
            <Button onClick={saveCredentials} disabled={saving || !apiKey || !apiSecret}>
              {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              {status?.configured ? "Update Credentials" : "Save Credentials"}
            </Button>
          </CardContent>
        </Card>
      )}

      {status?.configured && !status?.connected_today && (
        <Card className="border-blue-100 dark:border-blue-800">
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium">Kite login required for today</p>
              <p className="text-sm text-muted-foreground">
                API key {status.masked_api_key || "saved"} is configured. Complete Kite login to fetch holdings.
              </p>
            </div>
            <Button onClick={connectKite}>
              <ExternalLink className="h-3 w-3 mr-1" /> Connect Kite for Today
            </Button>
          </CardContent>
        </Card>
      )}

      {status?.connected_today && (
        <Card className="border-green-100 dark:border-green-800">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <div>
                <p className="text-sm font-medium">Kite connected for today</p>
                <p className="text-xs text-muted-foreground">
                  {status.profile?.user_shortname || status.profile?.user_name || "Zerodha account"} · token date {status.token_date}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <PositionsPanel
        kiteConnected={!!status?.connected_today}
        onPositionCountChange={setPositionCount}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="h-4 w-4" /> Telegram notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">
                {telegramStatus?.configured ? "Telegram is configured" : "Telegram is not configured"}
              </p>
              <p className="text-xs text-muted-foreground">
                {telegramStatus?.configured
                  ? `Bot ${telegramStatus.masked_bot_token || "saved"} · Chat ${telegramStatus.masked_chat_id || "saved"}`
                  : "Save your bot token and chat ID to send portfolio reviews."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={testTelegram}
                disabled={!telegramStatus?.configured || sendingTelegram}
              >
                {sendingTelegram ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                Test
              </Button>
              <Button
                size="sm"
                onClick={sendLatestReview}
                disabled={!telegramStatus?.configured || !latestReview || sendingTelegram}
              >
                {sendingTelegram ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                Send Latest Review
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-[1fr_1fr_auto] gap-3 max-w-4xl">
            <Input
              placeholder={telegramStatus?.configured ? "New bot token (optional update)" : "TELEGRAM_BOT_TOKEN"}
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
            />
            <Input
              placeholder={telegramStatus?.configured ? "New chat ID (optional update)" : "TELEGRAM_CHAT_ID"}
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
            />
            <Button onClick={saveTelegram} disabled={savingTelegram || !botToken || !chatId}>
              {savingTelegram ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              {telegramStatus?.configured ? "Update" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {latestReview ? (
        <>
          <SummaryCards review={latestReview} />
          <Card>
            <CardContent className="p-4">
              <p className="text-sm">{latestReview.insights?.plain_summary}</p>
            </CardContent>
          </Card>

          <Tabs defaultValue="holdings">
            <TabsList>
              <TabsTrigger value="holdings">Holdings ({visibleHoldings.length})</TabsTrigger>
              <TabsTrigger value="risk">Risk</TabsTrigger>
              <TabsTrigger value="sectors">Sectors</TabsTrigger>
              <TabsTrigger value="history">History ({history.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="holdings">
              <HoldingsTable holdings={visibleHoldings} />
            </TabsContent>
            <TabsContent value="risk">
              <RiskPanel review={latestReview} />
            </TabsContent>
            <TabsContent value="sectors">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sector</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">Allocation</TableHead>
                        <TableHead>Holdings</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(latestReview.summary?.sector_allocation || []).map((s) => (
                        <TableRow key={s.sector}>
                          <TableCell className="font-medium">{s.sector}</TableCell>
                          <TableCell className="text-right">{money(s.value)}</TableCell>
                          <TableCell className="text-right">{Number(s.allocation_pct || 0).toFixed(1)}%</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{(s.holdings || []).join(", ")}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="history">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Value</TableHead>
                        <TableHead className="text-right">P&L</TableHead>
                        <TableHead className="text-right">Review Flags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((r) => (
                        <TableRow key={r.review_id}>
                          <TableCell>{r.review_date}</TableCell>
                          <TableCell>{r.insights?.portfolio_status || "-"}</TableCell>
                          <TableCell className="text-right">{money(r.summary?.total_current)}</TableCell>
                          <TableCell className={`text-right ${pnlClass(r.summary?.total_pnl)}`}>
                            {pct(r.summary?.total_pnl_pct)}
                          </TableCell>
                          <TableCell className="text-right">
                            {(r.insights?.high_risk_holdings || []).length}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <Card>
          <CardContent className="p-8 text-center">
            <PieChart className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium">No equity portfolio review saved yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Connect Kite or add positions manually, then run your first holdings review.
            </p>
            <Button className="mt-4" onClick={runReview} disabled={running || positionCount === 0}>
              {running ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              Run Review
            </Button>
          </CardContent>
        </Card>
      )}

      {topWinners.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Top Winners
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topWinners.map((h) => (
                <div key={h.tradingsymbol} className="flex justify-between text-sm">
                  <span>{h.tradingsymbol}</span>
                  <span className={pnlClass(h.pnl_pct)}>{pct(h.pnl_pct)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingDown className="h-4 w-4" /> Top Losers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {topLosers.map((h) => (
                <div key={h.tradingsymbol} className="flex justify-between text-sm">
                  <span>{h.tradingsymbol}</span>
                  <span className={pnlClass(h.pnl_pct)}>{pct(h.pnl_pct)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      <HelpSection title="How to Use Equity Portfolio Analysis" items={equityHelp} />
    </div>
  );
}

export default function EquityPortfolioAnalysisPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <div className="py-20 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground mt-3">Loading Kite portfolio state...</p>
          </div>
        </div>
      }
    >
      <EquityPortfolioAnalysisContent />
    </Suspense>
  );
}
