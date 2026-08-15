"use client";

import { useEffect, useState } from "react";
import {
  addPosition,
  deletePosition,
  getPositions,
  syncPositions,
  updatePosition,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Briefcase,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { statusColors } from "@/lib/status-colors";

export type Position = {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price?: number | null;
  invested_value?: number;
  current_value?: number;
  pnl?: number;
  pnl_pct?: number;
  day_change?: number;
  day_change_pct?: number;
  allocation_pct?: number;
  source: string;
  notes?: string | null;
};

type PositionsSummary = {
  total_positions: number;
  total_invested: number;
  total_current: number;
  total_pnl: number;
  total_pnl_pct: number;
  total_day_pnl: number;
  day_pnl_pct: number;
  manual_count: number;
  kite_count: number;
};

type PositionsView = {
  positions: Position[];
  count: number;
  last_sync: string | null;
  summary: PositionsSummary;
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

function formatSyncTime(iso: string | null) {
  if (!iso) return "Never synced";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type FormState = {
  tradingsymbol: string;
  exchange: string;
  quantity: string;
  average_price: string;
  last_price: string;
  notes: string;
};

const emptyForm: FormState = {
  tradingsymbol: "",
  exchange: "NSE",
  quantity: "",
  average_price: "",
  last_price: "",
  notes: "",
};

export function PositionsPanel({ kiteConnected, onPositionCountChange }: {
  kiteConnected: boolean;
  onPositionCountChange?: (count: number) => void;
}) {
  const [view, setView] = useState<PositionsView | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    try {
      const data = (await getPositions()) as PositionsView;
      setView(data);
      onPositionCountChange?.(data.count);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load positions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // The loader is intentionally stable for this mount; refreshes call it explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const result = (await syncPositions()) as {
        added: number;
        updated: number;
        removed: number;
        skipped_manual?: number;
      };
      toast.success(
        `Synced from Kite — ${result.added} added, ${result.updated} updated, ${result.removed} removed` +
        (result.skipped_manual ? `; ${result.skipped_manual} manual position(s) preserved` : "")
      );
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kite sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (p: Position) => {
    setEditing(p);
    setForm({
      tradingsymbol: p.tradingsymbol,
      exchange: p.exchange || "NSE",
      quantity: String(p.quantity ?? ""),
      average_price: String(p.average_price ?? ""),
      last_price: p.last_price != null ? String(p.last_price) : "",
      notes: p.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const quantity = Number(form.quantity);
    const averagePrice = Number(form.average_price);
    if (!editing && !form.tradingsymbol.trim()) {
      toast.error("Symbol is required");
      return;
    }
    if (!quantity || quantity <= 0 || !averagePrice || averagePrice <= 0) {
      toast.error("Quantity and average price must be greater than zero");
      return;
    }
    setSaving(true);
    try {
      const lastPrice = form.last_price.trim() ? Number(form.last_price) : null;
      if (editing) {
        await updatePosition(editing.exchange, editing.tradingsymbol, {
          quantity,
          average_price: averagePrice,
          last_price: lastPrice,
          notes: form.notes.trim() || null,
        });
        toast.success(`${editing.tradingsymbol} updated`);
      } else {
        await addPosition({
          tradingsymbol: form.tradingsymbol.trim().toUpperCase(),
          exchange: form.exchange.trim().toUpperCase() || "NSE",
          quantity,
          average_price: averagePrice,
          last_price: lastPrice,
          notes: form.notes.trim() || null,
        });
        toast.success(`${form.tradingsymbol.trim().toUpperCase()} added`);
      }
      setDialogOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save position");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Position) => {
    if (!window.confirm(`Delete ${p.tradingsymbol} (${p.exchange}) from positions?`)) return;
    setDeleting(p.tradingsymbol);
    try {
      await deletePosition(p.exchange, p.tradingsymbol);
      toast.success(`${p.tradingsymbol} removed`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete position");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading positions...
        </CardContent>
      </Card>
    );
  }

  const summary = view?.summary;
  const positions = view?.positions || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">Positions</h2>
          <span className="text-xs text-muted-foreground">
            Local store · last synced {formatSyncTime(view?.last_sync || null)}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={openAdd}>
            <Plus className="h-3 w-3 mr-1" /> Add Position
          </Button>
          <Button size="sm" onClick={handleSync} disabled={!kiteConnected || syncing}>
            {syncing ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Sync from Kite
          </Button>
        </div>
      </div>

      {!kiteConnected && (
        <p className="text-xs text-muted-foreground">
          Kite is not connected for today — sync is disabled, but your stored positions remain available below.
        </p>
      )}

      {summary && summary.total_positions > 0 && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Current Value</p>
              <p className="text-2xl font-bold">{money(summary.total_current)}</p>
              <p className="text-xs text-muted-foreground">
                {summary.total_positions} positions ({summary.kite_count} kite, {summary.manual_count} manual)
              </p>
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
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Avg</TableHead>
                <TableHead className="text-right">LTP</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right">Alloc</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-10 text-muted-foreground">
                    No positions stored yet.
                    {kiteConnected ? " Sync from Kite to import your holdings." : " Add one manually or connect Kite to sync."}
                  </TableCell>
                </TableRow>
              ) : (
                positions.map((p) => (
                  <TableRow key={`${p.exchange}-${p.tradingsymbol}`}>
                    <TableCell className="font-medium">{p.tradingsymbol}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={p.source === "kite" ? statusColors.info : statusColors.neutral}
                      >
                        {p.source === "kite" ? "KITE" : "MANUAL"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{p.quantity}</TableCell>
                    <TableCell className="text-right">{money(p.average_price)}</TableCell>
                    <TableCell className="text-right">{money(p.last_price)}</TableCell>
                    <TableCell className="text-right">{money(p.current_value)}</TableCell>
                    <TableCell className="text-right">{Number(p.allocation_pct || 0).toFixed(1)}%</TableCell>
                    <TableCell className={`text-right ${pnlClass(p.pnl)}`}>
                      {money(p.pnl)}
                      <div className="text-[10px]">{pct(p.pnl_pct)}</div>
                    </TableCell>
                    <TableCell className="max-w-40 truncate text-xs text-muted-foreground" title={p.notes || ""}>
                      {p.notes || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-xs" onClick={() => openEdit(p)} title="Edit">
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => handleDelete(p)}
                          disabled={deleting === p.tradingsymbol}
                          title="Delete"
                        >
                          {deleting === p.tradingsymbol ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.tradingsymbol}` : "Add Position"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Update quantity, average price, last price, or notes."
                : "Track a position manually. It will not be affected by Kite sync."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {!editing && (
              <div className="grid grid-cols-[1fr_100px] gap-3">
                <Input
                  placeholder="Symbol (e.g. RELIANCE)"
                  value={form.tradingsymbol}
                  onChange={(e) => setForm({ ...form, tradingsymbol: e.target.value.toUpperCase() })}
                />
                <Input
                  placeholder="NSE"
                  value={form.exchange}
                  onChange={(e) => setForm({ ...form, exchange: e.target.value.toUpperCase() })}
                />
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <Input
                placeholder="Quantity"
                type="number"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
              />
              <Input
                placeholder="Avg price"
                type="number"
                value={form.average_price}
                onChange={(e) => setForm({ ...form, average_price: e.target.value })}
              />
              <Input
                placeholder="LTP (optional)"
                type="number"
                value={form.last_price}
                onChange={(e) => setForm({ ...form, last_price: e.target.value })}
              />
            </div>
            <Input
              placeholder="Notes (optional)"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
              {editing ? "Save Changes" : "Add Position"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
