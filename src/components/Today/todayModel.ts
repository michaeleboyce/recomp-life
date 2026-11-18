// Pure helpers for the Today and Coming up screens: display names, the date line,
// photo framing and the one-line reason under each lift. No React, no database.
import type { EquipmentProfile, Tier, VariantSeed, WorkoutSession } from "@/types";
import { EXERCISES } from "@/lib/exercises";
import { isMainLift } from "@/lib/liftNames";
import { DUMBBELL_LOAD_FACTOR } from "@/lib/dbConversion";
import { capNextStep, type CapNext } from "@/lib/trace/homeWeight";
import { formatLbs, shortLiftName } from "./format";

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
 * The page of the exercise performed (E10). A barbell program lift done as itself keeps
 * its address under Progress (`/progress/lift/<id>`); every other exercise, a home
 * version of a lift included, is `/exercises/<id>`. Both render the same exercise
 * page. `from` says where back goes when there is no in-app history.
 */
export function exercisePageHref(exerciseId: string, options: { from?: "today" } = {}): string {
  const query = options.from ? `?from=${options.from}` : "";
  return isMainLift(exerciseId) ? `/progress/lift/${exerciseId}${query}` : `/exercises/${exerciseId}${query}`;
}

/**
 * The page for a row on Today or Coming up: the page of the exercise performed, `as`
 * (the home substitute the row shows) when there is one, else the lift's own.
 */
export function liftPageHref(
  exerciseId: string,
  options: { as?: string; from?: "today" } = {}
): string {
  return exercisePageHref(options.as || exerciseId, options.from ? { from: options.from } : {});
}

/** A display name for use mid-sentence: "Goblet squat" -> "goblet squat", "DB bench press" stays. */
export function nameInSentence(exerciseId: string): string {
  const name = displayLiftName(exerciseId);
  const [first, ...rest] = name.split(" ");
  const keep = first === first.toUpperCase() || PROPER.has(first);
  return [keep ? first : first.toLowerCase(), ...rest].join(" ");
}

/**
 * How today's weight compares with the last finished workout that had the lift at this
 * tier. "capped": held at the heaviest dumbbell, with what a pass does there instead.
 */
export type LiftReason =
  | { kind: "up" | "down"; change: number; from: number }
  | { kind: "held"; weight: number }
  | { kind: "capped"; weight: number; next: CapNext }
  /** A first home weight worked out from the exercise's own recent sessions (app or imported). */
  | { kind: "history"; weight: number; reps: number; perHand: boolean; at: number }
  /**
   * A first home weight worked out some other way (`SeedBasis`): from the program lift,
   * at `ratio`, or converted. `lastDone`: when the exercise was last done, when it was
   * (too long ago to set its weight); without it, a first time.
   */
  | { kind: "seeded"; basis: SeedBasis; lastDone?: number }
  /**
   * Not done in the app yet, planned at the default weight while the imported history
   * suggests `suggested` (as lifted) and the lifter has not confirmed it
   * (`startingWeightReason`).
   */
  | { kind: "unconfirmed"; suggested: number; perHand: boolean }
  /** Not done in the app yet, but the imported history contains the exercise. */
  | { kind: "notYetInApp" }
  | { kind: "first" };

/** What a first home weight not from the exercise's own history was worked out from. */
export type SeedBasis =
  /** The lift's strength estimate through a ratio learned from `pairs` of the lifter's sessions. */
  | { from: "learned"; lift: string; ratio: number; pairs: number }
  /** The lift's strength estimate through the starting ratio. */
  | { from: "estimate"; lift: string; ratio: number }
  /** The starting ratio times the barbell weight. */
  | { from: "ratio"; lift: string; ratio: number; barbellWeight: number }
  /** The flat conversion of the barbell weight. */
  | { from: "conversion"; lift: string; barbellWeight: number }
  /** The cap policy moved here from a lighter exercise. */
  | { from: "harderVariant" };

