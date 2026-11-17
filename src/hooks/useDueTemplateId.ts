import { useMemo } from "react";
import { dueTemplateId } from "@/lib/workout/rotation";
import { useCompletedWorkouts } from "./useWorkouts";

/**
 * The template id due next in the rotation (`dueTemplateId`), for screens that need the
 * day but not its plan: the day `useNextWorkout` plans, without planning it.
 * `undefined` while loading.
 */
export function useDueTemplateId(): string | undefined {
  const completedWorkouts = useCompletedWorkouts();
  return useMemo(
    () => (completedWorkouts === undefined ? undefined : dueTemplateId(completedWorkouts)),
    [completedWorkouts]
  );
}
