// How long an upcoming workout should take, the way Today says it. Pure.
import { forecastSessionLength } from "@/lib/forecast";
import type { WorkoutPlan } from "@/lib/workout/types";
import type { TrainingPhase, WorkoutSession } from "@/types";

/**
 * Minutes for `plan` from the session-length forecast Today shows
 * (`forecastSessionLength`: the length on paper corrected by the lifter's own pace
 * once there are enough finished sessions), rounded as Today rounds it: to the
 * nearest minute, at least 1. Null when the plan has no working sets.
 *
 * `finished` are the finished workouts; the forecast reads those done by `now`.
 */
export function upcomingMinutes(
  plan: WorkoutPlan,
  finished: WorkoutSession[],
  phase: TrainingPhase | undefined,
  now: Date
): number | null {
  if (!plan.some((entry) => !entry.isWarmUp)) return null;
  const { seconds } = forecastSessionLength({ plan, workouts: finished, phase, now });
  return Math.max(1, Math.round(seconds / 60));
}