export interface ReasonEntry {
  exerciseId: string;
  substituteExerciseId?: string;
  tier: Tier;
  weight: number;
  /** How a first home weight was seeded (`seedVariantWeight`). */
  seed?: Pick<VariantSeed, "source" | "history" | "ratio" | "pairs" | "barbellWeight" | "lastDone">;
}

/** "Barbell Bench Press" -> "bench press", "Barbell OHP" -> "overhead press": the lift in a sentence. */
function liftInSentence(liftId: string): string {
  return displayLiftName(liftId).toLowerCase();
}

/** What a seed not from the exercise's own history rests on, or null without its numbers. */
function seedBasis(liftId: string, seed: NonNullable<ReasonEntry["seed"]>): SeedBasis | null {
  const lift = liftInSentence(liftId);
  switch (seed.source) {
    case "learned":
      return seed.ratio != null ? { from: "learned", lift, ratio: seed.ratio, pairs: seed.pairs ?? 0 } : null;
    case "estimate":
      return seed.ratio != null ? { from: "estimate", lift, ratio: seed.ratio } : null;
    case "ratio":
      return seed.ratio != null ? { from: "ratio", lift, ratio: seed.ratio, barbellWeight: seed.barbellWeight } : null;
    case "conversion":
      return { from: "conversion", lift, barbellWeight: seed.barbellWeight };
    case "harderVariant":
      return { from: "harderVariant" };
    default:
      return null;
  }
}

/**
 * Compares `entry.weight` with the weight prescribed for the same lift, tier and
 * substitute the last time it was done (newest finished workout first). Sets skipped
 * for pain do not count; a set lightened for pain or a run counts at the weight it
 * was prescribed at. Without a substitute, the session's stored prescription for the
 * lift and tier wins: a weight edited lighter before START leaves no original weight
 * on its sets, and progression went on from the prescription, not the lighter weight.
 */
export function liftReason(
  entry: ReasonEntry,
  finishedNewestFirst: Pick<WorkoutSession, "completedAt" | "sets" | "prescribed">[]
): LiftReason {
  for (const workout of finishedNewestFirst) {
    if (workout.completedAt == null) continue;
    const sets = workout.sets.filter(
      (set) =>
        set.exerciseId === entry.exerciseId &&
        set.tier === entry.tier &&
        set.status !== "skipped_pain" &&
        (set.isSubstituted ? set.substituteExerciseId : undefined) === entry.substituteExerciseId
    );
    if (sets.length === 0) continue;
    const prescribed = entry.substituteExerciseId
      ? undefined
      : workout.prescribed?.find((p) => p.exerciseId === entry.exerciseId && p.tier === entry.tier);
    const last =
      prescribed?.weight ??
      Math.max(
        // On a substituted set `originalWeight` is the barbell weight it replaced, so
        // only an unsubstituted set's original weight is the one prescribed for it.
        ...sets.map((set) => (set.isSubstituted ? set.weight : (set.originalWeight ?? set.weight)))
      );
    if (entry.weight === last) return { kind: "held", weight: last };
    return {
      kind: entry.weight > last ? "up" : "down",
      change: Math.abs(entry.weight - last),
      from: last,
    };
  }
  // Not done at this tier yet: say what its first weight rests on. Only a seed from the
  // exercise's own history names a session; "First time" only for an exercise never done.
  const seed = entry.substituteExerciseId ? entry.seed : undefined;
  if (!seed) return { kind: "first" };
  if (seed.source === "history" && seed.history) {
    const { at, weight, reps, perHand } = seed.history;
    return { kind: "history", at, weight, reps, perHand };
  }
  const basis = seedBasis(entry.exerciseId, seed);
  if (!basis) return { kind: "first" };
  return { kind: "seeded", basis, ...(seed.lastDone != null ? { lastDone: seed.lastDone } : {}) };
}

