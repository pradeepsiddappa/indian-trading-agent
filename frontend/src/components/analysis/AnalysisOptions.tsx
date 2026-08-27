"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Settings2 } from "lucide-react";

interface Props {
  analysts: string[];
  onAnalystsChange: (analysts: string[]) => void;
  depth: number;
  onDepthChange: (depth: number) => void;
  language: string;
  onLanguageChange: (lang: string) => void;
  disabled?: boolean;
}

const availableAnalysts = [
  { value: "market", label: "Market", description: "Technical indicators (RSI, MACD, Bollinger)" },
  { value: "social", label: "Social", description: "Social media sentiment" },
  { value: "news", label: "News", description: "Indian + global market news" },
  { value: "fundamentals", label: "Fundamentals", description: "P&L, balance sheet, cash flow" },
];

const depthOptions = [
  { value: 1, label: "Shallow", description: "1 debate round · fastest · cheapest", estCost: "~Rs.15-25", estTime: "~1-2 min" },
  { value: 2, label: "Medium", description: "2 debate rounds · balanced", estCost: "~Rs.25-40", estTime: "~2-4 min" },
  { value: 3, label: "Deep", description: "3 debate rounds · most thorough", estCost: "~Rs.40-60", estTime: "~4-6 min" },
];

const languages = [
  { value: "English", label: "English" },
  { value: "Hindi", label: "हिन्दी (Hindi)" },
];

export function AnalysisOptions({
  analysts,
  onAnalystsChange,
  depth,
  onDepthChange,
  language,
  onLanguageChange,
  disabled,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const toggleAnalyst = (val: string) => {
    if (analysts.includes(val)) {
      if (analysts.length > 1) onAnalystsChange(analysts.filter((a) => a !== val));
    } else {
      onAnalystsChange([...analysts, val]);
    }
  };

  // Estimate cost based on analyst count and depth
  const baseCostPerAnalyst = 4; // Rs per analyst
  const debateCost = 6 * depth; // Rs per debate round
  const fixedCost = 10; // trader + portfolio manager
  const estCost = Math.round(baseCostPerAnalyst * analysts.length + debateCost + fixedCost);

  return (
    <Card>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-accent/30 transition-colors rounded-t-lg"
        disabled={disabled}
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Customize Analysis</span>
          <Badge variant="outline" className="text-xs">
            {analysts.length} agents · Depth {depth} · {language}
          </Badge>
          <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800">
            ~Rs.{estCost}
          </Badge>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <CardContent className="space-y-4 pt-0">
          {/* Analysts */}
          <div>
            <label className="text-xs font-medium mb-2 block">Analysts (select which to run)</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {availableAnalysts.map((a) => {
                const active = analysts.includes(a.value);
                return (
                  <button
                    key={a.value}
                    type="button"
                    onClick={() => toggleAnalyst(a.value)}
                    disabled={disabled}
                    className={`p-2 rounded-lg border text-left transition-colors ${
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/30 opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{a.label}</span>
                      <input
                        type="checkbox"
                        checked={active}
                        readOnly
                        className="h-3 w-3 pointer-events-none"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{a.description}</p>
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Fewer analysts = faster + cheaper. At least 1 is required.
            </p>
          </div>

          {/* Research Depth */}
          <div>
            <label className="text-xs font-medium mb-2 block">Research Depth (debate rounds)</label>
            <div className="grid grid-cols-3 gap-2">
              {depthOptions.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => onDepthChange(d.value)}
                  disabled={disabled}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    depth === d.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{d.label}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{d.description}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {d.estCost} · {d.estTime}
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div>
            <label className="text-xs font-medium mb-2 block">Report Language</label>
            <div className="flex gap-2">
              {languages.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => onLanguageChange(l.value)}
                  disabled={disabled}
                  className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                    language === l.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/30"
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Internal debates stay in English for quality. Only final reports use selected language.
            </p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
