"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Loader2, Circle } from "lucide-react";

interface Agent {
  name: string;
  status: "pending" | "running" | "completed";
}

const defaultAgents: Agent[] = [
  { name: "Market Analyst", status: "pending" },
  { name: "Social Analyst", status: "pending" },
  { name: "News Analyst", status: "pending" },
  { name: "Fundamentals Analyst", status: "pending" },
  { name: "Bull Researcher", status: "pending" },
  { name: "Bear Researcher", status: "pending" },
  { name: "Research Manager", status: "pending" },
  { name: "Trader", status: "pending" },
  { name: "Risk Debate", status: "pending" },
  { name: "Portfolio Manager", status: "pending" },
];

interface Props {
  reports: Record<string, string>;
  signal: string | null;
  status: string;
}

export function AgentProgress({ reports, status }: Props) {
  const reportMap: Record<string, string> = {
    "Market Analyst": "market_report",
    "Social Analyst": "sentiment_report",
    "News Analyst": "news_report",
    "Fundamentals Analyst": "fundamentals_report",
    "Research Manager": "investment_plan",
    "Trader": "trader_investment_plan",
    "Portfolio Manager": "final_trade_decision",
    "Bull Researcher": "bull_history",
    "Bear Researcher": "bear_history",
    "Risk Debate": "risk_aggressive_history",
  };

  // First pass: determine completed status
  const agentStatuses = defaultAgents.map((agent) => {
    if (status === "completed") return "completed" as const;
    if (status !== "running") return "pending" as const;

    const reportKey = reportMap[agent.name];
    if (reportKey && reports[reportKey]) return "completed" as const;
    if (agent.name === "Risk Debate" && reports["risk_conservative_history"]) return "completed" as const;
    return "pending" as const;
  });

  // Second pass: mark the first pending agent as running
  const runningIndex = status === "running" ? agentStatuses.indexOf("pending") : -1;
  const agents = defaultAgents.map((agent, i) => ({
    ...agent,
    status: i === runningIndex ? ("running" as const) : agentStatuses[i],
  }));

  const statusIcon = (s: string) => {
    switch (s) {
      case "completed": return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case "running": return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
      default: return <Circle className="h-4 w-4 text-muted-foreground/30" />;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Agent Pipeline</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {agents.map((agent) => (
          <div key={agent.name} className="flex items-center gap-2">
            {statusIcon(agent.status)}
            <span className={`text-sm ${
              agent.status === "completed" ? "text-foreground" :
              agent.status === "running" ? "text-blue-400 font-medium" :
              "text-muted-foreground"
            }`}>
              {agent.name}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
