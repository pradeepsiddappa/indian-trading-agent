"use client";

import { useState } from "react";
import { updatePnL } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Brain } from "lucide-react";
import { toast } from "sonner";
import { pnlPanel, pnlText, infoSubtle } from "@/lib/status-colors";

interface Props {
  open: boolean;
  onClose: () => void;
  taskId: string;
  ticker: string;
  signal: string;
  onSaved: () => void;
}

export function PnLDialog({ open, onClose, taskId, ticker, signal, onSaved }: Props) {
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [reflect, setReflect] = useState(true);
  const [saving, setSaving] = useState(false);

  const handleSaveOpen = async () => {
    const entry = parseFloat(entryPrice);
    if (isNaN(entry) || entry <= 0) {
      toast.error("Enter a valid entry price");
      return;
    }
    setSaving(true);
    try {
      await updatePnL(taskId, {
        entry_price: entry,
      } as any);
      toast.success(`Trade marked as OPEN at Rs.${entry}`);
      onSaved();
      onClose();
      setEntryPrice("");
      setExitPrice("");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    const entry = parseFloat(entryPrice);
    const exit = parseFloat(exitPrice);
    if (isNaN(entry) || isNaN(exit) || entry <= 0 || exit <= 0) {
      toast.error("Enter valid prices");
      return;
    }
    setSaving(true);
    try {
      const result: any = await updatePnL(taskId, {
        entry_price: entry,
        exit_price: exit,
        reflect,
      });
      toast.success(`P&L saved: ${result.pnl_pct >= 0 ? "+" : ""}${result.pnl_pct}% (${result.pnl_status})`);
      if (reflect && result.reflection?.ok) {
        toast.success("Agent memories updated — future analyses will learn from this trade", {
          duration: 5000,
        });
      }
      onSaved();
      onClose();
      setEntryPrice("");
      setExitPrice("");
    } catch (e: any) {
      toast.error(e.message || "Failed to save P&L");
    } finally {
      setSaving(false);
    }
  };

  const entry = parseFloat(entryPrice);
  const exit = parseFloat(exitPrice);
  const pnlPct = !isNaN(entry) && !isNaN(exit) && entry > 0 ? ((exit - entry) / entry) * 100 : null;
  const isShort = ["SELL", "UNDERWEIGHT", "SHORT"].includes(signal.toUpperCase());
  const effectivePnl = pnlPct !== null ? (isShort ? -pnlPct : pnlPct) : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log P&L for {ticker}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Signal was <span className="font-semibold">{signal}</span> ({isShort ? "short direction" : "long direction"})
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-1 block">Entry Price (Rs.)</label>
            <Input
              type="number"
              step="0.01"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              placeholder="e.g., 2850.50"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block">Exit Price (Rs.)</label>
            <Input
              type="number"
              step="0.01"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              placeholder="e.g., 2900.00"
            />
          </div>

          {effectivePnl !== null && (
            <div className={`p-3 rounded-lg ${pnlPanel(effectivePnl >= 0)}`}>
              <p className="text-xs text-muted-foreground">Effective P&L</p>
              <p className={`text-xl font-bold ${pnlText(effectivePnl >= 0)}`}>
                {effectivePnl >= 0 ? "+" : ""}{effectivePnl.toFixed(2)}%
              </p>
              {isShort && pnlPct !== null && (
                <p className="text-xs text-muted-foreground">
                  (Price moved {pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%, but short direction inverts)
                </p>
              )}
            </div>
          )}

          {/* Reflect toggle */}
          <label className={`flex items-start gap-3 p-3 rounded-lg border ${infoSubtle()} cursor-pointer`}>
            <input
              type="checkbox"
              checked={reflect}
              onChange={(e) => setReflect(e.target.checked)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1 text-sm font-medium">
                <Brain className="h-3 w-3 text-blue-600" />
                Teach the agent from this trade
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Feed this P&L to the 5 agent memories (Bull, Bear, Trader, Judge, Portfolio Manager) so future analyses learn from this outcome. Adds ~5 LLM calls (~Rs.5-10 cost).
              </p>
            </div>
          </label>

          <div className="flex gap-2 justify-end flex-wrap">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleSaveOpen}
              disabled={saving || !entryPrice}
              title="Save only entry price — mark as open trade"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Mark as Open
            </Button>
            <Button onClick={handleSave} disabled={saving || !entryPrice || !exitPrice}>
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save Closed P&L
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
