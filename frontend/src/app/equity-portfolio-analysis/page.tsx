"use client";

import React, { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  getEquityPortfolioReviewHistory,
  getKiteLoginUrl,
  getKiteStatus,
  getLatestEquityPortfolioReview,
  getPositions,
  getTelegramStatus,
  getUpstoxLoginUrl,
  getUpstoxStatus,
  logoutKite,
  logoutUpstox,
  runEquityPortfolioReview,
  saveKiteCredentials,
  saveTelegramSettings,
  saveUpstoxCredentials,
  getKotakNeoStatus,
  saveKotakNeoCredentials,
  loginKotakNeo,
  logoutKotakNeo,
  syncKotakNeoPositions,
  sendLatestEquityPortfolioReviewTelegram,
  sendTelegramTest,
  getMarketDataVendorStatus,
  saveMarketDataVendorSetting,
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
import { BrokerLogo } from "@/components/brokers/BrokerLogos";

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

type KotakNeoStatus = {
  configured: boolean;
  connected_today: boolean;
  masked_consumer_key?: string | null;
  mobile_number?: string | null;
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

type MarketDataVendorStatus = {
  configured_vendor: string;
  resolved_vendor: string;
  resolved_label: string;
  is_fallback: boolean;
  active_sessions: Record<string, boolean>;
  options: Array<{ value: string; label: string }>;
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
  const [upstoxStatus, setUpstoxStatus] = useState<KiteStatus | null>(null);
  const [kotakNeoStatus, setKotakNeoStatus] = useState<KotakNeoStatus | null>(null);
  const [latest, setLatest] = useState<LatestReviewResponse | null>(null);
  const [telegramStatus, setTelegramStatus] = useState<TelegramStatus | null>(null);
  const [history, setHistory] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingUpstox, setSavingUpstox] = useState(false);
  const [savingKotak, setSavingKotak] = useState(false);
  const [loggingInKotak, setLoggingInKotak] = useState(false);
  const [running, setRunning] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [upstoxApiKey, setUpstoxApiKey] = useState("");
  const [upstoxApiSecret, setUpstoxApiSecret] = useState("");
  const [kotakConsumerKey, setKotakConsumerKey] = useState("");
  const [kotakConsumerSecret, setKotakConsumerSecret] = useState("");
  const [kotakMobileNumber, setKotakMobileNumber] = useState("");
  const [kotakPanDob, setKotakPanDob] = useState("");
  const [kotakMpinPassword, setKotakMpinPassword] = useState("");
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [savingTelegram, setSavingTelegram] = useState(false);
  const [sendingTelegram, setSendingTelegram] = useState(false);
  const [positionCount, setPositionCount] = useState(0);

  const [activeBrokers, setActiveBrokers] = useState<string[]>(["kite", "upstox", "kotak_neo"]);
  const [activeBrokerTab, setActiveBrokerTab] = useState<string>("kite");

  const [vendorStatus, setVendorStatus] = useState<MarketDataVendorStatus | null>(null);
  const [updatingVendor, setUpdatingVendor] = useState(false);

  const latestReview = latest?.review || null;

  const load = async () => {
    setLoading(true);
    try {
      const [kiteStatus, upstoxStatusRes, kotakStatusRes, telegramStatusRes, vendorStatusRes, latestReviewRes, historyRes, positionsRes] = await Promise.all([
        getKiteStatus() as Promise<KiteStatus>,
        getUpstoxStatus().catch(() => null) as Promise<KiteStatus | null>,
        getKotakNeoStatus().catch(() => null) as Promise<KotakNeoStatus | null>,
        getTelegramStatus().catch(() => null),
        getMarketDataVendorStatus().catch(() => null) as Promise<MarketDataVendorStatus | null>,
        getLatestEquityPortfolioReview().catch(() => ({ found: false, review: null })),
        getEquityPortfolioReviewHistory(30).catch(() => ({ reviews: [] })),
        getPositions().catch(() => ({ count: 0 })),
      ]);
      setStatus(kiteStatus);
      setUpstoxStatus(upstoxStatusRes);
      setKotakNeoStatus(kotakStatusRes);
      setTelegramStatus(telegramStatusRes as TelegramStatus | null);
      setVendorStatus(vendorStatusRes);
      setLatest(latestReviewRes as LatestReviewResponse);
      setHistory((historyRes as ReviewHistoryResponse).reviews || []);
      setPositionCount(Number((positionsRes as { count?: number }).count || 0));
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to load equity portfolio analysis"));
    } finally {
      setLoading(false);
    }
  };

  const handleVendorChange = async (newVendor: string) => {
    setUpdatingVendor(true);
    try {
      const updated = (await saveMarketDataVendorSetting(newVendor)) as MarketDataVendorStatus;
      setVendorStatus(updated);
      toast.success(`Market data provider set to ${updated.resolved_label}`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to update market data provider setting"));
    } finally {
      setUpdatingVendor(false);
    }
  };

  useEffect(() => {
    const kite = searchParams.get("kite");
    const upstox = searchParams.get("upstox");
    const message = searchParams.get("message");
    if (kite === "connected") toast.success("Kite connected for today");
    if (kite === "error") toast.error(message || "Kite login failed");
    if (upstox === "connected") toast.success("Upstox connected for today");
    if (upstox === "error") toast.error(message || "Upstox login failed");
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

  const saveUpstoxCreds = async () => {
    setSavingUpstox(true);
    try {
      const result = await saveUpstoxCredentials({ api_key: upstoxApiKey, api_secret: upstoxApiSecret }) as KiteStatus;
      setUpstoxStatus(result);
      setUpstoxApiKey("");
      setUpstoxApiSecret("");
      toast.success("Upstox credentials saved");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to save Upstox credentials"));
    } finally {
      setSavingUpstox(false);
    }
  };

  const saveKotakCreds = async () => {
    setSavingKotak(true);
    try {
      const res = (await saveKotakNeoCredentials({
        consumer_key: kotakConsumerKey,
        consumer_secret: kotakConsumerSecret,
        mobile_number: kotakMobileNumber,
        pan_or_dob: kotakPanDob || undefined,
      })) as KotakNeoStatus;
      setKotakNeoStatus(res);
      setKotakConsumerKey("");
      setKotakConsumerSecret("");
      toast.success("Kotak Neo credentials saved");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to save Kotak Neo credentials"));
    } finally {
      setSavingKotak(false);
    }
  };

  const loginKotakSession = async () => {
    setLoggingInKotak(true);
    try {
      const res = (await loginKotakNeo({ mpin_or_password: kotakMpinPassword })) as {
        connected: boolean;
        kotak_neo: KotakNeoStatus;
      };
      setKotakNeoStatus(res.kotak_neo);
      setKotakMpinPassword("");
      toast.success("Logged in to Kotak Neo for today");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Kotak Neo session login failed"));
    } finally {
      setLoggingInKotak(false);
    }
  };

  const disconnectKotakNeo = async () => {
    try {
      const res = (await logoutKotakNeo()) as { kotak_neo: KotakNeoStatus };
      setKotakNeoStatus(res.kotak_neo);
      toast.success("Kotak Neo session cleared");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to clear Kotak Neo session"));
    }
  };

  const handleAddBroker = (brokerKey: string) => {
    if (!activeBrokers.includes(brokerKey)) {
      setActiveBrokers((prev: string[]) => [...prev, brokerKey]);
    }
    setActiveBrokerTab(brokerKey);
    toast.success("Broker added to tab bar");
  };

  const connectKite = async () => {
    try {
      const result = await getKiteLoginUrl() as { login_url: string };
      window.location.href = result.login_url;
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to create Kite login URL"));
    }
  };

  const connectUpstox = async () => {
    try {
      const result = await getUpstoxLoginUrl() as { login_url: string };
      window.location.href = result.login_url;
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to create Upstox login URL"));
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

  const disconnectUpstox = async () => {
    try {
      const result = await logoutUpstox() as { upstox: KiteStatus };
      setUpstoxStatus(result.upstox);
      toast.success("Upstox session cleared");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to clear Upstox session"));
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
          <p className="text-sm text-muted-foreground mt-3">Loading portfolio state...</p>
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
          <p className="text-sm text-muted-foreground">Read-only Kite & Upstox holdings review with stored daily insights</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={runReview} disabled={running || positionCount === 0}>
            {running ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3 w-3 mr-1" />}
            Run Review
          </Button>
          {status?.connected_today && (
            <Button variant="ghost" size="sm" onClick={disconnect}>
              <LogOut className="h-3 w-3 mr-1" /> Clear Kite Session
            </Button>
          )}
          {upstoxStatus?.connected_today && (
            <Button variant="ghost" size="sm" onClick={disconnectUpstox}>
              <LogOut className="h-3 w-3 mr-1" /> Clear Upstox Session
            </Button>
          )}
        </div>
      </div>

      {/* Market Data Source Provider Selector Card */}
      <Card className="border-blue-500/20 bg-blue-50/10 dark:bg-blue-950/10">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <PieChart className="h-4 w-4 text-blue-500" /> Market Data Source
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Select live quote & market data provider: Yahoo Finance (yfinance) or active broker API (Zerodha Kite, Upstox, Kotak Neo)
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                variant="outline"
                className={
                  vendorStatus?.is_fallback
                    ? statusColors.caution
                    : vendorStatus?.resolved_vendor !== "yfinance"
                    ? statusColors.bullish
                    : statusColors.info
                }
              >
                Active Data: {vendorStatus?.resolved_label || "Yahoo Finance"}
              </Badge>

              <div className="flex items-center gap-2 bg-background p-1.5 rounded-md border text-xs shadow-xs">
                <span className="text-[11px] font-medium text-muted-foreground pl-1">Provider:</span>
                {updatingVendor ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <select
                    className="rounded border-none bg-transparent px-2 py-0.5 text-xs font-medium focus:outline-none cursor-pointer"
                    value={vendorStatus?.configured_vendor || "auto"}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleVendorChange(e.target.value)}
                  >
                    {(vendorStatus?.options || [
                      { value: "auto", label: "Auto-Detect Active Broker (Recommended)" },
                      { value: "yfinance", label: "Yahoo Finance (yfinance)" },
                      { value: "kite", label: "Zerodha Kite Connect" },
                      { value: "upstox", label: "Upstox API v2" },
                      { value: "kotak_neo", label: "Kotak Neo API" },
                    ]).map((opt: { value: string; label: string }) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Multi-Broker Connections Hub */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" /> Broker Connectors
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Connect your Indian broker accounts for read-only equity holdings sync
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant="outline" className={`flex items-center gap-1.5 ${status?.connected_today ? statusColors.bullish : status?.configured ? statusColors.info : statusColors.neutral}`}>
                  <BrokerLogo brokerKey="kite" className="h-3.5 w-3.5" />
                  Kite: {status?.connected_today ? "Connected" : status?.configured ? "Configured" : "Not Set"}
                </Badge>
                <Badge variant="outline" className={`flex items-center gap-1.5 ${upstoxStatus?.connected_today ? statusColors.orange : upstoxStatus?.configured ? statusColors.info : statusColors.neutral}`}>
                  <BrokerLogo brokerKey="upstox" className="h-3.5 w-3.5" />
                  Upstox: {upstoxStatus?.connected_today ? "Connected" : upstoxStatus?.configured ? "Configured" : "Not Set"}
                </Badge>
                <Badge variant="outline" className={`flex items-center gap-1.5 ${kotakNeoStatus?.connected_today ? statusColors.caution : kotakNeoStatus?.configured ? statusColors.info : statusColors.neutral}`}>
                  <BrokerLogo brokerKey="kotak_neo" className="h-3.5 w-3.5" />
                  Kotak Neo: {kotakNeoStatus?.connected_today ? "Connected" : kotakNeoStatus?.configured ? "Configured" : "Not Set"}
                </Badge>
              </div>

              {/* Add Broker Dropdown */}
              <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-md border text-xs">
                <span className="text-[11px] font-medium text-muted-foreground pl-1.5">+ Add Broker:</span>
                <select
                  className="h-7 rounded border-none bg-background px-2 py-0 text-xs font-medium shadow-xs focus:outline-none focus:ring-1 focus:ring-ring cursor-pointer"
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                    if (e.target.value) {
                      handleAddBroker(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  defaultValue=""
                >
                  <option value="" disabled>Select broker...</option>
                  <option value="kite">Zerodha Kite (OAuth2)</option>
                  <option value="upstox">Upstox (OAuth2)</option>
                  <option value="kotak_neo">Kotak Neo (API v1)</option>
                  <option value="angel">Angel One (SmartAPI)</option>
                  <option value="groww">Groww API</option>
                  <option value="icici">ICICI Direct Breeze</option>
                  <option value="dhan">Dhan HQ</option>
                  <option value="fivepaisa">5paisa</option>
                </select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <Tabs value={activeBrokerTab} onValueChange={setActiveBrokerTab} className="w-full">
            <TabsList className="flex flex-wrap gap-1.5 w-full mb-4 bg-muted/50 p-1.5 h-auto">
              {activeBrokers.includes("kite") && (
                <TabsTrigger value="kite" className="flex items-center gap-2 text-xs px-3 py-1.5">
                  <BrokerLogo brokerKey="kite" className="h-4 w-4" />
                  Zerodha Kite
                  <span className={`h-2 w-2 rounded-full ml-0.5 ${status?.connected_today ? "bg-emerald-500" : status?.configured ? "bg-blue-500" : "bg-muted-foreground/40"}`} />
                </TabsTrigger>
              )}
              {activeBrokers.includes("upstox") && (
                <TabsTrigger value="upstox" className="flex items-center gap-2 text-xs px-3 py-1.5">
                  <BrokerLogo brokerKey="upstox" className="h-4 w-4" />
                  Upstox
                  <span className={`h-2 w-2 rounded-full ml-0.5 ${upstoxStatus?.connected_today ? "bg-amber-500" : upstoxStatus?.configured ? "bg-blue-500" : "bg-muted-foreground/40"}`} />
                </TabsTrigger>
              )}
              {activeBrokers.includes("kotak_neo") && (
                <TabsTrigger value="kotak_neo" className="flex items-center gap-2 text-xs px-3 py-1.5">
                  <BrokerLogo brokerKey="kotak_neo" className="h-4 w-4" />
                  Kotak Neo
                  <span className={`h-2 w-2 rounded-full ml-0.5 ${kotakNeoStatus?.connected_today ? "bg-purple-500" : kotakNeoStatus?.configured ? "bg-blue-500" : "bg-muted-foreground/40"}`} />
                </TabsTrigger>
              )}
              {activeBrokers.includes("angel") && (
                <TabsTrigger value="angel" className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-muted-foreground">
                  <BrokerLogo brokerKey="angel" className="h-4 w-4 opacity-75" />
                  Angel One <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">Soon</Badge>
                </TabsTrigger>
              )}
              {activeBrokers.includes("groww") && (
                <TabsTrigger value="groww" className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-muted-foreground">
                  <BrokerLogo brokerKey="groww" className="h-4 w-4 opacity-75" />
                  Groww <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">Soon</Badge>
                </TabsTrigger>
              )}
              {activeBrokers.includes("icici") && (
                <TabsTrigger value="icici" className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-muted-foreground">
                  <BrokerLogo brokerKey="icici" className="h-4 w-4 opacity-75" />
                  ICICI Direct <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">Soon</Badge>
                </TabsTrigger>
              )}
              {activeBrokers.includes("dhan") && (
                <TabsTrigger value="dhan" className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-muted-foreground">
                  <BrokerLogo brokerKey="dhan" className="h-4 w-4 opacity-75" />
                  Dhan <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">Soon</Badge>
                </TabsTrigger>
              )}
              {activeBrokers.includes("fivepaisa") && (
                <TabsTrigger value="fivepaisa" className="flex items-center gap-1.5 text-xs px-3 py-1.5 text-muted-foreground">
                  <BrokerLogo brokerKey="fivepaisa" className="h-4 w-4 opacity-75" />
                  5paisa <Badge variant="secondary" className="ml-1 text-[9px] px-1 py-0">Soon</Badge>
                </TabsTrigger>
              )}
            </TabsList>

            {/* Zerodha Kite Tab */}
            <TabsContent value="kite" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div className="flex items-center gap-2.5">
                  <BrokerLogo brokerKey="kite" className="h-6 w-6" />
                  <div>
                    <h3 className="font-semibold text-sm">Zerodha Kite Connect</h3>
                    <p className="text-xs text-muted-foreground">Read-only equity holdings OAuth2 integration for Zerodha</p>
                  </div>
                </div>
                {status?.connected_today ? (
                  <Badge variant="outline" className={statusColors.bullish}>Session Active Today</Badge>
                ) : (
                  <Badge variant="outline" className={statusColors.neutral}>{status?.configured ? "Configured" : "Credentials Required"}</Badge>
                )}
              </div>

              {!status?.connected_today ? (
                <div className="space-y-3 max-w-md">
                  <Input
                    placeholder="KITE_API_KEY (e.g. abc123def456)"
                    value={apiKey}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
                  />
                  <Input
                    placeholder="KITE_API_SECRET (e.g. xyz789secret)"
                    type="password"
                    value={apiSecret}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiSecret(e.target.value)}
                  />
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={saveCredentials} disabled={saving || !apiKey || !apiSecret}>
                      {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                      {status?.configured ? "Update Credentials" : "Save Credentials"}
                    </Button>
                    {status?.configured && (
                      <Button size="sm" variant="outline" onClick={connectKite}>
                        <ExternalLink className="h-3 w-3 mr-1" /> Connect Kite OAuth
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-green-50/30 dark:bg-green-950/20 text-sm">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                    <CheckCircle2 className="h-5 w-5" />
                    <div>
                      <p className="font-medium">Kite connected for {status.profile?.user_shortname || status.profile?.user_name || "today"}</p>
                      <p className="text-xs opacity-80">Access token valid for current trading session</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={disconnect}>
                    <LogOut className="h-3.5 w-3.5 mr-1" /> Disconnect
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Upstox Tab */}
            <TabsContent value="upstox" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div className="flex items-center gap-2.5">
                  <BrokerLogo brokerKey="upstox" className="h-6 w-6" />
                  <div>
                    <h3 className="font-semibold text-sm">Upstox API v2</h3>
                    <p className="text-xs text-muted-foreground">Read-only equity long-term holdings integration for Upstox</p>
                  </div>
                </div>
                {upstoxStatus?.connected_today ? (
                  <Badge variant="outline" className={statusColors.orange}>Session Active Today</Badge>
                ) : (
                  <Badge variant="outline" className={statusColors.neutral}>{upstoxStatus?.configured ? "Configured" : "Credentials Required"}</Badge>
                )}
              </div>

              {!upstoxStatus?.connected_today ? (
                <div className="space-y-3 max-w-md">
                  <Input
                    placeholder="UPSTOX_API_KEY"
                    value={upstoxApiKey}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUpstoxApiKey(e.target.value)}
                  />
                  <Input
                    placeholder="UPSTOX_API_SECRET"
                    type="password"
                    value={upstoxApiSecret}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUpstoxApiSecret(e.target.value)}
                  />
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={saveUpstoxCreds} disabled={savingUpstox || !upstoxApiKey || !upstoxApiSecret}>
                      {savingUpstox ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                      {upstoxStatus?.configured ? "Update Credentials" : "Save Credentials"}
                    </Button>
                    {upstoxStatus?.configured && (
                      <Button size="sm" variant="outline" onClick={connectUpstox}>
                        <ExternalLink className="h-3 w-3 mr-1" /> Connect Upstox OAuth
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-amber-50/30 dark:bg-amber-950/20 text-sm">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <CheckCircle2 className="h-5 w-5" />
                    <div>
                      <p className="font-medium">Upstox connected for {upstoxStatus.profile?.user_name || "today"}</p>
                      <p className="text-xs opacity-80">Access token valid for current trading session</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={disconnectUpstox}>
                    <LogOut className="h-3.5 w-3.5 mr-1" /> Disconnect
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Kotak Neo Tab */}
            <TabsContent value="kotak_neo" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                <div className="flex items-center gap-2.5">
                  <BrokerLogo brokerKey="kotak_neo" className="h-6 w-6" />
                  <div>
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      Kotak Neo API Connector
                      <Badge variant="secondary" className="text-[10px] px-1.5">Equity Read-Only</Badge>
                    </h3>
                    <p className="text-xs text-muted-foreground">Read-only equity portfolio holdings sync for Kotak Neo accounts</p>
                  </div>
                </div>
                {kotakNeoStatus?.connected_today ? (
                  <Badge variant="outline" className={statusColors.caution}>Session Active Today</Badge>
                ) : (
                  <Badge variant="outline" className={statusColors.neutral}>{kotakNeoStatus?.configured ? "Configured" : "Credentials Required"}</Badge>
                )}
              </div>

              {!kotakNeoStatus?.connected_today ? (
                <div className="grid md:grid-cols-2 gap-6">
                  {/* Step 1: Credentials */}
                  <div className="space-y-3 border rounded-lg p-4 bg-muted/10">
                    <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">1. API Credentials</h4>
                    <Input
                      placeholder="Consumer Key (e.g. key_12345)"
                      value={kotakConsumerKey}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKotakConsumerKey(e.target.value)}
                    />
                    <Input
                      placeholder="Consumer Secret"
                      type="password"
                      value={kotakConsumerSecret}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKotakConsumerSecret(e.target.value)}
                    />
                    <Input
                      placeholder="Mobile Number (e.g. +919876543210)"
                      value={kotakMobileNumber}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKotakMobileNumber(e.target.value)}
                    />
                    <Input
                      placeholder="PAN or DOB (optional)"
                      value={kotakPanDob}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKotakPanDob(e.target.value)}
                    />
                    <Button
                      size="sm"
                      onClick={saveKotakCreds}
                      disabled={savingKotak || !kotakConsumerKey || !kotakConsumerSecret || !kotakMobileNumber}
                    >
                      {savingKotak ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                      {kotakNeoStatus?.configured ? "Update Credentials" : "Save Credentials"}
                    </Button>
                  </div>

                  {/* Step 2: Session Login */}
                  <div className="space-y-3 border rounded-lg p-4 bg-muted/10">
                    <h4 className="font-medium text-xs text-muted-foreground uppercase tracking-wider">2. Daily Session Login</h4>
                    <p className="text-xs text-muted-foreground">
                      Enter your MPIN or Password to initialize session token for today&apos;s holdings fetch.
                    </p>
                    <Input
                      placeholder="Kotak Neo MPIN or Password"
                      type="password"
                      value={kotakMpinPassword}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setKotakMpinPassword(e.target.value)}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={loginKotakSession}
                      disabled={loggingInKotak || !kotakNeoStatus?.configured || !kotakMpinPassword}
                    >
                      {loggingInKotak ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5 mr-1" />}
                      Start Daily Session
                    </Button>
                    {!kotakNeoStatus?.configured && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">Please save credentials in Step 1 first.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-lg border bg-purple-50/30 dark:bg-purple-950/20 text-sm">
                  <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300">
                    <CheckCircle2 className="h-5 w-5" />
                    <div>
                      <p className="font-medium">
                        Kotak Neo session active for {kotakNeoStatus.profile?.user_shortname || kotakNeoStatus.profile?.user_name || "Account"}
                      </p>
                      <p className="text-xs opacity-80">Connected via key {kotakNeoStatus.masked_consumer_key || "saved"}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={disconnectKotakNeo}>
                    <LogOut className="h-3.5 w-3.5 mr-1" /> Disconnect Session
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Angel One Tab */}
            <TabsContent value="angel" className="p-4 text-center border rounded-lg bg-muted/20 space-y-2">
              <h4 className="font-semibold text-sm">Angel One SmartAPI</h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Read-only SmartAPI holdings synchronization for Angel One accounts is coming soon in the next update.
              </p>
              <Badge variant="secondary" className="mt-2">Coming Soon</Badge>
            </TabsContent>

            {/* Groww Tab */}
            <TabsContent value="groww" className="p-4 text-center border rounded-lg bg-muted/20 space-y-2">
              <h4 className="font-semibold text-sm">Groww API Connector</h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Direct portfolio holdings sync for Groww accounts is currently on our integration roadmap.
              </p>
              <Badge variant="secondary" className="mt-2">Coming Soon</Badge>
            </TabsContent>

            {/* ICICI Direct Tab */}
            <TabsContent value="icici" className="p-4 text-center border rounded-lg bg-muted/20 space-y-2">
              <h4 className="font-semibold text-sm">ICICI Breeze API</h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Read-only Breeze API integration for ICICI Direct equity portfolios is planned for upcoming releases.
              </p>
              <Badge variant="secondary" className="mt-2">Coming Soon</Badge>
            </TabsContent>

            {/* Dhan Tab */}
            <TabsContent value="dhan" className="p-4 text-center border rounded-lg bg-muted/20 space-y-2">
              <h4 className="font-semibold text-sm">Dhan HQ API</h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Read-only Dhan HQ portfolio holdings integration will be available shortly.
              </p>
              <Badge variant="secondary" className="mt-2">Coming Soon</Badge>
            </TabsContent>

            {/* 5paisa Tab */}
            <TabsContent value="fivepaisa" className="p-4 text-center border rounded-lg bg-muted/20 space-y-2">
              <h4 className="font-semibold text-sm">5paisa API</h4>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Direct portfolio holdings sync for 5paisa trading accounts is planned for upcoming releases.
              </p>
              <Badge variant="secondary" className="mt-2">Coming Soon</Badge>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <PositionsPanel
        kiteConnected={!!status?.connected_today}
        upstoxConnected={!!upstoxStatus?.connected_today}
        kotakNeoConnected={!!kotakNeoStatus?.connected_today}
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
