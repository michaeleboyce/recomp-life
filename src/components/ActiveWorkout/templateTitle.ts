import { workoutDisplayName } from "@/lib/workoutNames";

/** "A1 · Squat day"; just the id for a template without a known focus. */
export function templateTitle(templateId: string): string {
  return workoutDisplayName(templateId, true);
}
