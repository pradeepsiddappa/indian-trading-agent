/** Shared semantic color tokens with light + dark variants */

export const statusColors = {
  surfaceInset: "bg-white/60 dark:bg-card/60",
  surfacePanel: "!bg-white dark:!bg-card",
  surfaceInsetLight: "bg-white/40 dark:bg-card/40",
  neutral: "!bg-gray-50 text-gray-700 border-gray-200 dark:!bg-muted dark:text-muted-foreground dark:border-border",
  bullish: "!bg-green-50 text-green-800 border-green-200 dark:!bg-green-950/50 dark:text-green-300 dark:border-green-800",
  bearish: "!bg-red-50 text-red-800 border-red-200 dark:!bg-red-950/50 dark:text-red-300 dark:border-red-800",
  caution: "!bg-yellow-50 text-yellow-800 border-yellow-200 dark:!bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-800",
  info: "!bg-blue-50 text-blue-800 border-blue-200 dark:!bg-blue-950/50 dark:text-blue-300 dark:border-blue-800",
  purple: "!bg-purple-50 text-purple-800 border-purple-200 dark:!bg-purple-950/50 dark:text-purple-300 dark:border-purple-800",
  orange: "!bg-orange-50 text-orange-800 border-orange-200 dark:!bg-orange-950/50 dark:text-orange-300 dark:border-orange-800",
  amber: "!bg-amber-50 text-amber-800 border-amber-200 dark:!bg-amber-950/50 dark:text-amber-300 dark:border-amber-800",
  teal: "!bg-teal-50 text-teal-800 border-teal-200 dark:!bg-teal-950/50 dark:text-teal-300 dark:border-teal-800",
  indigo: "!bg-indigo-50 text-indigo-800 border-indigo-200 dark:!bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800",
} as const;

export type StatusColorKey = keyof typeof statusColors;

/** Split a combined token into bg, text, and border classes */
export function splitStatusColor(token: string): { bg: string; text: string; border: string } {
  const parts = token.split(" ");
  return {
    bg: parts.filter((p) => p.includes("bg-")).join(" "),
    text: parts.filter((p) => p.startsWith("text-") || p.includes(":text-")).join(" "),
    border: parts.filter((p) => p.startsWith("border-") || p.includes(":border-")).join(" "),
  };
}

export function pnlPanel(positive: boolean): string {
  return positive ? statusColors.bullish : statusColors.bearish;
}

export function pnlText(positive: boolean): string {
  return positive
    ? "text-green-700 dark:text-green-300"
    : "text-red-700 dark:text-red-300";
}

export function iconBadge(color: StatusColorKey): string {
  const map: Record<StatusColorKey, string> = {
    surfaceInset: "text-muted-foreground bg-muted",
    surfacePanel: "text-foreground bg-card",
    surfaceInsetLight: "text-muted-foreground bg-muted/50",
    neutral: "text-gray-600 bg-gray-50 dark:text-muted-foreground dark:bg-muted",
    bullish: "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-950/40",
    bearish: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40",
    caution: "text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/40",
    info: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40",
    purple: "text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40",
    orange: "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/40",
    amber: "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40",
    teal: "text-teal-600 bg-teal-50 dark:text-teal-400 dark:bg-teal-950/40",
    indigo: "text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/40",
  };
  return map[color];
}

export function cautionSubtle(): string {
  return "border-yellow-200 !bg-yellow-50/30 dark:border-yellow-800 dark:!bg-yellow-950/30";
}

export function infoSubtle(): string {
  return "border-blue-100 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-950/20";
}

export function infoBorder(): string {
  return "border-blue-100 dark:border-blue-800";
}

export function sectorHeatmapColor(returnPct: number): { bg: string; text: string; border: string } {
  if (returnPct >= 8) return { bg: "bg-green-500", text: "text-white", border: "border-green-600" };
  if (returnPct >= 5) return { bg: "bg-green-400", text: "text-white", border: "border-green-500" };
  if (returnPct >= 2) return { bg: "bg-green-200 dark:bg-green-800", text: "text-green-900 dark:text-green-100", border: "border-green-300 dark:border-green-700" };
  if (returnPct >= 0) return splitStatusColor(statusColors.bullish);
  if (returnPct >= -2) return splitStatusColor(statusColors.bearish);
  if (returnPct >= -5) return { bg: "bg-red-200 dark:bg-red-800", text: "text-red-900 dark:text-red-100", border: "border-red-300 dark:border-red-700" };
  if (returnPct >= -8) return { bg: "bg-red-400", text: "text-white", border: "border-red-500" };
  return { bg: "bg-red-500", text: "text-white", border: "border-red-600" };
}

export function confidenceBadge(probability: number): string {
  if (probability >= 70) return "bg-green-100 text-green-800 border-green-300 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800";
  if (probability >= 60) return splitStatusColor(statusColors.caution).bg + " " + splitStatusColor(statusColors.caution).text + " " + splitStatusColor(statusColors.caution).border;
  return splitStatusColor(statusColors.neutral).bg + " " + splitStatusColor(statusColors.neutral).text + " " + splitStatusColor(statusColors.neutral).border;
}

export function directionBg(direction: string): string {
  const d = direction.toUpperCase();
  if (d === "BULLISH" || d === "BUY" || d === "LONG") return "text-green-700 bg-green-50 dark:text-green-300 dark:bg-green-950/40";
  if (d === "BEARISH" || d === "SELL" || d === "SHORT") return "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/40";
  return "text-gray-600 bg-gray-50 dark:text-muted-foreground dark:bg-muted";
}
