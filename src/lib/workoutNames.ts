// Every way the app names a workout, in one place. The forms differ on purpose (see
// the "Naming" table in docs/architecture.md); lift and exercise names are in
// `liftNames.ts`. Pure; no React.
import { displayLiftName, feedLiftShort, liftShortName } from "./liftNames";
import { capitalise } from "./text";
import { WORKOUT_TEMPLATES } from "./workoutTemplates";

/** The word before "day" where it is not the lift's first word. */
const DAY_WORD: Record<string, string> = { ohp: "Press" };

/**
 * A workout's display name, named after its T1 lift: "Squat day", "Press day", or with
 * the id "A1 · Squat day". An unknown template gives just its id. The quick-add sheet,
 * Ready, the workout summary, the Log's workout page, Coming up, insights.
 */
export function workoutDisplayName(templateId: string, withId = false): string {
  const t1 = WORKOUT_TEMPLATES[templateId]?.exercises.find((e) => e.tier === "T1");
  if (!t1) return templateId;
  const word = DAY_WORD[t1.exerciseId] ?? liftShortName(t1.exerciseId).split(" ")[0];
  const day = `${word} day`;
  return withId ? `${templateId} · ${day}` : day;
}

/**
 * "A1 · Squat day"; just the id for a template without a known focus. The page titles
 * of Ready and the active workout, More, favourites, the Upcoming cards.
 */
export function templateTitle(templateId: string): string {
  return workoutDisplayName(templateId, true);
}

/**
 * "Squat day", "Bench day", "Press day", from the T1 lift's id (`displayLiftName`'s
 * first word); `fallback` (the template's own name) when there is no T1 lift. Today's
 * hero and "different day" sheet, Ready, the Upcoming screens.
 */
export function dayName(t1ExerciseId: string | undefined, fallback: string): string {
  if (!t1ExerciseId) return fallback;
  const word = DAY_WORD[t1ExerciseId] ?? displayLiftName(t1ExerciseId).split(" ")[0];
  return `${word} day`;
}

/**
 * "B1 Press day": the id and `dayName`, with no separator. The Coming up line on
 * Today.
 */
export function inlineTitle(templateId: string, template: { name: string; exercises: readonly { tier: string; exerciseId: string }[] }): string {
  const t1 = template.exercises.find((e) => e.tier === "T1")?.exerciseId;
  return `${templateId} ${dayName(t1, template.name)}`;
}

/**
 * "Squat day", "Bench day", "Deadlift day", "Overhead press day": the T1 lift's
 * in-sentence name, capitalised; "Workout" when it has none. The adjustment feed's
 * workout entries.
 */
export function feedDayName(templateId: string): string {
  const t1 = WORKOUT_TEMPLATES[templateId]?.exercises.find((exercise) => exercise.tier === "T1");
  return t1 ? `${capitalise(feedLiftShort(t1.exerciseId))} day` : "Workout";
}
