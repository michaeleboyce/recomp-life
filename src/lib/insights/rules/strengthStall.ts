import { getE1RMTrend } from "@/lib/e1rm";
import { importedStrengthSets } from "@/lib/import/evidence";
import { importedLiftIndex, type ImportedLiftIndex } from "@/lib/import/history";
import { RESET_FACTOR, roundToNearest5 } from "@/lib/progression";
import type { LiftState } from "@/types";
import type { Insight, InsightContext } from "../types";
import { formatLbs, joinList, plural } from "@/lib/text";
import { catalogueName } from "@/lib/liftNames";
import { isValidDate, toDate } from "../shared";

/**
 * The lift's recent estimated 1RMs: the lift state's (the app's T1 sessions), then the
 * estimates of sessions imported from other apps after the lift's last T1 session in
 * the app (all of them when it has none) and up to `now`, oldest first, to the pound.
 * Imported sessions from before the app's last one are older than the app's series.
 */
export function recentE1RMsWithImported(lift: LiftState, index: ImportedLiftIndex | null, now: Date): number[] {
  const own = lift.recentE1RMs ?? [];
  if (!index) return own;
  const since = lift.t1LastWorkoutDate ? toDate(lift.t1LastWorkoutDate) : null;
  const after = since && isValidDate(since) ? since.getTime() : -Infinity;
  const later = (index.get(lift.exerciseId) ?? [])
    .filter((h) => h.estimatedMax != null && h.t > after && h.t <= now.getTime())
    .map((h) => Math.round(h.estimatedMax!));
  return later.length > 0 ? [...own, ...later] : own;
}

function stallFor(lift: LiftState, index: ImportedLiftIndex | null, now: Date): Insight | null {
  const id = `strength-stall:${lift.exerciseId}`;
  const name = catalogueName(lift.exerciseId);

  // The last T1 stage, reached through failures: the next failure resets the lift.
  if (lift.t1Stage === "10x1" && lift.t1FailCount > 0) {
    const reset = roundToNearest5(lift.t1Weight * RESET_FACTOR);
    return {
      id,
      kind: "strength-stall",
      severity: "info",
      title: `${name} T1 on its last stage`,
      body: `T1 is at 10x1 with ${formatLbs(lift.t1Weight)} lbs after ${plural(lift.t1FailCount, "failed session")}. If 10x1 fails, T1 resets to ${formatLbs(reset)} lbs at 5x3.`,
      evidenceId: "gzclp-progression",
    };
  }

  const series = recentE1RMsWithImported(lift, index, now);
  if (getE1RMTrend(series) === "decreasing") {
    return {
      id,
      kind: "strength-stall",
      severity: "info",
      title: `${name} estimated 1RM down`,
      body: `The last three estimated 1RMs were ${joinList(series.slice(-3).map(String))} lbs. Sleep, food and stress usually show up here first.`,
      evidenceId: "e1rm-estimate",
    };
  }
  return null;
}

/**
 * One per lift, skipping lifts a deload insight already covers. The e1RM trend also
 * reads imported sessions after the app's last one (`recentE1RMsWithImported`); the
 * 10x1 check is the program's own.
 */
export function strengthStallInsights(ctx: InsightContext, covered: Set<string>): Insight[] {
  const live = (ctx.imported ?? []).filter((s) => s.deletedAt == null);
  const index = live.length > 0 ? importedLiftIndex(importedStrengthSets(live, ctx.overrides)) : null;
  return ctx.liftStates
    .filter((l) => !covered.has(l.exerciseId) && !l.deloadActive)
    .map((l) => stallFor(l, index, ctx.now))
    .filter((i): i is Insight => i !== null);
}
