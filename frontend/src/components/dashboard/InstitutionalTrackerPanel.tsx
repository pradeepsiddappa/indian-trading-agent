"use client";

import React, { useEffect, useState } from "react";
import { getBulkDeals, getDeliveryStats, getInstitutionalSummary, getPromoterActivity } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { statusColors } from "@/lib/status-colors";
import {
  Building2,
  TrendingUp,
  TrendingDown,
  PieChart,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Search,
  Activity,
  UserCheck,
} from "lucide-react";

type BulkDeal = {
  symbol: string;
  session: string;
  price: number;
  volume: number;
  value_cr: number;
  time: string;
  source: string;
};

type PromoterAct = {
  symbol: string;
  person: string;
  transaction_type: string;
  quantity: number;
  value_cr: number;
  date: string;
  pledged_pct: number;
};

type DeliveryStat = {
  symbol: string;
  traded_quantity: number;
  delivery_quantity: number;
  delivery_pct: number;
  accumulation_status: string;
  volume_ratio_vs_20d: number;
  price_1m_change_pct: number;
};

export function InstitutionalTrackerPanel() {
  const [deals, setDeals] = useState<BulkDeal[]>([]);
  const [promoterActs, setPromoterActs] = useState<PromoterAct[]>([]);
  const [searchTicker, setSearchTicker] = useState("RELIANCE");
  const [deliveryData, setDeliveryData] = useState<DeliveryStat | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchingDelivery, setSearchingDelivery] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryRes, delivRes] = await Promise.all([
        getInstitutionalSummary().catch(() => null) as Promise<{ bulk_deals?: { recent: BulkDeal[] }; promoter_activity?: { recent: PromoterAct[] } } | null>,
        getDeliveryStats(searchTicker).catch(() => null) as Promise<DeliveryStat | null>,
      ]);

      if (summaryRes) {
        setDeals(summaryRes.bulk_deals?.recent || []);
        setPromoterActs(summaryRes.promoter_activity?.recent || []);
      }
      if (delivRes) {
        setDeliveryData(delivRes);
      }
    } catch (e) {
      console.error("Failed to load institutional tracker data", e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeliverySearch = async () => {
    if (!searchTicker.trim()) return;
    setSearchingDelivery(true);
    try {
      const res = (await getDeliveryStats(searchTicker)) as DeliveryStat;
      setDeliveryData(res);
    } catch (e) {
      console.error("Failed to fetch delivery stats", e);
    } finally {
      setSearchingDelivery(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" /> Institutional & Insider Tracker
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Track Large Block Deals, Delivery Accumulation, and Promoter Buying/Pledging Activity
            </p>
          </div>
          <Badge variant="outline" className={statusColors.info}>
            <Activity className="h-3 w-3 mr-1" /> Live NSE Data
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <Tabs defaultValue="bulk_deals" className="w-full">
          <TabsList className="mb-4 bg-muted/50 p-1 flex flex-wrap gap-1 h-auto">
            <TabsTrigger value="bulk_deals" className="text-xs px-3 py-1.5 flex items-center gap-1.5">
              <PieChart className="h-3.5 w-3.5 text-blue-500" />
              Bulk / Block Deals ({deals.length})
            </TabsTrigger>
            <TabsTrigger value="delivery_pct" className="text-xs px-3 py-1.5 flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              Delivery % Accumulation
            </TabsTrigger>
            <TabsTrigger value="promoter_activity" className="text-xs px-3 py-1.5 flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-purple-500" />
              Promoter & Insider Deals ({promoterActs.length})
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Bulk & Block Deals */}
          <TabsContent value="bulk_deals" className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Traded Vol</TableHead>
                  <TableHead className="text-right">Value (Cr)</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading block deal data...
                    </TableCell>
                  </TableRow>
                ) : deals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      No block transactions reported for current trading session.
                    </TableCell>
                  </TableRow>
                ) : (
                  deals.map((d, i) => (
                    <TableRow key={`${d.symbol}-${i}`}>
                      <TableCell className="font-semibold">{d.symbol}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.session || "Regular"}</TableCell>
                      <TableCell className="text-right font-mono">Rs.{Number(d.price || 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono">{Number(d.volume || 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400 font-mono">
                        Rs.{Number(d.value_cr || 0).toFixed(2)} Cr
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{d.time || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TabsContent>

          {/* Tab 2: Delivery % Accumulation */}
          <TabsContent value="delivery_pct" className="space-y-4">
            <div className="flex items-center gap-2 max-w-sm">
              <Input
                placeholder="Stock Ticker (e.g. RELIANCE, TCS, INFY)"
                value={searchTicker}
                onChange={(e) => setSearchTicker(e.target.value.toUpperCase())}
                className="h-8 text-xs font-mono"
              />
              <Button size="sm" onClick={handleDeliverySearch} disabled={searchingDelivery}>
                {searchingDelivery ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Search className="h-3 w-3 mr-1" />}
                Analyze
              </Button>
            </div>

            {deliveryData && (
              <div className="grid md:grid-cols-3 gap-4 pt-2">
                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Estimated Delivery %</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                      {deliveryData.delivery_pct}%
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {deliveryData.delivery_quantity?.toLocaleString("en-IN")} deliverable shares
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">20-Day Volume Ratio</p>
                    <p className="text-2xl font-bold">{deliveryData.volume_ratio_vs_20d}x</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      1M Price Return: {deliveryData.price_1m_change_pct >= 0 ? "+" : ""}{deliveryData.price_1m_change_pct}%
                    </p>
                  </CardContent>
                </Card>

                <Card className="bg-muted/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">Accumulation Pattern</p>
                    <Badge
                      variant="outline"
                      className={`mt-1 text-xs ${
                        deliveryData.accumulation_status.includes("ACCUMULATION")
                          ? statusColors.bullish
                          : deliveryData.accumulation_status.includes("DISTRIBUTION")
                          ? statusColors.bearish
                          : statusColors.neutral
                      }`}
                    >
                      {deliveryData.accumulation_status.replace(/_/g, " ")}
                    </Badge>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Tab 3: Promoter & Insider Activity */}
          <TabsContent value="promoter_activity" className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Insider / Promoter</TableHead>
                  <TableHead>Transaction Type</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Value (Cr)</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading promoter transactions...
                    </TableCell>
                  </TableRow>
                ) : promoterActs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                      No recent insider transactions reported.
                    </TableCell>
                  </TableRow>
                ) : (
                  promoterActs.map((act, i) => (
                    <TableRow key={`${act.symbol}-${i}`}>
                      <TableCell className="font-semibold">{act.symbol}</TableCell>
                      <TableCell className="text-xs">{act.person}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            act.transaction_type.toLowerCase().includes("buy") || act.transaction_type.toLowerCase().includes("purchase")
                              ? statusColors.bullish
                              : statusColors.caution
                          }
                        >
                          {act.transaction_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">{Number(act.quantity || 0).toLocaleString("en-IN")}</TableCell>
                      <TableCell className="text-right font-mono font-medium">Rs.{Number(act.value_cr || 0).toFixed(2)} Cr</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{act.date}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
