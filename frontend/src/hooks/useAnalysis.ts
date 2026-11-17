"use client";

import { useState, useCallback } from "react";
import { runAnalysis, connectAnalysisWS } from "@/lib/api";
import type { WSEvent } from "@/lib/types";

interface AnalysisState {
  taskId: string | null;
  status: "idle" | "running" | "completed" | "error";
  reports: Record<string, string>;
  debates: { bull: string; bear: string };
  riskDebates: { aggressive: string; conservative: string; neutral: string };
  signal: string | null;
  error: string | null;
  duration: number | null;
}

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>({
    taskId: null,
    status: "idle",
    reports: {},
    debates: { bull: "", bear: "" },
    riskDebates: { aggressive: "", conservative: "", neutral: "" },
    signal: null,
    error: null,
    duration: null,
  });

  const start = useCallback(async (ticker: string, tradeDate: string) => {
    setState({
      taskId: null,
      status: "running",
      reports: {},
      debates: { bull: "", bear: "" },
      riskDebates: { aggressive: "", conservative: "", neutral: "" },
      signal: null,
      error: null,
      duration: null,
    });

    try {
      const result: any = await runAnalysis({ ticker, trade_date: tradeDate });
      const taskId = result.task_id;

      setState((s) => ({ ...s, taskId }));

      const ws = connectAnalysisWS(taskId, (event: WSEvent) => {
        setState((prev) => {
          switch (event.type) {
            case "report":
              return {
                ...prev,
                reports: { ...prev.reports, [event.section!]: event.content! },
              };
            case "debate":
              return {
                ...prev,
                debates: { ...prev.debates, [event.side!]: event.content! },
              };
            case "risk_debate":
              return {
                ...prev,
                riskDebates: { ...prev.riskDebates, [event.side!]: event.content! },
              };
            case "signal":
              return { ...prev, signal: event.decision! };
            case "complete":
              ws.close();
              return { ...prev, status: "completed", duration: event.duration_seconds ?? null };
            case "error":
              ws.close();
              return { ...prev, status: "error", error: event.message ?? "Unknown error" };
            default:
              return prev;
          }
        });
      });
    } catch (e: any) {
      setState((s) => ({ ...s, status: "error", error: e.message }));
    }
  }, []);

  return { ...state, start };
}
