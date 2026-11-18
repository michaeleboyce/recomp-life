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
 * Days since the last completed workout, as InactivityBanner computes it, counting
 * sessions imported from other apps too (their end, else their start): training in
 * another app is not time off. A user with no workout or imported session gets nothing.
 *
 * @evidence time-off
 */
export function inactivityInsights(ctx: InsightContext): Insight[] {
  let last: Date | null = null;
  const consider = (value: Date | string) => {
    const d = toDate(value);
    if (isValidDate(d) && (!last || d.getTime() > last.getTime())) last = d;
  };
  for (const w of ctx.workouts) if (w.completedAt) consider(w.completedAt);
  for (const s of ctx.imported ?? []) if (s.deletedAt == null) consider(s.endedAt ?? s.startedAt);

  const days = getDaysSinceLastWorkout(last, ctx.now);
  const alert = checkInactivity(days);
  if (days === null || !alert) return [];

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
