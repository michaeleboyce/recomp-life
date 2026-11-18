// Addresses of pages whose content depends on a run-time id. The id travels in
// the query string, not the path: the iPhone app is built as static files, and
// a static build can only contain paths that are known when it is built.
import type { WorkoutLocation } from "@/types";

/** The detail page of one logged workout. */
export function workoutDetailHref(workoutId: string): string {
  return `/log/workout?id=${encodeURIComponent(workoutId)}`;
}

/** The list of coming workouts at a location; `from` "today" when opened from Today. */
export function upcomingListHref(location: WorkoutLocation, from?: "today" | null): string {
  return `/progress/upcoming?location=${location}${from === "today" ? "&from=today" : ""}`;
}

/**
 * One coming workout in full: `n` is its place in the rotation from the next one (0),
 * `location` where it would be done; `from` "today" when opened from Today.
 */
export function upcomingWorkoutHref(
  position: number,
  location: WorkoutLocation,
  from?: "today" | null
): string {
  return `/progress/upcoming/workout?n=${position}&location=${location}${from === "today" ? "&from=today" : ""}`;
}
