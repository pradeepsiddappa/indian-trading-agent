"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getLLMSettings,
  saveLLMSettings,
  getProviders,
  getApiKeys,
  saveApiKey,
  deleteApiKey,
  testApiKey,
  getOllamaModels,
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Cpu,
  Eye,
  EyeOff,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { statusColors, splitStatusColor } from "@/lib/status-colors";

type Provider = {
  name: string;
  requires_key?: boolean;
  key_format?: string | null;
  signup_url?: string;
  note?: string;
  models_deep?: string[];
  models_quick?: string[];
};

type LLMConfig = { llm_provider: string; deep_think_llm: string; quick_think_llm: string };
type ModelSel = { deep: string; quick: string };
type OllamaState = { reachable: boolean; models: string[]; error?: string; loading: boolean };

export function LLMSettings() {
  const [loading, setLoading] = useState(true);
  const [providers, setProviders] = useState<Record<string, Provider>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, any>>({});
  const [saved, setSaved] = useState<LLMConfig>({ llm_provider: "", deep_think_llm: "", quick_think_llm: "" });
  const [selected, setSelected] = useState<string>("");
  const [models, setModels] = useState<Record<string, ModelSel>>({});
  const [ollama, setOllama] = useState<OllamaState>({ reachable: false, models: [], loading: false });

  const [keyInput, setKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testRes, setTestRes] = useState<{ ok: boolean; msg: string } | null>(null);

  const requiresKey = (id: string) => providers[id]?.requires_key !== false;
  const hasKey = (id: string) => !requiresKey(id) || !!apiKeys[id]?.configured;

  const initModels = (id: string, p: Provider, cfg: LLMConfig): ModelSel => {
    if (id === cfg.llm_provider) return { deep: cfg.deep_think_llm, quick: cfg.quick_think_llm };
    return { deep: p.models_deep?.[0] || "", quick: p.models_quick?.[0] || "" };
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, provs, keys]: any[] = await Promise.all([getLLMSettings(), getProviders(), getApiKeys()]);
      setSaved(cfg);
      setProviders(provs);
      setApiKeys(keys);
      setSelected(cfg.llm_provider);
      const m: Record<string, ModelSel> = {};
      Object.entries(provs).forEach(([id, p]: any) => {
        m[id] = initModels(id, p, cfg);
      });
      setModels(m);
    } catch {
      toast.error("Failed to load LLM settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const refreshOllama = useCallback(async () => {
    setOllama((o) => ({ ...o, loading: true }));
    try {
      const r: any = await getOllamaModels();
      setOllama({ reachable: !!r.reachable, models: r.models || [], error: r.error, loading: false });
      if (r.reachable && r.models?.length) {
        setModels((m) => {
          const cur = m["ollama"];
          if (cur && r.models.includes(cur.deep) && r.models.includes(cur.quick)) return m;
          return { ...m, ollama: { deep: r.models[0], quick: r.models[0] } };
        });
      }
    } catch {
      setOllama({ reachable: false, models: [], error: "fetch failed", loading: false });
    }
  }, []);

  useEffect(() => {
    if (providers["ollama"]) refreshOllama();
  }, [providers, refreshOllama]);

  const def = saved.llm_provider;
  const cur = providers[selected];
  const isDefault = selected === def;
  const sel = models[selected] || { deep: "", quick: "" };
  const modelsDirty =
    isDefault && (sel.deep !== saved.deep_think_llm || sel.quick !== saved.quick_think_llm);

  const optionsFor = (kind: "deep" | "quick"): string[] => {
    let base: string[];
    if (selected === "ollama" && ollama.reachable && ollama.models.length) base = ollama.models;
    else base = (kind === "deep" ? cur?.models_deep : cur?.models_quick) || [];
    const current = kind === "deep" ? sel.deep : sel.quick;
    return Array.from(new Set([current, ...base].filter(Boolean)));
  };

  const setModel = (kind: "deep" | "quick", val: string) =>
    setModels((m) => ({ ...m, [selected]: { ...m[selected], [kind]: val } }));

  const persist = async (msg: string) => {
    setBusy(true);
    try {
      await saveLLMSettings({
        llm_provider: selected,
        deep_think_llm: sel.deep,
        quick_think_llm: sel.quick,
      });
      setSaved({ llm_provider: selected, deep_think_llm: sel.deep, quick_think_llm: sel.quick });
      toast.success(msg);
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const selectProvider = (id: string) => {
    setSelected(id);
    setKeyInput("");
    setShowKey(false);
    setTestRes(null);
  };

  const saveKey = async () => {
    if (!keyInput.trim()) return;
    setBusy(true);
    try {
      await saveApiKey(selected, keyInput.trim());
      toast.success(`${cur?.name} API key saved`);
      setKeyInput("");
      setShowKey(false);
      setTestRes(null);
      setApiKeys((await getApiKeys()) as any);
    } catch (e: any) {
      toast.error(e.message || "Failed to save key");
    } finally {
      setBusy(false);
    }
  };

  const removeKey = async () => {
    if (isDefault) {
      toast.error("Set another provider as default before removing this key.");
      return;
    }
    if (!confirm(`Remove ${cur?.name} API key?`)) return;
    setBusy(true);
    try {
      await deleteApiKey(selected);
      toast.success("API key removed");
      setApiKeys((await getApiKeys()) as any);
    } catch (e: any) {
      toast.error(e.message || "Failed to remove key");
    } finally {
      setBusy(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestRes(null);
    try {
      const r: any = await testApiKey(selected, keyInput.trim() || undefined);
      setTestRes({ ok: r.ok, msg: r.ok ? r.message : r.error });
      r.ok ? toast.success(`${cur?.name} works!`) : toast.error(`Test failed: ${r.error}`);
    } catch (e: any) {
      setTestRes({ ok: false, msg: e.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-muted-foreground text-sm">Loading...</CardContent>
      </Card>
    );
  }

  const keyMeta = apiKeys[selected];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Cpu className="h-5 w-5" />
          Models &amp; Keys
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Each provider shows its key status; the <span className="font-semibold text-foreground">✓ Default</span> tag marks
          the one that runs analyses. Select any provider to add a key, pick models, or set it as default.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Active default bar */}
        <div className="flex items-center gap-2.5 rounded-lg bg-slate-900 text-slate-100 px-3.5 py-2.5 text-xs">
          <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_0_3px_rgba(34,197,94,0.22)] flex-none" />
          <span>
            Active default: <span className="font-semibold text-white">{providers[def]?.name || def}</span>{" "}
            <span className="font-mono text-[11px] text-sky-300">
              {saved.deep_think_llm} + {saved.quick_think_llm}
            </span>
          </span>
        </div>

        {/* Provider chips */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {Object.entries(providers).map(([id, p]: any) => {
            const isSel = id === selected;
            const local = p.requires_key === false;
            const keyed = local || apiKeys[id]?.configured;
            return (
              <button
                key={id}
                onClick={() => selectProvider(id)}
                className={`relative rounded-xl border p-3 text-left transition-colors ${
                  isSel ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/30"
                }`}
              >
                <div className="flex items-center justify-between gap-1.5">
                  <span className="text-[13px] font-semibold">{p.name}</span>
                  {local ? (
                    <Badge variant="outline" className={`${splitStatusColor(statusColors.info).bg} ${splitStatusColor(statusColors.info).text} ${splitStatusColor(statusColors.info).border} text-[9px] px-1.5`}>Local</Badge>
                  ) : keyed ? (
                    <Badge variant="outline" className={`${splitStatusColor(statusColors.bullish).bg} ${splitStatusColor(statusColors.bullish).text} ${splitStatusColor(statusColors.bullish).border} text-[9px] px-1.5`}>Key set</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[9px] px-1.5">No key</Badge>
                  )}
                </div>
                {id === def && (
                  <span className="mt-2 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wide text-primary-foreground">
                    ✓ Default
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Detail panel for the selected provider */}
        {cur && (
          <div className="rounded-xl border border-border bg-muted/30">
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold">{cur.name}</span>
                {requiresKey(selected) ? (
                  hasKey(selected) ? (
                    <Badge variant="outline" className={`${splitStatusColor(statusColors.bullish).bg} ${splitStatusColor(statusColors.bullish).text} ${splitStatusColor(statusColors.bullish).border} text-[10px]`}>Key set</Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px]">No key</Badge>
                  )
                ) : (
                  <Badge variant="outline" className={`${splitStatusColor(statusColors.info).bg} ${splitStatusColor(statusColors.info).text} ${splitStatusColor(statusColors.info).border} text-[10px]`}>Local</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isDefault ? (
                  <>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> This is your default
                    </span>
                    {modelsDirty && (
                      <Button size="sm" onClick={() => persist("Models updated")} disabled={busy}>
                        {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Save models
                      </Button>
                    )}
                  </>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => persist(`${cur.name} is now your default`)}
                    disabled={!hasKey(selected) || busy}
                    title={hasKey(selected) ? "" : "Add a key first"}
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Set as default
                  </Button>
                )}
              </div>
            </div>

            <div className="p-4 space-y-3">
              {/* Key entry (cloud) or local note (Ollama) */}
              {requiresKey(selected) ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold text-slate-700">API key</label>
                    {cur.signup_url && !hasKey(selected) && (
                      <a href={cur.signup_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-blue-600 hover:underline flex items-center gap-1">
                        Get key <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  {keyMeta?.configured && keyMeta?.masked && (
                    <p className="text-[11px] font-mono text-muted-foreground mb-1.5">
                      {keyMeta.masked} <span className="text-muted-foreground/70">· via {keyMeta.source === "ui" ? "UI" : ".env"}</span>
                    </p>
                  )}
                  <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                      <Input
                        type={showKey ? "text" : "password"}
                        placeholder={cur.key_format || "Enter API key..."}
                        value={keyInput}
                        onChange={(e) => setKeyInput(e.target.value)}
                        className="pr-9 font-sans"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button size="sm" onClick={saveKey} disabled={!keyInput.trim() || busy}>
                      {hasKey(selected) ? "Update" : "Save key"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={runTest} disabled={testing || (!hasKey(selected) && !keyInput.trim())}>
                      {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
                    </Button>
                    {keyMeta?.configured && keyMeta?.source === "ui" && (
                      <Button size="sm" variant="ghost" onClick={removeKey} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1.5">Stored in SQLite, overrides <code className="font-mono">.env</code>.</p>
                  {testRes && (
                    <div className={`mt-1.5 text-[11px] flex items-start gap-1 ${testRes.ok ? "text-green-700" : "text-red-700"}`}>
                      {testRes.ok ? <CheckCircle2 className="h-3 w-3 mt-0.5 flex-shrink-0" /> : <XCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />}
                      <span>{testRes.msg}</span>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className={`flex items-center gap-2 rounded-lg ${statusColors.info} px-3 py-2.5 text-xs`}>
                    🖥 Runs locally — <b>no API key, no cost</b>. Models come from your machine.
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {ollama.loading ? (
                      <Badge variant="outline" className="text-[11px]"><Loader2 className="h-3 w-3 animate-spin mr-1" /> checking…</Badge>
                    ) : ollama.reachable ? (
                      <Badge variant="outline" className={`${splitStatusColor(statusColors.bullish).bg} ${splitStatusColor(statusColors.bullish).text} ${splitStatusColor(statusColors.bullish).border} text-[11px]`}>✓ Ollama running · {ollama.models.length} models</Badge>
                    ) : (
                      <Badge variant="outline" className={`${splitStatusColor(statusColors.bearish).bg} ${splitStatusColor(statusColors.bearish).text} ${splitStatusColor(statusColors.bearish).border} text-[11px]`}>✗ Not reachable</Badge>
                    )}
                    <Button size="sm" variant="outline" onClick={refreshOllama} disabled={ollama.loading}>
                      <RefreshCw className={`h-3 w-3 ${ollama.loading ? "animate-spin" : ""}`} />
                    </Button>
                    <span className="font-mono text-[11px] text-muted-foreground">localhost:11434/api/tags</span>
                  </div>
                  {!ollama.loading && !ollama.reachable && (
                    <div className={`text-[11px] ${statusColors.bearish} rounded-lg px-3 py-2`}>
                      ⚠ Start it with <code className="font-mono">ollama serve</code>. Showing fallback names; analyses won&apos;t run until it&apos;s up.
                    </div>
                  )}
                </>
              )}

              {/* Model selectors */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 mb-1 block">
                    Deep think <span className="text-muted-foreground font-normal">(research + PM)</span>
                  </label>
                  <select
                    value={sel.deep}
                    onChange={(e) => setModel("deep", e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
                  >
                    {optionsFor("deep").map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 mb-1 block">
                    Quick think <span className="text-muted-foreground font-normal">(analysts + debates)</span>
                  </label>
                  <select
                    value={sel.quick}
                    onChange={(e) => setModel("quick", e.target.value)}
                    className="w-full px-3 py-2 rounded-md border border-border bg-background text-sm"
                  >
                    {optionsFor("quick").map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
