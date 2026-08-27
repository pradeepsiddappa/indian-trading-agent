"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calculator, AlertTriangle, CheckCircle2, TrendingUp, TrendingDown } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  defaultEntry?: number;
  defaultSL?: number;
  defaultTarget?: number;
  ticker?: string;
}

// Persist capital + risk % between sessions
const LS_CAPITAL = "trading_agent_capital";
const LS_RISK_PCT = "trading_agent_risk_pct";

export function PositionSizeCalculator({ open, onClose, defaultEntry, defaultSL, defaultTarget, ticker }: Props) {
  const [capital, setCapital] = useState("500000");
  const [riskPct, setRiskPct] = useState("1");
  const [entry, setEntry] = useState(defaultEntry ? String(defaultEntry) : "");
  const [sl, setSl] = useState(defaultSL ? String(defaultSL) : "");
  const [target, setTarget] = useState(defaultTarget ? String(defaultTarget) : "");
  const [direction, setDirection] = useState<"long" | "short">("long");

  // Load saved values on mount
  useEffect(() => {
    const savedCapital = localStorage.getItem(LS_CAPITAL);
    const savedRisk = localStorage.getItem(LS_RISK_PCT);
    if (savedCapital) setCapital(savedCapital);
    if (savedRisk) setRiskPct(savedRisk);
  }, []);

  // Save when changed
  useEffect(() => {
    localStorage.setItem(LS_CAPITAL, capital);
    localStorage.setItem(LS_RISK_PCT, riskPct);
  }, [capital, riskPct]);

  // Update when props change
  useEffect(() => {
    if (defaultEntry) setEntry(String(defaultEntry));
    if (defaultSL) setSl(String(defaultSL));
    if (defaultTarget) setTarget(String(defaultTarget));
  }, [defaultEntry, defaultSL, defaultTarget]);

  const capitalNum = parseFloat(capital) || 0;
  const riskPctNum = parseFloat(riskPct) || 0;
  const entryNum = parseFloat(entry) || 0;
  const slNum = parseFloat(sl) || 0;
  const targetNum = parseFloat(target) || 0;

  // Calculations
  const riskAmount = capitalNum * (riskPctNum / 100);
  const slDistance = direction === "long" ? entryNum - slNum : slNum - entryNum;
  const shares = slDistance > 0 && entryNum > 0 ? Math.floor(riskAmount / slDistance) : 0;
  const positionValue = shares * entryNum;
  const portfolioPct = capitalNum > 0 ? (positionValue / capitalNum) * 100 : 0;
  const maxLoss = shares * slDistance;

  const targetDistance = direction === "long" ? targetNum - entryNum : entryNum - targetNum;
  const maxProfit = shares * targetDistance;
  const rrRatio = slDistance > 0 && targetDistance > 0 ? targetDistance / slDistance : 0;

  // Validation
  const slInvalid = direction === "long" ? slNum >= entryNum : slNum <= entryNum;
  const targetInvalid = targetNum > 0 && (direction === "long" ? targetNum <= entryNum : targetNum >= entryNum);
  const positionTooBig = portfolioPct > 30;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Position Size Calculator {ticker && <Badge variant="outline">{ticker}</Badge>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Direction */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDirection("long")}
              className={`flex-1 p-2 rounded-lg border text-sm transition-colors ${
                direction === "long"
                  ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300"
                  : "border-border hover:border-green-200"
              }`}
            >
              <TrendingUp className="h-3 w-3 inline mr-1" /> Long (Buy)
            </button>
            <button
              type="button"
              onClick={() => setDirection("short")}
              className={`flex-1 p-2 rounded-lg border text-sm transition-colors ${
                direction === "short"
                  ? "border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
                  : "border-border hover:border-red-200"
              }`}
            >
              <TrendingDown className="h-3 w-3 inline mr-1" /> Short (Sell)
            </button>
          </div>

          {/* Capital + Risk */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Portfolio Capital (Rs.)</label>
              <Input
                type="number"
                value={capital}
                onChange={(e) => setCapital(e.target.value)}
                placeholder="500000"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Risk per trade (%)</label>
              <Input
                type="number"
                step="0.1"
                value={riskPct}
                onChange={(e) => setRiskPct(e.target.value)}
                placeholder="1"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">Recommended: 1-2%</p>
            </div>
          </div>

          {/* Entry / SL / Target */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium mb-1 block">Entry (Rs.)</label>
              <Input
                type="number"
                step="0.01"
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                placeholder="2850"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Stop-Loss (Rs.)</label>
              <Input
                type="number"
                step="0.01"
                value={sl}
                onChange={(e) => setSl(e.target.value)}
                placeholder={direction === "long" ? "2820" : "2880"}
                className={slInvalid && sl ? "border-red-300" : ""}
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1 block">Target (optional)</label>
              <Input
                type="number"
                step="0.01"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder={direction === "long" ? "2920" : "2780"}
                className={targetInvalid && target ? "border-red-300" : ""}
              />
            </div>
          </div>

          {slInvalid && sl && (
            <div className="text-xs text-red-700 flex items-start gap-1">
              <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
              SL should be {direction === "long" ? "below" : "above"} entry for {direction} trade
            </div>
          )}

          {/* Results */}
          {shares > 0 && !slInvalid && (
            <Card className="border-green-200 bg-green-50/30 dark:border-green-800 dark:bg-green-950/20">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Recommended Position</span>
                  {!positionTooBig ? (
                    <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800">
                      <CheckCircle2 className="h-3 w-3 mr-1" /> Safe
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800">
                      <AlertTriangle className="h-3 w-3 mr-1" /> Large
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Shares to {direction === "long" ? "buy" : "short"}</p>
                    <p className="text-2xl font-bold">{shares.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Position Value</p>
                    <p className="text-2xl font-bold">Rs.{positionValue.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{portfolioPct.toFixed(1)}% of portfolio</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                  <div>
                    <p className="text-xs text-muted-foreground">Max Loss (SL hit)</p>
                    <p className="text-lg font-semibold text-red-600">-Rs.{Math.round(maxLoss).toLocaleString()}</p>
                  </div>
                  {targetNum > 0 && !targetInvalid && (
                    <div>
                      <p className="text-xs text-muted-foreground">Max Profit (target hit)</p>
                      <p className="text-lg font-semibold text-green-600">+Rs.{Math.round(maxProfit).toLocaleString()}</p>
                    </div>
                  )}
                </div>

                {rrRatio > 0 && (
                  <div className="pt-3 border-t flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Risk-Reward Ratio</span>
                    <Badge variant="outline" className={
                      rrRatio >= 2 ? "bg-green-100 text-green-800 border-green-300" :
                      rrRatio >= 1.5 ? "bg-yellow-100 text-yellow-800 border-yellow-300" :
                      "bg-red-100 text-red-800 border-red-300"
                    }>
                      1 : {rrRatio.toFixed(2)} {rrRatio >= 2 ? "(Good)" : rrRatio >= 1.5 ? "(Fair)" : "(Poor)"}
                    </Badge>
                  </div>
                )}

                {positionTooBig && (
                  <div className="text-xs text-yellow-800 bg-yellow-50 border border-yellow-200 dark:text-yellow-300 dark:bg-yellow-950/40 dark:border-yellow-800 rounded p-2 flex items-start gap-1">
                    <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                    This position is {portfolioPct.toFixed(0)}% of your portfolio. Consider a smaller position.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
