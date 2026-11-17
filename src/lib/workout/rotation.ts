// Which day of the rotation is due, without planning it. Pure.
import { foldRotation, type RotationSession } from "./credit";

/**
 * The template id due next in the A1 -> B1 -> A2 -> B2 rotation, from the completed
 * workouts (any order): what `resolveNextWorkout` plans, for screens that need only the
 * day (Configure's default day, a name on a tile). Unfinished workouts do not advance the
 * rotation, and neither do sessions `foldRotation` finds did not count.
 */
export function dueTemplateId(completedWorkouts: readonly RotationSession[]): string {
  return foldRotation([...completedWorkouts]).dueTemplateId;
}
