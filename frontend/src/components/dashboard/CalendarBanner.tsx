"use client";

import { useEffect, useState } from "react";
import { getCalendarToday, getCalendarUpcoming } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  AlertTriangle,
  Building,
  TrendingUp,
  Globe,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-react";

const eventStyles: Record<string, { bg: string; border: string; text: string; icon: any; label: string }> = {
  RBI_POLICY: { bg: "bg-purple-50", border: "border-purple-200", text: "text-purple-800", icon: Building, label: "RBI Policy" },
  BUDGET: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800", icon: AlertTriangle, label: "Union Budget" },
  FOMC: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", icon: Globe, label: "Fed FOMC" },
  FNO_EXPIRY: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800", icon: Calendar, label: "F&O Expiry" },
  earnings: { bg: "bg-green-50", border: "border-green-200", text: "text-green-800", icon: TrendingUp, label: "Earnings" },
};

const impactColors: Record<string, string> = {
  VERY_HIGH: "bg-red-100 text-red-800 border-red-300",
  HIGH: "bg-orange-100 text-orange-800 border-orange-300",
  MEDIUM: "bg-yellow-100 text-yellow-800 border-yellow-300",
  LOW: "bg-gray-100 text-gray-700 border-gray-200",
};

function formatDateRelative(dateStr: string): string {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    if (diffDays <= 7) return `In ${diffDays} days`;
    return target.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return dateStr;
  }
}

export function CalendarBanner() {
  const [today, setToday] = useState<any>(null);
  const [upcoming, setUpcoming] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    Promise.all([getCalendarToday(), getCalendarUpcoming(14)])
      .then(([t, u]: any[]) => {
        setToday(t);
        setUpcoming(u);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return null;
  }

  const todayCount = (today?.market_events?.length || 0) + (today?.earnings?.length || 0);
  const upcomingCount = (upcoming?.market_events?.length || 0) + (upcoming?.earnings?.length || 0);

  if (todayCount === 0 && upcomingCount === 0) {
    return null;  // No events to show, hide banner
  }

  // Today has high-impact event → big warning banner
  const hasHighImpactToday = today?.market_events?.some((e: any) => e.impact === "VERY_HIGH" || e.impact === "HIGH");
  const todayEvents = [
    ...(today?.market_events || []),
    ...(today?.earnings || []).map((e: any) => ({ ...e, type: "earnings", name: e.description })),
  ];

  return (
    <Card className={hasHighImpactToday ? "border-red-300 bg-red-50/50" : "border-blue-200 bg-blue-50/30"}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-white">
              {hasHighImpactToday ? (
                <AlertTriangle className="h-5 w-5 text-red-700" />
              ) : (
                <Calendar className="h-5 w-5 text-blue-700" />
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground">
                {todayCount > 0 ? `${todayCount} event${todayCount > 1 ? "s" : ""} today` : "Upcoming events"}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {todayEvents.length > 0 ? (
                  todayEvents.slice(0, 3).map((e: any, i: number) => {
                    const style = eventStyles[e.type] || eventStyles.earnings;
                    const Icon = style.icon;
                    return (
                      <Badge key={i} variant="outline" className={`${style.text} border-current`}>
                        <Icon className="h-3 w-3 mr-1" />
                        {style.label}
                      </Badge>
                    );
                  })
                ) : (
                  <span className="text-sm font-medium">
                    {upcomingCount} event{upcomingCount > 1 ? "s" : ""} in next 14 days
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Less" : "View all"}
          </Button>
        </div>

        {expanded && (
          <div className="mt-3 pt-3 border-t border-current/10 space-y-3">
            {/* Today's events */}
            {todayEvents.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">TODAY</p>
                <div className="space-y-2">
                  {todayEvents.map((e: any, i: number) => {
                    const style = eventStyles[e.type] || eventStyles.earnings;
                    const Icon = style.icon;
                    return (
                      <div key={i} className={`p-3 rounded-lg ${style.bg} ${style.border} border`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${style.text}`} />
                            <span className={`font-medium ${style.text}`}>{e.name}</span>
                          </div>
                          {e.impact && (
                            <Badge variant="outline" className={impactColors[e.impact]}>
                              {e.impact.replace("_", " ")} IMPACT
                            </Badge>
                          )}
                        </div>
                        {e.description && (
                          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{e.description}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Upcoming */}
            {upcoming && upcomingCount > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">NEXT 14 DAYS</p>
                <div className="space-y-1">
                  {[...(upcoming.market_events || []), ...(upcoming.earnings || []).map((e: any) => ({ ...e, type: "earnings", name: e.description, impact: "MEDIUM" }))]
                    .filter((e: any) => {
                      const eDate = e.date || e.event_date;
                      return eDate !== today?.date;  // exclude today (already shown above)
                    })
                    .sort((a: any, b: any) => (a.date || a.event_date).localeCompare(b.date || b.event_date))
                    .slice(0, 10)
                    .map((e: any, i: number) => {
                      const style = eventStyles[e.type] || eventStyles.earnings;
                      const Icon = style.icon;
                      const dateStr = e.date || e.event_date;
                      return (
                        <div key={i} className={`flex items-center justify-between p-2 rounded ${style.bg} text-sm`}>
                          <div className="flex items-center gap-2">
                            <Icon className={`h-3 w-3 ${style.text}`} />
                            <span className={style.text}>{e.name}</span>
                            {e.ticker && <Badge variant="outline" className="text-xs">{e.ticker}</Badge>}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDateRelative(dateStr)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground italic">
              The Recommendation Engine reduces scores for stocks with imminent events to avoid trading into unpredictable volatility.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
