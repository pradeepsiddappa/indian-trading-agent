"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getAnalysisResult } from "@/lib/api";
import { DecisionCard } from "@/components/analysis/DecisionCard";
import { ReportPanel } from "@/components/analysis/ReportPanel";
import { DebateView } from "@/components/analysis/DebateView";
import type { AnalysisResult } from "@/lib/types";

export default function AnalysisDetailPage() {
  const params = useParams();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (params.id) {
      getAnalysisResult(params.id as string)
        .then((data) => setResult(data as AnalysisResult))
        .catch(() => setResult(null))
        .finally(() => setLoading(false));
    }
  }, [params.id]);

  if (loading) {
    return <div className="p-6"><p className="text-muted-foreground">Loading analysis...</p></div>;
  }

  if (!result || !result.signal) {
    return <div className="p-6"><p className="text-muted-foreground">Analysis not found or still in progress.</p></div>;
  }

  const reports: Record<string, string> = {};
  if (result.market_report) reports.market_report = result.market_report;
  if (result.sentiment_report) reports.sentiment_report = result.sentiment_report;
  if (result.news_report) reports.news_report = result.news_report;
  if (result.fundamentals_report) reports.fundamentals_report = result.fundamentals_report;
  if (result.investment_plan) reports.investment_plan = result.investment_plan;
  if (result.trader_investment_plan) reports.trader_investment_plan = result.trader_investment_plan;
  if (result.final_trade_decision) reports.final_trade_decision = result.final_trade_decision;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{result.ticker} Analysis</h1>
        <p className="text-sm text-muted-foreground">Date: {result.trade_date} | Task: {result.task_id}</p>
      </div>

      <DecisionCard signal={result.signal} ticker={result.ticker} duration={result.duration_seconds} />

      <ReportPanel reports={reports} />

      <DebateView
        bull={result.bull_history || ""}
        bear={result.bear_history || ""}
        riskAggressive={result.risk_aggressive_history}
        riskConservative={result.risk_conservative_history}
        riskNeutral={result.risk_neutral_history}
      />
    </div>
  );
}
