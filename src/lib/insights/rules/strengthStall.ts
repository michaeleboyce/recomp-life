import { getE1RMTrend } from "@/lib/e1rm";
import { RESET_FACTOR, roundToNearest5 } from "@/lib/progression";
import type { LiftState } from "@/types";
import type { Insight, InsightContext } from "../types";
import { formatLbs, joinList, liftName, plural } from "../shared";

function stallFor(lift: LiftState): Insight | null {
  const id = `strength-stall:${lift.exerciseId}`;
  const name = liftName(lift.exerciseId);

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

  const series = lift.recentE1RMs ?? [];
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

/** One per lift, skipping lifts a deload insight already covers. */
export function strengthStallInsights(ctx: InsightContext, covered: Set<string>): Insight[] {
  return ctx.liftStates
    .filter((l) => !covered.has(l.exerciseId) && !l.deloadActive)
    .map(stallFor)
    .filter((i): i is Insight => i !== null);
}
