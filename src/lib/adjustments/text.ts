// Wording and link helpers for the adjustment log. Plain language: "last set", never
// "AMRAP"; weights are bare numbers in lbs, as in the rest of the app's titles. Pure.
import { formatStage, isMainLift, LIFT_NAMES } from "@/lib/liftNames";
import { isRuleId, type RuleId } from "@/lib/evidence";
import { EXERCISES } from "@/lib/exercises";
import { formatNumber } from "@/lib/metrics/helpers";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { Tier } from "@/types";

// ── Dates and rows ─────────────────────────────────────────────────────────

/** A stored date as a Date (synced rows may carry ISO strings); null when it is not one. */
export function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

/** Epoch milliseconds of a stored date; NaN when it is not one. */
export function toMs(value: Date | string | number | null | undefined): number {
  return toDate(value)?.getTime() ?? NaN;
}

/** True for a row that has not been soft-deleted. */
export function isLive(row: { deletedAt?: number | null }): boolean {
  return row.deletedAt == null;
}

export function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

// ── Numbers and lists ──────────────────────────────────────────────────────

/** Weights within this many lbs count as the same weight (stored numbers, not arithmetic). */
export const WEIGHT_TOLERANCE_LBS = 0.01;

export function sameWeight(a: number, b: number): boolean {
  return Math.abs(a - b) <= WEIGHT_TOLERANCE_LBS;
}

/** 205 -> "205", 87.5 -> "87.5". */
export function lbs(weight: number): string {
  return formatNumber(weight, 1);
}

/** "5x3" -> "5×3"; nothing for a tier without a scheme. */
export function scheme(stage: string | undefined): string {
  return stage ? formatStage(stage) : "";
}

/** Every "5x3" inside a sentence -> "5×3". */
export function withSchemeSigns(text: string): string {
  return text.replace(/(\d)x(\d)/g, "$1×$2");
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

/** 2 -> "two"; numbers past ten stay as digits. */
export function countWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** 1 -> "one set", 2 -> "two sets". */
export function countOf(n: number, noun: string): string {
  return `${countWord(n)} ${noun}${n === 1 ? "" : "s"}`;
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Lower-cases the first letter unless the first word is an abbreviation ("DB"). */
export function lowerFirst(text: string): string {
  const first = text.split(" ")[0] ?? "";
  return isAbbreviation(first) ? text : text.charAt(0).toLowerCase() + text.slice(1);
}

/** 0.7 -> "7 in 10". */
export function inTen(fraction: number): string {
  return `${Math.round(fraction * 10)} in 10`;
}

// ── Lifts and workouts ─────────────────────────────────────────────────────

function isAbbreviation(word: string): boolean {
  return word.length <= 4 && /^[A-Z0-9]+$/.test(word) && /[A-Z]/.test(word);
}

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

/** The lift's name at the start of a title or sentence: "Bench press", "Lat pulldown". */
export function liftLabel(exerciseId: string): string {
  if (isMainLift(exerciseId)) return LIFT_NAMES[exerciseId].label;
  const exercise = EXERCISES[exerciseId];
  return exercise ? sentenceCase(exercise.name) : exerciseId;
}

/** The lift's name inside a sentence: "bench", "lat pulldown". */
export function liftShort(exerciseId: string): string {
  if (isMainLift(exerciseId)) return LIFT_NAMES[exerciseId].short;
  return EXERCISES[exerciseId] ? lowerFirst(liftLabel(exerciseId)) : exerciseId;
}

/**
 * The tier as it follows a lift's name: " T1", " T2", nothing for T3. The main lifts
 * are trained at two tiers, so a weight needs one; a T3 lift has only the one weight.
 */
export function tierTag(tier: Tier): string {
  return tier === "T1" || tier === "T2" ? ` ${tier}` : "";
}

/** "Squat day": the workout named after its heavy lift; "Workout" when it has none. */
export function dayName(templateId: string): string {
  const t1 = WORKOUT_TEMPLATES[templateId]?.exercises.find((exercise) => exercise.tier === "T1");
  return t1 ? `${capitalise(liftShort(t1.exerciseId))} day` : "Workout";
}

// ── Rules and links ────────────────────────────────────────────────────────

/** The id when it names a real evidence rule, else nothing: an entry never cites a made-up rule. */
export function realRuleId(ruleId: string | undefined): RuleId | undefined {
  return ruleId !== undefined && isRuleId(ruleId) ? ruleId : undefined;
}

/** Screens an entry can point at. The forecast routes are the ones the design names. */
export const FEED_HREFS = {
  forecasts: "/progress/forecasts",
  trackRecord: "/progress/forecasts/record",
  settings: "/settings",
  progress: "/progress",
} as const;

/**
 * The research page opened at one rule. The query is the form the design names
 * (`/research?rule=<id>`); the hash is what the page reads today.
 */
export function ruleHref(ruleId: string): string {
  const id = encodeURIComponent(ruleId);
  return `/research?rule=${id}#${id}`;
}

/** The lift's own page: its progress page for a main lift, else its exercise page. */
export function liftHref(exerciseId: string): string | undefined {
  if (isMainLift(exerciseId)) return `/progress/lift/${exerciseId}`;
  return EXERCISES[exerciseId] ? `/exercises/${exerciseId}` : undefined;
}
