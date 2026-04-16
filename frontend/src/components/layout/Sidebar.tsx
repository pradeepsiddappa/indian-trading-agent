"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Sparkles,
  Radar,
  Target,
  Search,
  CandlestickChart,
  Award,
  FlaskConical,
  History,
  Settings,
  TrendingUp,
  Newspaper,
  Brain,
} from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: any;
  hint?: string;
};

type NavGroup = {
  title?: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    items: [
      { href: "/", label: "Today", icon: Home, hint: "Your daily workflow" },
    ],
  },
  {
    title: "DISCOVER",
    items: [
      { href: "/recommendations", label: "Top Picks", icon: Sparkles, hint: "AI-free recommendations" },
      { href: "/scanner", label: "Market Scan", icon: Radar, hint: "Gap / Volume / Breakout" },
      { href: "/strategies", label: "Strategies", icon: Target, hint: "S/R, Cyclical patterns" },
      { href: "/news", label: "News Feed", icon: Newspaper, hint: "RSS + customizable" },
    ],
  },
  {
    title: "ANALYZE",
    items: [
      { href: "/analysis", label: "Deep Analysis", icon: Search, hint: "AI-powered (paid)" },
      { href: "/charts", label: "Charts", icon: CandlestickChart, hint: "Candlestick charts" },
    ],
  },
  {
    title: "VALIDATE",
    items: [
      { href: "/performance", label: "Performance", icon: Award, hint: "Strategy win rates" },
      { href: "/simulation", label: "Simulation", icon: FlaskConical, hint: "Paper trade + backtest" },
      { href: "/insights", label: "Learning Insights", icon: Brain, hint: "What works for YOU" },
      { href: "/backtest", label: "AI Backtest", icon: FlaskConical, hint: "AI on past dates (paid)" },
      { href: "/history", label: "My Trades", icon: History, hint: "Real trades & P&L" },
    ],
  },
  {
    items: [
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-full w-64 bg-card border-r border-border flex flex-col z-50">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-green-500" />
          <div>
            <h1 className="font-bold text-lg">Trading Agent</h1>
            <p className="text-xs text-muted-foreground">NSE/BSE - Indian Market</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-4 overflow-y-auto">
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.title && (
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-3 mb-1.5">
                {group.title}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors group ${
                      isActive
                        ? "bg-accent text-accent-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    }`}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div>{item.label}</div>
                      {item.hint && !isActive && (
                        <div className="text-[10px] text-muted-foreground/70 group-hover:text-muted-foreground truncate">
                          {item.hint}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-border">
        <div className="text-[10px] text-muted-foreground">
          <p>Powered by Claude + LangGraph</p>
          <p className="mt-0.5">Data: yfinance (NSE)</p>
        </div>
      </div>
    </aside>
  );
}
