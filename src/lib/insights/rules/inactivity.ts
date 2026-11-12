import { checkInactivity, getDaysSinceLastWorkout } from "@/lib/inactivity";
import { LONG_BREAK_DAYS } from "@/lib/recovery";
import type { InactivityAlertLevel } from "@/types";
import type { Insight, InsightContext } from "../types";
import { isValidDate, toDate } from "../shared";

const BODY: Record<InactivityAlertLevel, string> = {
  gentle: "A few days off costs no strength. Your next workout is ready when you are.",
  urgent: `Up to ${LONG_BREAK_DAYS - 1} days off changes nothing in the program, so you can pick up at your current weights.`,
  detraining: `After ${LONG_BREAK_DAYS} or more days off, workout setup suggests lighter starting weights. You can keep your old weights if they feel right.`,
};

/**
 * Days since the last completed workout, as InactivityBanner computes it. A user with
 * no completed workout at all gets nothing (the banner would call that "3+ weeks").
 */
export function inactivityInsights(ctx: InsightContext): Insight[] {
  let last: Date | null = null;
  for (const w of ctx.workouts) {
    if (!w.completedAt) continue;
    const d = toDate(w.completedAt);
    if (isValidDate(d) && (!last || d.getTime() > last.getTime())) last = d;
  }
  if (!last) return [];

  const days = getDaysSinceLastWorkout(last, ctx.now);
  const alert = checkInactivity(days);
  if (!alert) return [];

  return [
    {
      id: "inactivity",
      kind: "inactivity",
      severity: alert.level === "gentle" ? "info" : "warning",
      title: `${Math.floor(days)} days since your last workout`,
      body: BODY[alert.level],
      evidenceId: "time-off",
    },
  ];
}
