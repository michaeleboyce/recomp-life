import { useMemo } from "react";
import { describePrOpportunity, type PrChance } from "@/lib/projection";
import { estimateWorkoutMinutes } from "@/components/Today/format";
import type { ReadinessScore } from "@/types/glass";
import type { WorkoutLocation } from "@/types";
import { useNextWorkout } from "./useNextWorkout";
import { useSettings } from "./useProfile";
import { useE1RMs } from "./useRecords";
import { useLiftStates } from "./useWorkouts";

export interface TodayForecast {
  /** How long the next workout takes. `low`/`high` only when a model gives a range. */
  session: { minutes: number; low?: number; high?: number } | null;
  /** The chance the T1 lift's last set sets a new best estimated max. */
  newBest: {
    /** 0 to 1, or null while only the category is known. */
    probability: number | null;
    chance: PrChance;
    repsNeeded: number;
    /** The estimated max that many reps would give. */
    estimate: number;
    /** The current best estimated max. */
    best: number;
  } | null;
  readiness: ReadinessScore | null;
}

/**
 * The forecast tiles on Today, for the next workout at `location` (the saved default
 * when omitted). `undefined` while loading; each part is null when there is nothing
 * honest to show, and the tile for it is not rendered.
 *
 * For now this is filled from what exists: the rest-time estimate for the session,
 * the PR opportunity category for a new best, and no readiness. The stored forecasts
 * replace the internals later without changing the shape.
 */
export function useTodayForecast(location?: WorkoutLocation): TodayForecast | undefined {
  const next = useNextWorkout(location);
  const settings = useSettings();
  const t1 = next?.plan.find((entry) => entry.tier === "T1" && !entry.isWarmUp);
  // Hooks run unconditionally. Without a T1 (still loading) this reads every lift's
  // rows, which the memo below ignores.
  const e1rms = useE1RMs(t1?.exerciseId ?? "");
  const liftStates = useLiftStates();

  return useMemo(() => {
    if (!next || settings === undefined || e1rms === undefined || liftStates === undefined) {
      return undefined;
    }
    const working = next.plan.filter((entry) => !entry.isWarmUp);
    const session =
      working.length > 0
        ? { minutes: estimateWorkoutMinutes(next.plan, settings?.trainingPhase) }
        : null;

    let newBest: TodayForecast["newBest"] = null;
    // A home substitute is a different lift: its reps say nothing about the barbell best.
    if (t1 && !t1.substituteExerciseId) {
      const best = e1rms.reduce<number | null>(
        (max, row) =>
          Number.isFinite(row.estimated1RM) && (max === null || row.estimated1RM > max)
            ? row.estimated1RM
            : max,
        null
      );
      const state = liftStates.find((s) => s.exerciseId === t1.exerciseId);
      const opportunity = describePrOpportunity({
        tier: t1.tier,
        isAMRAP: t1.isAMRAP,
        weight: t1.weight,
        bestE1RM: best,
        recentAMRAPReps: state?.recentAMRAPReps ?? [],
      });
      if (opportunity) {
        newBest = {
          probability: null,
          chance: opportunity.chance,
          repsNeeded: opportunity.repsNeeded,
          estimate: opportunity.e1rmAtRepsNeeded,
          best: opportunity.bestE1RM,
        };
      }
    }

    return { session, newBest, readiness: null };
  }, [next, settings, e1rms, liftStates, t1]);
}
