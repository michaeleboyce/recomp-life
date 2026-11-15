// Pure helpers for the Today and Coming up screens: display names, the date line,
// photo framing and the one-line reason under each lift. No React, no database.
import type { Tier, WorkoutSession } from "@/types";
import { formatLbs, shortLiftName } from "./format";
import { isMainLift } from "@/lib/liftNames";

/** Plain names for lifts whose stored name is an abbreviation. */
const PLAIN_NAME: Record<string, string> = {
  ohp: "Overhead press",
};

/** Words that keep their capital in sentence case. */
const PROPER = new Set(["Romanian", "Bulgarian", "Arnold"]);

/** The word before "day" in a workout's name, when it is not the lift's first word. */
const DAY_WORD: Record<string, string> = {
  ohp: "Press",
};

/**
 * "Barbell Bench Press" -> "Bench press", "Barbell OHP" -> "Overhead press",
 * "DB Bench Press" -> "DB bench press": sentence case, abbreviations kept.
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

/** "Squat day", "Bench day", "Press day": named after the workout's T1 lift. */
export function dayName(t1ExerciseId: string | undefined, fallback: string): string {
  if (!t1ExerciseId) return fallback;
  const word = DAY_WORD[t1ExerciseId] ?? displayLiftName(t1ExerciseId).split(" ")[0];
  return `${word} day`;
}

/** "Friday · Nov 13". */
export function formatEyebrowDate(date: Date): string {
  const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
  const monthDay = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${weekday} · ${monthDay}`;
}

/**
 * Where to centre each main lift's photo so the lifter stays in frame. On a phone the
 * Today hero crops the sides (the first figure matters: it keeps the lifter clear of
 * the gym/home switch) and the Coming up cards crop top and bottom. Others centre.
 */
const PHOTO_POSITION: Record<"hero" | "card", Record<string, string>> = {
  hero: {
    deadlift: "30% 20%",
    squat: "80% 0%",
    bench: "45% 20%",
    ohp: "35% 0%",
    // Home substitutes with a photo. The Bulgarian split squat photo is portrait, so
    // its second figure picks the band from the head to the dumbbells.
    goblet_squat: "40% 0%",
    bulgarian_split_squat: "60% 18%",
    db_lunge: "55% 0%",
    db_bench: "50% 20%",
    db_floor_press: "40% 0%",
    db_rdl: "45% 0%",
    db_shoulder_press: "35% 0%",
    db_arnold_press: "50% 0%",
  },
  card: {
    deadlift: "60% 35%",
    squat: "55% 22%",
    bench: "55% 30%",
    ohp: "45% 18%",
    goblet_squat: "55% 15%",
    bulgarian_split_squat: "65% 14%",
    db_lunge: "55% 10%",
    db_bench: "55% 30%",
    db_floor_press: "50% 35%",
    db_rdl: "55% 10%",
    db_shoulder_press: "45% 30%",
    db_arnold_press: "55% 30%",
  },
};

export function photoPosition(exerciseId: string, where: "hero" | "card"): string | undefined {
  return PHOTO_POSITION[where][exerciseId];
}

/**
 * The lift page for a row on Today or Coming up: `as` names the home substitute the
 * row shows (the page keeps the program lift's history), `from` where to go back to.
 */
export function liftPageHref(
  exerciseId: string,
  options: { as?: string; from?: "today" } = {}
): string {
  // Only the four main lifts have a lift page; any other lift opens the page of the
  // exercise actually shown (the home version when there is one).
  if (!isMainLift(exerciseId)) return `/exercises/${options.as ?? exerciseId}`;
  const params = new URLSearchParams();
  if (options.as && options.as !== exerciseId) params.set("as", options.as);
  if (options.from) params.set("from", options.from);
  const query = params.toString();
  return `/progress/lift/${exerciseId}${query ? `?${query}` : ""}`;
}

/** A display name for use mid-sentence: "Goblet squat" -> "goblet squat", "DB bench press" stays. */
export function nameInSentence(exerciseId: string): string {
  const name = displayLiftName(exerciseId);
  const [first, ...rest] = name.split(" ");
  const keep = first === first.toUpperCase() || PROPER.has(first);
  return [keep ? first : first.toLowerCase(), ...rest].join(" ");
}

/** How today's weight compares with the last finished workout that had the lift at this tier. */
export type LiftReason =
  | { kind: "up" | "down"; change: number; from: number }
  | { kind: "held"; weight: number }
  | { kind: "first" };

export interface ReasonEntry {
  exerciseId: string;
  substituteExerciseId?: string;
  tier: Tier;
  weight: number;
}

/**
 * Compares `entry.weight` with the weight prescribed for the same lift, tier and
 * substitute the last time it was done (newest finished workout first). Sets skipped
 * for pain do not count; a set lightened for pain or a run counts at the weight it
 * was prescribed at.
 */
export function liftReason(
  entry: ReasonEntry,
  finishedNewestFirst: Pick<WorkoutSession, "completedAt" | "sets">[]
): LiftReason {
  for (const workout of finishedNewestFirst) {
    if (workout.completedAt == null) continue;
    const weights = workout.sets
      .filter(
        (set) =>
          set.exerciseId === entry.exerciseId &&
          set.tier === entry.tier &&
          set.status !== "skipped_pain" &&
          (set.isSubstituted ? set.substituteExerciseId : undefined) === entry.substituteExerciseId
      )
      // On a substituted set `originalWeight` is the barbell weight it replaced, so
      // only an unsubstituted set's original weight is the one prescribed for it.
      .map((set) => (set.isSubstituted ? set.weight : (set.originalWeight ?? set.weight)));
    if (weights.length === 0) continue;
    const last = Math.max(...weights);
    if (entry.weight === last) return { kind: "held", weight: last };
    return {
      kind: entry.weight > last ? "up" : "down",
      change: Math.abs(entry.weight - last),
      from: last,
    };
  }
  return { kind: "first" };
}

/** The reason as plain text, e.g. "▲ 10 from 205", "Held at 65", "First time". */
export function reasonText(reason: LiftReason): string {
  switch (reason.kind) {
    case "up":
      return `▲ ${formatLbs(reason.change)} from ${formatLbs(reason.from)}`;
    case "down":
      return `▼ ${formatLbs(reason.change)} from ${formatLbs(reason.from)}`;
    case "held":
      return `Held at ${formatLbs(reason.weight)}`;
    case "first":
      return "First time";
  }
}
