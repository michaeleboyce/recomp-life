// Every way the app names a lift or an exercise, in one place. The forms differ on
// purpose: a row label, a word inside a sentence and a catalogue name read
// differently, and each screen keeps the form it was written with. Pick the form by
// where the name goes; the table in docs/architecture.md ("Naming") lists each
// function with an example and its screens. Workout and day names are in
// `workoutNames.ts`. Pure constants and helpers; no React.
import { EXERCISES } from "./exercises";
import { capitalise, isAbbreviation, lowerFirst } from "./text";

export const MAIN_LIFTS = ["squat", "bench", "deadlift", "ohp"] as const;
export type MainLiftId = (typeof MAIN_LIFTS)[number];

export function isMainLift(id: string | null | undefined): id is MainLiftId {
  return typeof id === "string" && (MAIN_LIFTS as readonly string[]).includes(id);
}

/** "5x3" -> "5×3" for display. */
export function formatStage(stage: string): string {
  return stage.replace("x", "×");
}

// ── Catalogue names ────────────────────────────────────────────────────────

/**
 * The catalogue name as stored, the id when unknown: "Barbell Squat", "Lat Pulldown".
 * Used where the name is shown as the library has it: insight cards, the strength
 * trend's sources, swap reasons, home-weight traces, import mapping.
 */
export function catalogueName(exerciseId: string): string {
  return EXERCISES[exerciseId]?.name ?? exerciseId;
}

/**
 * The catalogue name without a leading "Barbell": "Squat", "Bench Press", "OHP",
 * "Lat Pulldown"; the id when unknown. Title case is kept. The log edit sheets, the
 * Log's outcome lines and set lists, Today's glance tiles and favourites.
 */
export function shortLiftName(exerciseId: string): string {
  return catalogueName(exerciseId).replace(/^Barbell /, "");
}

// ── Main-lift names, other lifts from the catalogue ────────────────────────

/** Plain names for the main lifts, whose stored names are longer or abbreviated. */
const LIFT_NAME: Record<string, string> = {
  squat: "Squat",
  bench: "Bench press",
  deadlift: "Deadlift",
  ohp: "Overhead press",
};

/**
 * "Squat", "Bench press", "Deadlift", "Overhead press"; other lifts as `shortLiftName`
 * ("Lat Pulldown"). The row label in `LIFT_NAMES`, workout names ("Squat day"), swap
 * reasons.
 */
export function liftShortName(exerciseId: string): string {
  const name = LIFT_NAME[exerciseId] ?? catalogueName(exerciseId);
  return name.replace(/^Barbell /, "");
}

/** In-sentence name of each main lift ("bench", "overhead press"). */
const SENTENCE_NAME: Record<MainLiftId, string> = {
  squat: "squat",
  bench: "bench",
  deadlift: "deadlift",
  ohp: "overhead press",
};

/**
 * The two names of each main lift: `label` "Bench press" (`liftShortName`) for a row
 * or a title, `short` "bench" inside a sentence. The Progress screens, the exercise
 * page and every helper below that starts from a main lift.
 */
export const LIFT_NAMES: Record<MainLiftId, { label: string; short: string }> = Object.fromEntries(
  MAIN_LIFTS.map((id) => [id, { label: liftShortName(id), short: SENTENCE_NAME[id] }])
) as Record<MainLiftId, { label: string; short: string }>;

// ── Sentence case (Today and most lift rows) ───────────────────────────────

/** Plain names for lifts whose stored name is an abbreviation. */
const PLAIN_NAME: Record<string, string> = {
  ohp: "Overhead press",
};

/** Words that keep their capital in sentence case. */
const PROPER = new Set(["Romanian", "Bulgarian", "Arnold"]);

/**
 * Sentence case, abbreviations and proper names kept: "Barbell Bench Press" ->
 * "Bench press", "Barbell OHP" -> "Overhead press", "DB Bench Press" -> "DB bench
 * press", "Romanian Deadlift" stays. Today's lift rows and hero, Ready, Coming up, the
 * Log's accessory outcomes, the exercise page, the lift page's sessions.
 */
