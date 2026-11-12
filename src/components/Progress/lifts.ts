// The four main lifts as the Progress screens name them. Pure constants.

export const MAIN_LIFTS = ["squat", "bench", "deadlift", "ohp"] as const;
export type MainLiftId = (typeof MAIN_LIFTS)[number];

/** Row label ("Bench press") and in-sentence name ("bench"). */
export const LIFT_NAMES: Record<MainLiftId, { label: string; short: string }> = {
  squat: { label: "Squat", short: "squat" },
  bench: { label: "Bench press", short: "bench" },
  deadlift: { label: "Deadlift", short: "deadlift" },
  ohp: { label: "Overhead press", short: "overhead press" },
};

export function isMainLift(id: string | null | undefined): id is MainLiftId {
  return typeof id === "string" && (MAIN_LIFTS as readonly string[]).includes(id);
}

/** "5x3" -> "5×3" for display. */
export function formatStage(stage: string): string {
  return stage.replace("x", "×");
}
