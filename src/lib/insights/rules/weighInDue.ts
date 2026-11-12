import { formatDaysAgo } from "@/lib/dates";
import type { Insight, InsightContext } from "../types";
import { formatLbs, sortedWeights } from "../shared";

/**
 * Same behaviour as WeighInPrompt: shown while the morning reminder is on and no
 * weight is logged for the local day of `now`.
 */
export function weighInDueInsights(ctx: InsightContext): Insight[] {
  if (!ctx.settings?.morningWeighInReminder) return [];

  const dayStart = new Date(ctx.now);
  dayStart.setHours(0, 0, 0, 0);
  const nextDay = new Date(dayStart);
  nextDay.setDate(nextDay.getDate() + 1);

  // Entries up to the end of today (sortedWeights drops later-than-now rows; widen to the day).
  const entries = sortedWeights(ctx.bodyweight, new Date(nextDay.getTime() - 1));
  const loggedToday = entries.some(
    (e) => e.date.getTime() >= dayStart.getTime() && e.date.getTime() < nextDay.getTime()
  );
  if (loggedToday) return [];

  const latest = entries[entries.length - 1];
  const body = latest
    ? `No weight logged today. Last entry: ${formatLbs(latest.weight)} lbs, ${formatDaysAgo(latest.date, ctx.now).toLowerCase()}.`
    : "No weight logged yet.";

  return [
    {
      id: "weigh-in-due",
      kind: "weigh-in-due",
      severity: "action",
      title: "Log today's weight",
      body,
      action: { label: "Log weight", href: "/weigh-in" },
    },
  ];
}
