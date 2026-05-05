"use client";

import { useEffect, useState } from "react";
import {
  listMemories,
  getMemoryEntries,
  pruneMemory,
  pruneAllMemories,
  deleteMemoryEntry,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HelpSection } from "@/components/HelpSection";
import {
  Loader2,
  RefreshCw,
  Brain,
  Trash2,
  Eye,
  Scissors,
  Sparkles,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

type Stats = {
  name: string;
  total: number;
  active: number;
  decayed: number;
  stale: number;
  never_hit: number;
  oldest_age_days: number | null;
  newest_age_days: number | null;
  avg_decay: number | null;
  total_hits: number;
};

type Entry = {
  index: number;
  situation: string;
  recommendation: string;
  created_at: string | null;
  last_accessed: string | null;
  hit_count: number;
  age_days: number | null;
  decay_factor: number;
};

const helpItems = [
  {
    question: "What is BM25 memory?",
    answer:
      "Each AI agent (Bull, Bear, Trader, Judge, Portfolio Manager) keeps a journal of past situations + lessons. When a new analysis runs, BM25 (a keyword-similarity algorithm) finds the most relevant past lessons and injects them into the prompt as context.\n\nThe LLM itself isn't fine-tuned. The 'learning' is purely retrieval — past lessons influence future decisions through context injection, not weight updates.",
  },
  {
    question: "Why prune?",
    answer:
      "Markets shift. A lesson learned in a 2024 bull market ('buy IT on dollar weakness') may be wrong in 2026. BM25 alone has no concept of 'this is stale' — it would happily retrieve a 5-year-old lesson if the keywords match.\n\nWith Tier 4.2, every retrieval applies an age-based decay multiplier. Old entries get downweighted automatically. Pruning physically removes them when decay drops too low or they're never retrieved.",
  },
  {
    question: "How does decay work?",
    answer:
      "Each entry's BM25 score is multiplied by a decay factor before ranking:\n\n  • Age ≤ 30 days → factor 1.00 (full weight)\n  • Age 30–365 days → linear decay from 1.00 → 0.20\n  • Age > 365 days → factor 0.20 (floor)\n\nFrecency bonus: entries accessed in the last 7 days get a 1.25× bonus, so frequently-useful old lessons stay relevant longer than truly stale ones.",
  },
  {
    question: "What pruning criteria should I use?",
    answer:
      "  • max_age_days: hard cutoff (e.g., 540 = drop entries older than 18 months)\n  • min_hits: drop entries that have been retrieved fewer than N times AND are past the 30-day grace period (catches lessons that turned out to be irrelevant)\n  • min_decay: drop entries whose current decay is below this floor (e.g., 0.30)\n\nStart conservatively. Run dry_run first to preview. Pruning is irreversible.",
  },
  {
    question: "What if I have no memories?",
    answer:
      "Memories are only created when you run AI Deep Analysis on a closed trade and check 'Teach the agent' in the P&L dialog. Visit /history → Log P&L → tick 'Teach' to populate them. Without that, the BM25 memory stays empty and this admin page is just informational.",
  },
];

const AGENT_DESCRIPTIONS: Record<string, string> = {
  bull_memory: "Bull Researcher — past bullish takes",
  bear_memory: "Bear Researcher — past bearish takes",
  trader_memory: "Trader — past entry/exit/target lessons",
  invest_judge_memory: "Research Manager — past synthesis decisions",
  portfolio_manager_memory: "Portfolio Manager — past final-call lessons",
};

function fmtAge(days: number | null): string {
  if (days === null || days === undefined) return "—";
  if (days < 1) return "<1d";
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

export default function MemoryAdminPage() {
  const [stats, setStats] = useState<Stats[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pruneAge, setPruneAge] = useState<number | "">("");
  const [pruneMinHits, setPruneMinHits] = useState<number | "">("");
  const [pruneMinDecay, setPruneMinDecay] = useState<number | "">("");

  const loadStats = async () => {
    setLoading(true);
    try {
      const r: any = await listMemories();
      setStats(r.memories);
    } catch (e: any) {
      toast.error(e.message || "Failed to load memory stats");
    }
    setLoading(false);
  };

  const loadEntries = async (name: string) => {
    setSelected(name);
    setEntries([]);
    try {
      const r: any = await getMemoryEntries(name);
      setEntries(r.entries || []);
    } catch (e: any) {
      toast.error(e.message || "Failed to load entries");
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const buildPruneArgs = (dry_run: boolean) => ({
    max_age_days: typeof pruneAge === "number" ? pruneAge : undefined,
    min_hits: typeof pruneMinHits === "number" ? pruneMinHits : undefined,
    min_decay: typeof pruneMinDecay === "number" ? pruneMinDecay : undefined,
    dry_run,
  });

  const runPruneAll = async (dry_run: boolean) => {
    const args = buildPruneArgs(dry_run);
    if (!args.max_age_days && !args.min_hits && !args.min_decay) {
      toast.error("Set at least one pruning criterion.");
      return;
    }
    if (!dry_run && !confirm("This will permanently delete entries. Continue?")) return;
    setBusy(true);
    try {
      const r: any = await pruneAllMemories(args);
      const total = Object.values(r.results || {}).reduce<number>(
        (acc: number, v: any) => acc + (v?.pruned_count ?? 0),
        0,
      );
      toast.success(
        dry_run
          ? `${total} entries would be pruned (preview only)`
          : `Pruned ${total} entries across ${Object.keys(r.results).length} memories`,
      );
      await loadStats();
      if (selected) await loadEntries(selected);
    } catch (e: any) {
      toast.error(e.message || "Prune failed");
    }
    setBusy(false);
  };

  const runDeleteEntry = async (idx: number) => {
    if (!selected) return;
    if (!confirm(`Delete entry #${idx} from ${selected}?`)) return;
    try {
      await deleteMemoryEntry(selected, idx);
      toast.success("Entry deleted");
      await loadStats();
      await loadEntries(selected);
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  };

  const totalEntries = stats?.reduce((acc, s) => acc + s.total, 0) ?? 0;

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="h-6 w-6 text-violet-600" />
            Agent Memory Admin
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Inspect, decay, and prune the BM25 memories that drive the multi-agent pipeline.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}>
          {loading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
          Refresh
        </Button>
      </div>

      {/* How to use callout */}
      <Card className="border-violet-200 bg-violet-50/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-lg bg-violet-100 flex-shrink-0">
              <Brain className="h-5 w-5 text-violet-700" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm mb-2">How to use this page</h3>
              <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                <li><span className="text-foreground font-medium">Decay is automatic:</span> Every retrieval already applies the age-based multiplier. You don't need to do anything for that part.</li>
                <li><span className="text-foreground font-medium">Inspect first:</span> Click an agent card to see its entries, ages, decay factors, and hit counts before pruning anything.</li>
                <li><span className="text-foreground font-medium">Look for stale entries:</span> Rows with low decay (red) AND zero hits are the best prune candidates — old lessons that never matched anything anyway.</li>
                <li><span className="text-foreground font-medium">Use dry-run first:</span> Set criteria, click 'Preview', see what would be pruned. Only commit when the preview looks right.</li>
                <li><span className="text-foreground font-medium">Pruning trigger ideas:</span> After a market regime shift (Bull → Bear), prune by min_decay 0.4 to drop weak old lessons. Or every 6 months prune by max_age_days 540.</li>
                <li><span className="text-foreground font-medium">Need data:</span> Memories only populate when you run AI Deep Analysis + log P&L with 'Teach the agent' checked. Without that this page stays empty.</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Per-agent stats grid */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Agent Memories ({totalEntries} total entries)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats?.map((s) => (
              <button
                key={s.name}
                onClick={() => loadEntries(s.name)}
                className={`text-left border rounded-lg p-3 hover:bg-muted/30 transition-colors ${
                  selected === s.name ? "border-violet-400 bg-violet-50/40" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-sm">{s.name.replace("_memory", "")}</span>
                  <Badge variant="outline" className="text-xs">{s.total}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{AGENT_DESCRIPTIONS[s.name] || s.name}</p>
                {s.total > 0 ? (
                  <div className="text-xs space-y-0.5">
                    <div className="flex justify-between"><span>Active</span><span className="text-green-700">{s.active}</span></div>
                    <div className="flex justify-between"><span>Decayed</span><span className="text-amber-700">{s.decayed}</span></div>
                    <div className="flex justify-between"><span>Stale</span><span className="text-red-700">{s.stale}</span></div>
                    <div className="flex justify-between"><span>Never hit</span><span className="text-muted-foreground">{s.never_hit}</span></div>
                    <div className="flex justify-between"><span>Avg decay</span><span>{s.avg_decay != null ? s.avg_decay.toFixed(2) : "—"}</span></div>
                    <div className="flex justify-between"><span>Oldest</span><span>{fmtAge(s.oldest_age_days)}</span></div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">empty</p>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Pruning controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Scissors className="h-4 w-4" />
            Prune
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Set one or more criteria. Always run Preview first.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              <span className="block text-xs text-muted-foreground mb-1">Max age (days)</span>
              <input
                type="number"
                value={pruneAge}
                onChange={(e) => setPruneAge(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full border rounded-md px-2 py-1.5 text-sm"
                placeholder="e.g. 540 = 18 months"
                min={0}
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-muted-foreground mb-1">Min hits (for entries past 30d grace)</span>
              <input
                type="number"
                value={pruneMinHits}
                onChange={(e) => setPruneMinHits(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full border rounded-md px-2 py-1.5 text-sm"
                placeholder="e.g. 1 = drop never-hit"
                min={0}
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs text-muted-foreground mb-1">Min decay factor</span>
              <input
                type="number"
                value={pruneMinDecay}
                onChange={(e) => setPruneMinDecay(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full border rounded-md px-2 py-1.5 text-sm"
                placeholder="e.g. 0.30"
                min={0}
                max={1}
                step={0.05}
              />
            </label>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t">
            <Button onClick={() => runPruneAll(true)} disabled={busy} size="sm" variant="outline">
              {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
              Preview (dry-run)
            </Button>
            <Button onClick={() => runPruneAll(false)} disabled={busy} size="sm">
              {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Scissors className="h-3 w-3 mr-1" />}
              Prune All Memories
            </Button>
            <span className="text-xs text-muted-foreground ml-auto">
              <AlertTriangle className="h-3 w-3 inline mr-1 text-amber-600" />
              Pruning is irreversible
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Entries inspector */}
      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Entries — {selected.replace("_memory", "")} ({entries.length})</span>
              <Button size="sm" variant="outline" onClick={() => setSelected(null)}>Close</Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-[600px]">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 border-y sticky top-0">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-2 py-2 font-medium">Situation (preview)</th>
                    <th className="px-2 py-2 font-medium">Lesson (preview)</th>
                    <th className="px-2 py-2 font-medium text-right">Age</th>
                    <th className="px-2 py-2 font-medium text-right">Decay</th>
                    <th className="px-2 py-2 font-medium text-right">Hits</th>
                    <th className="px-3 py-2 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center py-6 text-muted-foreground">
                        No entries — agent hasn't reflected on any trades yet.
                      </td>
                    </tr>
                  )}
                  {entries.map((e) => (
                    <tr key={e.index} className="border-b hover:bg-muted/30 align-top">
                      <td className="px-3 py-2 tabular-nums text-muted-foreground">{e.index}</td>
                      <td className="px-2 py-2 max-w-md">
                        <span className="line-clamp-2">{e.situation}</span>
                      </td>
                      <td className="px-2 py-2 max-w-md">
                        <span className="line-clamp-2 text-muted-foreground">{e.recommendation}</span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{fmtAge(e.age_days)}</td>
                      <td className={`px-2 py-2 text-right tabular-nums whitespace-nowrap ${
                        e.decay_factor >= 0.95 ? "text-green-700" :
                        e.decay_factor >= 0.5 ? "text-amber-700" :
                        "text-red-700"
                      }`}>
                        {e.decay_factor.toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{e.hit_count}</td>
                      <td className="px-3 py-2">
                        <Button size="sm" variant="ghost" onClick={() => runDeleteEntry(e.index)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <HelpSection items={helpItems} />
    </div>
  );
}
