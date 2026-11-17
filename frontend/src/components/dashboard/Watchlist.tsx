"use client";

import { useEffect, useState } from "react";
import { getWatchlist, addToWatchlist, removeFromWatchlist } from "@/lib/api";
import type { WatchlistItem } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, X, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export function Watchlist() {
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [newTicker, setNewTicker] = useState("");
  const [loading, setLoading] = useState(true);

  // Fetches the list; callers that need the spinner set `loading` first.
  const fetchItems = () => {
    getWatchlist()
      .then((data: any) => setItems(data))
      .catch(() => toast.error("Failed to load watchlist"))
      .finally(() => setLoading(false));
  };

  const refresh = () => {
    setLoading(true);
    fetchItems();
  };

  useEffect(() => { fetchItems(); }, []);

  const handleAdd = async () => {
    if (!newTicker.trim()) return;
    try {
      await addToWatchlist(newTicker.trim());
      setNewTicker("");
      refresh();
      toast.success(`Added ${newTicker.toUpperCase()} to watchlist`);
    } catch {
      toast.error("Failed to add ticker");
    }
  };

  const handleRemove = async (ticker: string) => {
    try {
      await removeFromWatchlist(ticker);
      refresh();
    } catch {
      toast.error("Failed to remove ticker");
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Watchlist</CardTitle>
        <div className="flex gap-2 mt-2">
          <Input
            placeholder="Add ticker (e.g., RELIANCE)"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={handleAdd} className="h-8">
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-muted rounded animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            No tickers in watchlist. Add one above.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Ticker</TableHead>
                <TableHead className="text-xs text-right">Price</TableHead>
                <TableHead className="text-xs text-right">Change</TableHead>
                <TableHead className="text-xs w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.ticker}>
                  <TableCell className="py-2">
                    <Link href={`/analysis?ticker=${item.ticker}`} className="hover:underline">
                      <div>
                        <span className="font-medium text-sm">{item.ticker}</span>
                        <span className="text-xs text-muted-foreground block">{item.name}</span>
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right font-sans text-sm py-2">
                    {item.price ? `₹${item.price.toLocaleString()}` : "-"}
                  </TableCell>
                  <TableCell className="text-right py-2">
                    {item.change_percent != null ? (
                      <span className={`text-sm flex items-center justify-end gap-1 ${
                        item.change_percent >= 0 ? "text-green-400" : "text-red-400"
                      }`}>
                        {item.change_percent >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {item.change_percent >= 0 ? "+" : ""}{item.change_percent.toFixed(2)}%
                      </span>
                    ) : "-"}
                  </TableCell>
                  <TableCell className="py-2">
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleRemove(item.ticker)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
