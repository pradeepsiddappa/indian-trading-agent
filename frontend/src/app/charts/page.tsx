"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTheme } from "next-themes";
import { getChartData } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { HelpSection } from "@/components/HelpSection";
import { chartsHelp } from "@/lib/help-content";

const periods = ["1mo", "3mo", "6mo", "1y", "2y"];

function getChartOptions(isDark: boolean) {
  const textColor = isDark ? "#e5e5e5" : "#333";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const borderColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
  return { textColor, gridColor, borderColor };
}

export default function ChartsPage() {
  const { resolvedTheme } = useTheme();
  const [ticker, setTicker] = useState("RELIANCE");
  const [period, setPeriod] = useState("3mo");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<any>(null);
  const disposed = useRef(false);

  const loadChart = useCallback(async (symbol?: string) => {
    const t = symbol || ticker;
    if (!t.trim()) return;
    setLoading(true);
    try {
      const result: any = await getChartData(t.trim(), period);
      setData(result.data || []);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [ticker, period]);

  useEffect(() => {
    loadChart();
  }, [period]);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    disposed.current = false;

    // Cleanup previous
    if (chartInstance.current) {
      try { chartInstance.current.remove(); } catch {}
      chartInstance.current = null;
    }

    // Dynamic import to avoid SSR issues
    let chart: any = null;

    (async () => {
      const lc = await import("lightweight-charts");

      if (disposed.current || !chartRef.current) return;

      const isDark = resolvedTheme === "dark";
      const { textColor, gridColor, borderColor } = getChartOptions(isDark);

      chart = lc.createChart(chartRef.current, {
        layout: {
          background: { type: lc.ColorType.Solid, color: "transparent" },
          textColor,
        },
        grid: {
          vertLines: { color: gridColor },
          horzLines: { color: gridColor },
        },
        width: chartRef.current.clientWidth,
        height: 500,
        crosshair: { mode: 0 },
        timeScale: { borderColor },
        rightPriceScale: { borderColor },
      });

      if (disposed.current) {
        try { chart.remove(); } catch {}
        return;
      }

      const candleSeries = chart.addSeries(lc.CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderDownColor: "#ef4444",
        borderUpColor: "#22c55e",
        wickDownColor: "#ef4444",
        wickUpColor: "#22c55e",
      });

      candleSeries.setData(
        data.map((d: any) => ({
          time: d.time,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }))
      );

      const volumeSeries = chart.addSeries(lc.HistogramSeries, {
        color: "#3b82f680",
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
      });

      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      volumeSeries.setData(
        data.map((d: any) => ({
          time: d.time,
          value: d.volume,
          color: d.close >= d.open ? "#22c55e40" : "#ef444440",
        }))
      );

      chart.timeScale().fitContent();
      chartInstance.current = chart;
    })();

    const handleResize = () => {
      if (chartInstance.current && chartRef.current) {
        try { chartInstance.current.applyOptions({ width: chartRef.current.clientWidth }); } catch {}
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      disposed.current = true;
      window.removeEventListener("resize", handleResize);
      if (chartInstance.current) {
        try { chartInstance.current.remove(); } catch {}
        chartInstance.current = null;
      }
      if (chart && chart !== chartInstance.current) {
        try { chart.remove(); } catch {}
      }
    };
  }, [data, resolvedTheme]);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Charts</h1>
        <p className="text-sm text-muted-foreground">Interactive candlestick charts for NSE stocks</p>
      </div>

      <div className="flex gap-3 items-end">
        <div className="w-64">
          <Input
            placeholder="Enter ticker (e.g., RELIANCE)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadChart()}
            className="font-sans"
          />
        </div>
        <Button onClick={() => loadChart()} disabled={loading}>
          {loading ? "Loading..." : "Load"}
        </Button>
        <div className="flex gap-1 ml-4">
          {periods.map((p) => (
            <Button
              key={p}
              variant={period === p ? "default" : "outline"}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div
            ref={chartRef}
            className="w-full"
            style={{ minHeight: 500, display: data.length > 0 ? "block" : "none" }}
          />
          {data.length === 0 && (
            <div className="h-[500px] flex items-center justify-center text-muted-foreground">
              {loading ? "Loading chart data..." : "Enter a ticker and click Load to view chart"}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Attribution required by the TradingView Lightweight Charts license */}
      <p className="text-xs text-muted-foreground">
        Charts powered by{" "}
        <a
          href="https://www.tradingview.com/lightweight-charts/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-foreground"
        >
          TradingView Lightweight Charts™
        </a>
      </p>

      {/* Help */}
      <HelpSection title="How to Read Charts" items={chartsHelp} />
    </div>
  );
}
