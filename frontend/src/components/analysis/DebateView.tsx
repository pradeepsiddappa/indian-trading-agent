"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TrendingUp, TrendingDown, Shield, Swords, Scale, type LucideIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Props {
  bull: string;
  bear: string;
  riskAggressive?: string;
  riskConservative?: string;
  riskNeutral?: string;
}

function DebateMessage({ content, side, icon: Icon, color }: { content: string; side: string; icon: LucideIcon; color: string }) {
  if (!content) return null;

  // Split into individual arguments
  const messages = content.split(/(?=Bull Analyst:|Bear Analyst:|Aggressive Analyst:|Conservative Analyst:|Neutral Analyst:)/g).filter(Boolean);

  return (
    <div className="space-y-3">
      {messages.map((msg, i) => (
        <div key={i} className={`p-3 rounded-lg border ${color}`}>
          <div className="flex items-center gap-2 mb-2">
            <Icon className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase">{side}</span>
          </div>
          <div className="prose prose-xs dark:prose-invert max-w-none text-sm">
            <ReactMarkdown>{msg}</ReactMarkdown>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DebateView({ bull, bear, riskAggressive, riskConservative, riskNeutral }: Props) {
  const hasInvestDebate = bull || bear;
  const hasRiskDebate = riskAggressive || riskConservative || riskNeutral;

  if (!hasInvestDebate && !hasRiskDebate) {
    return null;
  }

  return (
    <div className="space-y-4">
      {hasInvestDebate && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Swords className="h-4 w-4" /> Investment Debate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="grid grid-cols-2 gap-3">
                <DebateMessage content={bull} side="Bull" icon={TrendingUp} color="border-green-500/20 bg-green-500/5" />
                <DebateMessage content={bear} side="Bear" icon={TrendingDown} color="border-red-500/20 bg-red-500/5" />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {hasRiskDebate && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4" /> Risk Assessment Debate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[250px]">
              <div className="grid grid-cols-3 gap-3">
                <DebateMessage content={riskAggressive || ""} side="Aggressive" icon={TrendingUp} color="border-orange-500/20 bg-orange-500/5" />
                <DebateMessage content={riskConservative || ""} side="Conservative" icon={Shield} color="border-blue-500/20 bg-blue-500/5" />
                <DebateMessage content={riskNeutral || ""} side="Neutral" icon={Scale} color="border-purple-500/20 bg-purple-500/5" />
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
