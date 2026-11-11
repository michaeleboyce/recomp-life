import type { SetLog } from "@/types";
import type { RehydratedPlan, WorkoutPlan } from "./types";

/**
 * Rebuilds in-progress state from the sets already logged on a workout, so a reloaded
 * page resumes where it left off. Sets are matched to plan entries by template
 * exerciseId and tier; several warm-up entries for one exercise are filled in order.
 * Never returns completedSets above targetSets.
 */
export function rehydratePlan(plan: WorkoutPlan, loggedSets: SetLog[]): RehydratedPlan {
  // Logged sets not yet assigned to an entry, per exerciseId + tier.
  const unassigned = new Map<string, number>();
  for (const set of loggedSets) {
    const key = entryKey(set.exerciseId, set.tier);
    unassigned.set(key, (unassigned.get(key) ?? 0) + 1);
  }

  const rehydrated = plan.map((entry) => {
    const key = entryKey(entry.exerciseId, entry.tier);
    const available = unassigned.get(key) ?? 0;
    const completedSets = Math.min(available, Math.max(entry.targetSets, 0));
    unassigned.set(key, available - completedSets);
    return { ...entry, completedSets };
  });

  const firstIncomplete = rehydrated.findIndex(
    (entry) => entry.completedSets < entry.targetSets
  );

  return {
    plan: rehydrated,
    currentExerciseIndex: firstIncomplete === -1 ? rehydrated.length : firstIncomplete,
  };
}

function entryKey(exerciseId: string, tier: string): string {
  return `${tier}:${exerciseId}`;
}
