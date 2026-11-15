// The four main lifts and their names, for code in src/lib and for the Progress screens
// (`src/components/Progress/lifts.ts` re-exports this). Pure constants and helpers.
import { liftShortName } from "./workoutNames";

export const MAIN_LIFTS = ["squat", "bench", "deadlift", "ohp"] as const;
export type MainLiftId = (typeof MAIN_LIFTS)[number];

/** In-sentence name of each main lift ("bench", "overhead press"). */
const SENTENCE_NAME: Record<MainLiftId, string> = {
  squat: "squat",
  bench: "bench",
  deadlift: "deadlift",
  ohp: "overhead press",
};

/** Row label ("Bench press", from `liftShortName`) and in-sentence name ("bench"). */
export const LIFT_NAMES: Record<MainLiftId, { label: string; short: string }> = Object.fromEntries(
  MAIN_LIFTS.map((id) => [id, { label: liftShortName(id), short: SENTENCE_NAME[id] }])
) as Record<MainLiftId, { label: string; short: string }>;

export function isMainLift(id: string | null | undefined): id is MainLiftId {
  return typeof id === "string" && (MAIN_LIFTS as readonly string[]).includes(id);
}

/** "5x3" -> "5×3" for display. */
export function formatStage(stage: string): string {
  return stage.replace("x", "×");
}