export function displayLiftName(exerciseId: string): string {
  const name = PLAIN_NAME[exerciseId] ?? shortLiftName(exerciseId);
  return name
    .split(" ")
    .map((word, i) =>
      i === 0 || word === word.toUpperCase() || PROPER.has(word) ? word : word.toLowerCase()
    )
    .join(" ");
}

/**
 * `displayLiftName` for use mid-sentence: "Goblet squat" -> "goblet squat", "DB bench
 * press" stays. Home-substitute lines ("Squat (goblet squat at home)"), Today's
 * accessory list, the exercise page's next-session notes.
 */
export function nameInSentence(exerciseId: string): string {
  const name = displayLiftName(exerciseId);
  const [first, ...rest] = name.split(" ");
  const keep = first === first.toUpperCase() || PROPER.has(first);
  return [keep ? first : first.toLowerCase(), ...rest].join(" ");
}

// ── The adjustment log's words ─────────────────────────────────────────────

/** "Lat Pulldown" -> "Lat pulldown"; abbreviations ("DB", "RDL") keep their capitals. */
function sentenceCase(name: string): string {
  return name
    .split(" ")
    .map((word, i) => {
      if (isAbbreviation(word)) return word;
      const lower = word.toLowerCase();
      return i === 0 ? capitalise(lower) : lower;
    })
    .join(" ");
}

/**
 * At the start of a title or sentence: "Bench press" (main lifts' `label`), "Lat
 * pulldown" (catalogue name in sentence case, abbreviations kept). The adjustment
 * feed (`lib/adjustments`, where it is `liftLabel`).
 */
export function feedLiftLabel(exerciseId: string): string {
  if (isMainLift(exerciseId)) return LIFT_NAMES[exerciseId].label;
  const exercise = EXERCISES[exerciseId];
  return exercise ? sentenceCase(exercise.name) : exerciseId;
}

/**
 * Inside a sentence: "bench", "overhead press" (main lifts' `short`), "lat pulldown",
 * "DB bench press". The adjustment feed (where it is `liftShort`).
 */
export function feedLiftShort(exerciseId: string): string {
  if (isMainLift(exerciseId)) return LIFT_NAMES[exerciseId].short;
  return EXERCISES[exerciseId] ? lowerFirst(feedLiftLabel(exerciseId)) : exerciseId;
}

// ── The forecast screens' words ────────────────────────────────────────────

/**
 * "Bench press" for a main lift; another exercise's catalogue name as stored ("Lat
 * Pulldown"); the id when unknown; "Lift" when there is none. The forecast screens
 * and their record (`lib/forecast/text`, where it is `liftLabel`).
 */
export function forecastLiftLabel(exerciseId: string | undefined): string {
  if (!exerciseId) return "Lift";
  if (isMainLift(exerciseId)) return LIFT_NAMES[exerciseId].label;
  return catalogueName(exerciseId);
}

/**
 * `forecastLiftLabel` all in lower case: "bench press", "overhead press", "lat
 * pulldown". Forecast questions ("Reps on today's last bench press set"; where it is
 * `liftShort`).
 */
export function forecastLiftShort(exerciseId: string | undefined): string {
  return forecastLiftLabel(exerciseId).toLowerCase();
}

// ── The projection screen's words ──────────────────────────────────────────

/**
 * The catalogue name without "Barbell", every word in lower case except
 * abbreviations: "squat", "bench press", "OHP", "lat pulldown"; the id when unknown.
 * The projection screen's sentence and empty state (`lib/projection/summary`).
 */
export function projectionLiftName(exerciseId: string): string {
  const name = EXERCISES[exerciseId]?.name;
  if (!name) return exerciseId;
  return name
    .replace(/^Barbell\s+/, "")
    .split(" ")
    .map((word) => (word === word.toUpperCase() ? word : word.toLowerCase()))
    .join(" ");
}