/** "0.89 of your bench press estimate (20 pairs)": a seed's basis, short. */
export function seedBasisText(basis: SeedBasis): string {
  switch (basis.from) {
    case "learned":
      return `${basis.ratio.toFixed(2)} of your ${basis.lift} estimate (${basis.pairs} ${basis.pairs === 1 ? "pair" : "pairs"})`;
    case "estimate":
      return `${basis.ratio.toFixed(2)} of your ${basis.lift} estimate`;
    case "ratio":
      return `${basis.ratio.toFixed(2)} of your ${formatLbs(basis.barbellWeight)} ${basis.lift}`;
    case "conversion":
      return `${Math.round(DUMBBELL_LOAD_FACTOR * 100)}% of your ${formatLbs(basis.barbellWeight)} ${basis.lift}`;
    case "harderVariant":
      return "harder version, same load";
  }
}

/** "Nov 3", or "Nov 3, 2024" when it is not this year. */
export function historyDay(at: number, now: Date = new Date()): string {
  const date = new Date(at);
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/**
 * A held home weight that is the heaviest dumbbell says so, with the cap policy's next
 * step (`capNextStep`: the harder exercise, or more reps a set). Any other reason, and
 * any lift not done as a home exercise, is returned as it is.
 */
export function atDumbbellCap(
  entry: ReasonEntry & { perHand?: boolean },
  reason: LiftReason,
  equipment: Pick<EquipmentProfile, "maxDumbbellWeight" | "dumbbellIncrementLbs">
): LiftReason {
  if (reason.kind !== "held" || !entry.substituteExerciseId) return reason;
  if (entry.tier !== "T1" && entry.tier !== "T2" && entry.tier !== "T3") return reason;
  if (entry.weight < equipment.maxDumbbellWeight) return reason;
  const next = capNextStep(
    {
      liftId: entry.exerciseId,
      exerciseId: entry.substituteExerciseId,
      tier: entry.tier,
      weight: entry.weight,
      perHand: entry.perHand ?? EXERCISES[entry.substituteExerciseId]?.grip === "per_hand",
    },
    equipment
  );
  return { kind: "capped", weight: reason.weight, next };
}

/** "A pass adds 1 rep a set", "A pass moves to Bulgarian split squat"; null when not capped. */
export function capNextText(reason: LiftReason): string | null {
  if (reason.kind !== "capped") return null;
  const { next } = reason;
  if (next.policy === "harderVariant") return `A pass moves to ${nameInSentence(next.exerciseId)}`;
  if (next.policy === "reps") return `A pass adds ${next.reps} ${next.reps === 1 ? "rep" : "reps"} a set`;
  return "The last set asks for as many reps as you can";
}

/**
 * The reason as plain text, e.g. "▲ 10 from 205", "Held at 65", "First time", or for a
 * first home weight from imported history "From your history: last 45 × 10 on Nov 3".
 */
export function reasonText(reason: LiftReason): string {
  switch (reason.kind) {
    case "up":
      return `▲ ${formatLbs(reason.change)} from ${formatLbs(reason.from)}`;
    case "down":
      return `▼ ${formatLbs(reason.change)} from ${formatLbs(reason.from)}`;
    case "held":
      return `Held at ${formatLbs(reason.weight)}`;
    case "capped":
      return `Held at ${formatLbs(reason.weight)}, your heaviest dumbbell`;
    case "history":
      return `From your history: last ${formatLbs(reason.weight)} × ${reason.reps} on ${historyDay(reason.at)}`;
    case "seeded":
      return `${reason.lastDone != null ? `Last done ${historyDay(reason.lastDone)}` : "First time"} · ${seedBasisText(reason.basis)}`;
    case "unconfirmed":
      return `Default starting weight. Your history suggests ${formatLbs(reason.suggested)}${reason.perHand ? " a hand" : ""}: confirm it in Import history`;
    case "notYetInApp":
      return "First time in the app; it is in your imported history";
    case "first":
      return "First time";
  }
}
