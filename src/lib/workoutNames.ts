// One set of names for workouts and lifts, so the same workout reads the same on
// Today, in the Log, in the quick-add sheet and in insights. Pure; no React.
import { EXERCISES } from "./exercises";
import { WORKOUT_TEMPLATES } from "./workoutTemplates";

/** Plain names for the main lifts, whose stored names are longer or abbreviated. */
const LIFT_NAME: Record<string, string> = {
  squat: "Squat",
  bench: "Bench press",
  deadlift: "Deadlift",
  ohp: "Overhead press",
};

/** The word before "day" where it is not the lift's first word. */
const DAY_WORD: Record<string, string> = { ohp: "Press" };

/** "Squat", "Bench press", "Deadlift", "Overhead press"; other lifts drop a leading "Barbell". */
export function liftShortName(exerciseId: string): string {
  const name = LIFT_NAME[exerciseId] ?? EXERCISES[exerciseId]?.name ?? exerciseId;
  return name.replace(/^Barbell /, "");
}

/**
 * A workout's display name, named after its T1 lift: "Squat day", or with the id
 * "A1 · Squat day". An unknown template gives just its id.
 */
export function workoutDisplayName(templateId: string, withId = false): string {
  const t1 = WORKOUT_TEMPLATES[templateId]?.exercises.find((e) => e.tier === "T1");
  if (!t1) return templateId;
  const word = DAY_WORD[t1.exerciseId] ?? liftShortName(t1.exerciseId).split(" ")[0];
  const day = `${word} day`;
  return withId ? `${templateId} · ${day}` : day;
}
