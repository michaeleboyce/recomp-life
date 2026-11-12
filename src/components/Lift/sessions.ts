// Rows for the lift detail page's session list. Pure.
import { excludeWarmUps } from "@/lib/workout";
import type { Estimated1RM, Tier, WorkoutSession } from "@/types";

const TIER_ORDER: Tier[] = ["T1", "T2", "T3", "accessory"];

export interface SessionSet {
  reps: number;
  amrap: boolean;
  failed: boolean;
}

export interface LiftSession {
  key: string;
  workoutId: string;
  /** Epoch ms of the workout start. */
  t: number;
  tier: Tier;
  /** Heaviest weight among the tier's sets, as lifted. */
  weight: number;
  sets: SessionSet[];
  /** Mean logged RPE, or null when none was logged. */
  rpe: number | null;
  /** This session holds the lift's best estimated 1RM. */
  best: boolean;
}

/** Every session containing the lift (warm-ups excluded), newest first, one row per tier. */
export function liftSessions(
  workouts: WorkoutSession[],
  e1rms: Estimated1RM[],
  exerciseId: string
): LiftSession[] {
  let bestId: string | null = null;
  let bestValue = -Infinity;
  for (const row of e1rms) {
    if (row.exerciseId === exerciseId && row.estimated1RM > bestValue) {
      bestValue = row.estimated1RM;
      bestId = row.workoutSessionId;
    }
  }

  const rows: LiftSession[] = [];
  for (const workout of workouts) {
    const mine = excludeWarmUps(workout.sets ?? []).filter((s) => s.exerciseId === exerciseId);
    let bestMarked = false;
    for (const tier of TIER_ORDER) {
      const sets = mine.filter((s) => s.tier === tier);
      if (sets.length === 0) continue;
      const rpes = sets.flatMap((s) => (typeof s.rpe === "number" && Number.isFinite(s.rpe) ? [s.rpe] : []));
      const best = workout.id === bestId && !bestMarked;
      if (best) bestMarked = true;
      rows.push({
        key: `${workout.id}-${tier}`,
        workoutId: workout.id,
        t: new Date(workout.startedAt).getTime(),
        tier,
        weight: Math.max(...sets.map((s) => s.weight)),
        sets: sets.map((s) => ({ reps: s.actualReps, amrap: s.isAMRAP, failed: s.status === "failed" })),
        rpe: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
        best,
      });
    }
  }
  return rows.sort((a, b) => b.t - a.t);
}
