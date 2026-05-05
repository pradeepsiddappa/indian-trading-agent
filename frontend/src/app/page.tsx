"use client";

import { MarketOverview } from "@/components/dashboard/MarketOverview";
import { Watchlist } from "@/components/dashboard/Watchlist";
import { RecentAnalyses } from "@/components/dashboard/RecentAnalyses";
import { TodayPicks } from "@/components/dashboard/TodayPicks";
import { WorkflowGuide } from "@/components/dashboard/WorkflowGuide";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { SectorHeatmap } from "@/components/dashboard/SectorHeatmap";
import { FIIDIIBanner } from "@/components/dashboard/FIIDIIBanner";
import { CalendarBanner } from "@/components/dashboard/CalendarBanner";
import { ConcentrationWidget } from "@/components/dashboard/ConcentrationWidget";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function getDayContext() {
  const hour = new Date().getHours();
  const minute = new Date().getMinutes();
  const totalMin = hour * 60 + minute;
  // IST: pre-market 9:00-9:15, open 9:15-15:30, post 15:30-16:00
  if (totalMin < 9 * 60) return "Market opens at 9:15 AM. Good time to plan your trades.";
  if (totalMin < 9 * 60 + 15) return "Market opens in minutes. Review overnight news and top picks.";
  if (totalMin < 10 * 60 + 30) return "Opening hour — watch for gaps and early breakouts.";
  if (totalMin < 14 * 60) return "Mid-session — most stable period. Good for swing trade entries.";
  if (totalMin < 15 * 60 + 30) return "Closing hour — last chance for intraday trades, plan swing setups.";
  if (totalMin < 16 * 60) return "Market closed. Review today's trades and prep for tomorrow.";
  return "Market closed. Plan tomorrow's trades based on today's top picks.";
}

export default function DashboardPage() {
  return (
    <div className="p-6 space-y-5 max-w-7xl">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold">{getGreeting()}</h1>
        <p className="text-sm text-muted-foreground mt-1">{getDayContext()}</p>
      </div>

      {/* Market Status Bar */}
      <MarketOverview />

      {/* FII/DII Flow Banner */}
      <FIIDIIBanner />

      {/* Calendar / Events Banner */}
      <CalendarBanner />

      {/* Sector Concentration Widget — auto-hides if no open positions */}
      <ConcentrationWidget />

      {/* Today's Top Picks — auto-loaded */}
      <TodayPicks universe="nifty100" />

      {/* Sector Heatmap */}
      <SectorHeatmap />

      {/* Workflow Guide */}
      <WorkflowGuide />

      {/* Watchlist + Recent Analyses side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Watchlist />
        <RecentAnalyses />
      </div>

      {/* Quick Actions */}
      <QuickActions />
    </div>
  );
}
