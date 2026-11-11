import type { SetLog } from "@/types";
import type { RehydratedPlan, WorkoutPlan } from "./types";

const NOT_IMPLEMENTED = "not implemented: src/lib/workout contract stub";

/**
 * Rebuilds in-progress state from the sets already logged on a workout, so a reloaded
 * page resumes where it left off. Sets are matched to plan entries by template
 * exerciseId and tier; several warm-up entries for one exercise are filled in order.
 * Never returns completedSets above targetSets.
 */
export function rehydratePlan(plan: WorkoutPlan, loggedSets: SetLog[]): RehydratedPlan {
  void plan;
  void loggedSets;
  throw new Error(NOT_IMPLEMENTED);
}
