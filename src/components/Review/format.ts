// Display helpers for the weekly review. Pure.
import { EXERCISES } from "@/lib/exercises";
import { formatNumber, formatWhole } from "@/lib/metrics/helpers";
import type { LiftReview } from "@/lib/review";
import { plural } from "@/lib/text";

export const DASH = "—";

/** "225", "232.5". */
export const lbs = (v: number) => formatNumber(v);
export const whole = formatWhole;

/** "3 mi · 30 min", or "30 min" without distance. */
export function cardioLine(miles: number, minutes: number): string {
  const time = `${formatNumber(minutes, 0)} min`;
  return miles > 0 ? `${formatNumber(miles, 1)} mi · ${time}` : time;
}

/** "3 sessions", "2 sessions, 1 as a home version", "3 sessions, 1 as a home version, 1 imported". */
export function liftSessionsText(lift: Pick<LiftReview, "sessions" | "homeSessions" | "importedSessions">): string {
  const parts = [plural(lift.sessions, "session")];
  if (lift.homeSessions > 0) parts.push(`${lift.homeSessions} as a home version`);
  if (lift.importedSessions > 0) parts.push(`${lift.importedSessions} imported`);
  return parts.join(", ");
}

/** "Best from DB Bench Press" when the week's best came from a home version; else null. */
export function bestFromText(lift: Pick<LiftReview, "bestFrom">): string | null {
  return lift.bestFrom ? `Best from ${EXERCISES[lift.bestFrom]?.name ?? lift.bestFrom}` : null;
}

/** A signed rate with a Unicode minus: "−1.31". */
export function signed(v: number, digits = 2): string {
  const text = formatNumber(Math.abs(v), digits);
  if (Number(text) === 0) return "0";
  return `${v > 0 ? "+" : "−"}${text}`;
}
