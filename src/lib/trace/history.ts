// Finds "last time" for a lift in the log. Reads the outcomes the rebuild recorded;
// it never works out what happened itself.
import { workingSetsFor } from "@/lib/workout/setSelectors";
import type { LiftAdjustment, ProgressionOutcome } from "@/types";
import type { LastSession, TraceHistory } from "./types";

const timeOf = (date: Date | string) => new Date(date).getTime();

/**
 * The most recent workout finished at or before `now` in which the lift was on the
 * day at that tier, with its sets and its outcome (which may be "not done"). Undefined
 * when there is none: the lift is still at its starting weight.
 */
export function findLastSession(
  history: TraceHistory | undefined,
  exerciseId: string,
  tier: ProgressionOutcome["tier"],
  now: Date
): LastSession | undefined {
  if (!history) return undefined;
  let best: LastSession | undefined;
  for (const workout of history.workouts) {
    if (workout.completedAt == null || workout.deletedAt != null) continue;
    const completedAt = new Date(workout.completedAt);
    if (completedAt.getTime() > now.getTime()) continue;
    if (best && completedAt.getTime() <= best.completedAt.getTime()) continue;
    const outcome = history.outcomes
      .get(workout.id)
      ?.find((o) => o.exerciseId === exerciseId && o.tier === tier);
    if (!outcome) continue;
    best = {
      workoutId: workout.id,
      completedAt,
      location: workout.location,
      sets: workingSetsFor(workout.sets ?? [], exerciseId, tier),
      outcome,
    };
  }
  return best;
}

const WEIGHT_FIELD = { T1: "t1Weight", T2: "t2Weight", T3: "t3Weight" } as const;

/**
 * The latest change made outside a workout that set this tier's weight, after `since`
 * (when given) and up to `now`. Undefined when there is none.
 */
export function findWeightAdjustment(
  history: TraceHistory | undefined,
  exerciseId: string,
  tier: ProgressionOutcome["tier"],
  since: Date | undefined,
  now: Date
): LiftAdjustment | undefined {
  let best: LiftAdjustment | undefined;
  for (const adjustment of history?.adjustments ?? []) {
    if (adjustment.exerciseId !== exerciseId || adjustment.deletedAt != null) continue;
    if (adjustment.set?.[WEIGHT_FIELD[tier]] === undefined) continue;
    const at = timeOf(adjustment.at);
    if (at > now.getTime() || (since && at <= since.getTime())) continue;
    if (!best || at >= timeOf(best.at)) best = adjustment;
  }
  return best;
}
