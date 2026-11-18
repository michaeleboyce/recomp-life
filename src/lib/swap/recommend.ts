// Recommended swaps (W7, W8): which exercises can stand in for one in a workout, ranked
// by a score broken into named parts, each with the weight, sets and reps it would be
// done at. Pure and deterministic: the same input gives the same output; the clock is
// `now`. Spec: docs/plans/2026-11-18-future-workouts-and-swaps-design.md.
import { NEEDS_BENCH, accessoryPrescription, accessoryLoadStep, ownHistoryFirstWeight } from "@/lib/accessories/index";
import { DAY_MS, calendarDaysBetween } from "@/lib/dates";
import { getPreference, resolvePreferences } from "@/lib/exercisePreferences";
import { ACCESSORY_IDS, DEFAULT_ACCESSORY_WEIGHTS, EXERCISES } from "@/lib/exercises";
import { MUSCLE_LABELS } from "@/lib/muscles";
import { STRENGTH_POOLING, asLifted, impliedWeightForReps, priorFor, type StrengthSet } from "@/lib/strength";
import { joinList, plural } from "@/lib/text";
import { accessoryDay } from "@/lib/workout/accessoryPlan";
import { pooledEstimateOf, transferRatioOf } from "@/lib/workout/strength";
import { chooseHomeVariant, homeOptionsFor, isVariantTier, seedVariantWeight, variantScheme } from "@/lib/workout/variant";
import { swapCountsAsLift } from "./progressionEffect";
import type {
  AccessoryHandSetWeight,
  EquipmentProfile,
  Exercise,
  LiftState,
  ExercisePreferences,
  LocationExercisePreferences,
  MuscleId,
  PainSorenessEntry,
  RecoveryStatus,
  Tier,
  TrainingPhase,
  VariantState,
  WorkoutLocation,
} from "@/types";

// ─── Score parts (heuristic: judgment, not research; rule swap-recommendation) ─
// One constant per W8 item. Each part is at most its weight; the two penalties are
// at most their size below zero.

/** Muscles covered, primary: this many points when every main muscle of the original is a main muscle of the candidate, in proportion otherwise. */
export const SWAP_PRIMARY_WEIGHT = 40;
/** Muscles covered, secondary: this many points when the candidate works every helper muscle of the original, in proportion otherwise. */
export const SWAP_SECONDARY_WEIGHT = 10;
/** Same movement: the candidate is a version of the same lift (its dumbbell or barbell form, or a home exercise for it). */
export const SWAP_SAME_MOVEMENT_POINTS = 15;
/**
 * Tier fit, when the movement is not the same: a T1 or T2 slot is a heavy compound
 * lift, so a candidate that works at least SWAP_COMPOUND_MIN_MUSCLES muscles (main or
 * helper) fits it; any candidate fits a T3 or accessory slot.
 */
export const SWAP_TIER_FIT_POINTS = 5;
/** Muscles (main and helper) at which an exercise counts as a compound lift for tier fit. */
export const SWAP_COMPOUND_MIN_MUSCLES = 3;
/** Marked preferred, overall or at this location. */
export const SWAP_PREFERRED_POINTS = 25;
/** Done before: at most this many points for an exercise done often and lately (app and imported history). */
export const SWAP_HISTORY_WEIGHT = 15;
/** Recency-weighted sessions at which the done-before part reaches half its weight. */
export const SWAP_HISTORY_HALF_SESSIONS = 2;
/** A usable weight: the prescription comes from the lifter's own sets or the strength model, not a default. */
export const SWAP_KNOWN_WEIGHT_POINTS = 10;
/** Taken off when a main muscle the candidate adds (one the original does not work) is still recovering. */
export const SWAP_RECOVERY_PENALTY = 8;
/** Taken off when a pain entry is on a joint the candidate loads. */
export const SWAP_PAIN_PENALTY = 30;
/**
 * The lowest pain severity that counts: severity 1 is informational in the pain rules
 * (`generateModifications`), so it is here too. Soreness never counts.
 */
export const SWAP_PAIN_MIN_SEVERITY = 2;

/** The score parts in the order they are listed, one per W8 item. */
export const SWAP_SCORE_PART_IDS = [
  "primary",
  "secondary",
  "movement",
  "preferred",
  "history",
  "weight",
  "recovery",
  "pain",
] as const;

export type SwapScorePartId = (typeof SWAP_SCORE_PART_IDS)[number];

/** One part of a candidate's score. */
export interface SwapScorePart {
  id: SwapScorePartId;
  /** A short name for the part ("Main muscles", "Done before"). */
  label: string;
  /** Points, rounded to a tenth; negative for a penalty. */
  points: number;
  /** One plain sentence on what earned (or cost) the points. */
  detail: string;
}

/**
 * Where a prescription's weight comes from, in the order they are tried:
 * - "history": the exercise's own recent sets (`ownHistoryOf` through `seedVariantWeight`,
 *   or `ownHistoryFirstWeight`);
 * - "learned": the original lift's pooled estimate through the ratio learned from the
 *   lifter's own pairs;
 * - "estimate": the pooled estimate through the starting ratio;
 * - "progression" / "hand": an accessory's double progression or a weight set by hand
 *   (`accessoryPrescription`);
 * - "ratio": the starting ratio times the original's weight; "conversion": the flat
 *   dumbbell conversion;
 * - "variant": a home version of the lift picked at home, at its own home state's weight
 *   (`chooseHomeVariant`, the home-substitute path; see `SwapCandidate.countsAs`);
 * - "default": the catalogue's default weight (`DEFAULT_ACCESSORY_WEIGHTS`);
 * - "none": no weight is known; the lifter enters one (weight 0).
 */
export type SwapWeightBasis =
  | "history"
  | "learned"
  | "estimate"
  | "progression"
  | "hand"
  | "ratio"
  | "conversion"
  | "variant"
  | "default"
  | "none";

/** What a candidate would be done at. */
export interface SwapPrescription {
  /** As lifted (per dumbbell for a two-dumbbell exercise); 0 with basis "none" or for bodyweight work. */
  weight: number;
  sets: number;
  reps: number;
  isAMRAP: boolean;
  basis: SwapWeightBasis;
  /** One plain sentence on where the weight comes from. */
  note: string;
}

export interface SwapCandidate {
  exerciseId: string;
  /** The sum of `parts`. */
  score: number;
  /** Every part, always in SWAP_SCORE_PART_IDS order (a part that earned nothing is 0). */
  parts: SwapScorePart[];
  /** One line in plain words, built from the top parts. */
  reason: string;
  prescription: SwapPrescription;
  /** The exercise's history (app and imported, warm-ups and weights set by hand left out); absent when never done. */
  history?: SwapHistory;
  /** The original's muscles this candidate works. */
  coverage: SwapCoverage;
  /**
   * The program lift this candidate is done as, when picking it counts as doing the lift
   * (one of its home versions, at home, before the workout: `swapCountsAsLift`). With
   * `liftState` in the context, its prescription is what the home-substitute path plans.
   */
  countsAs?: string;
}

export interface SwapHistory {
  /** Sessions the exercise was done in. */
  timesDone: number;
  lastDone: Date;
  /** The latest of those sessions was imported from another app. */
  imported: boolean;
}

export interface SwapCoverage {
  /** The original's main muscles that are main muscles of the candidate. */
  primary: MuscleId[];
  /** The original's main muscles the candidate leaves out. */
  missingPrimary: MuscleId[];
  /** The original's helper muscles the candidate works (main or helper). */
  secondary: MuscleId[];
}

/** The entry being replaced: its tier and scheme, and its weight for the ratio rules. */
export interface SwapSlot {
  tier: Tier;
  sets: number;
  reps: number;
  isAMRAP: boolean;
  /** The entry's weight as planned (as lifted). */
  weight: number;
  /** At home, the program lift's barbell weight the entry stands for. */
  originalWeight?: number;
}

export interface SwapContext {
  location: WorkoutLocation;
  /** Overall preferences; blocked exercises are never offered, preferred ones score SWAP_PREFERRED_POINTS. */
  preferences?: ExercisePreferences;
  /** Per-location overrides of `preferences` (`resolvePreferences`). */
  preferencesByLocation?: LocationExercisePreferences;
  /** Exercises already in the workout (their own ids and home substitutes); never offered. */
  exclude?: readonly string[];
  /**
   * The entry being replaced. A T1, T2 or T3 keeps its sets, reps and AMRAP; an accessory
   * (or absent) takes the candidate's own accessory prescription.
   */
  slot?: SwapSlot;
  /** For weights: dumbbell step and heaviest dumbbell. Absent: the weight rules that need it are skipped. */
  equipment?: EquipmentProfile;
  /** Every set as strength evidence (`useStrengthEvidence`: app, imported and hand-set targets). */
  strengthSets?: readonly StrengthSet[];
  /** Accessory weights set by hand (`settings.accessoryWeights`). */
  accessoryWeights?: Readonly<Record<string, AccessoryHandSetWeight>>;
  /** Recovery per muscle (`recoveryFromLastTrained`). */
  recovery?: Partial<Record<MuscleId, RecoveryStatus>>;
  /** Pain and soreness entries still open (only pain at SWAP_PAIN_MIN_SEVERITY or more counts). */
  painEntries?: readonly Pick<PainSorenessEntry, "region" | "sensation" | "severity">[];
  /** Accepted for the callers' convenience; no part reads it yet. */
  phase?: TrainingPhase;
  /** A swap during the workout: a home version is then a swap like any other. */
  inWorkout?: boolean;
  /** At home: the original lift's state, for a home version's weight (`chooseHomeVariant`). */
  liftState?: LiftState;
  /** At home: the home exercises' states, for a home version's own weight. */
  variantStates?: readonly VariantState[];
  now: Date;
}

const LABELS: Record<SwapScorePartId, string> = {
  primary: "Main muscles",
  secondary: "Helper muscles",
  movement: "Movement",
  preferred: "Preferred",
  history: "Done before",
  weight: "Known weight",
  recovery: "Recovery",
  pain: "Pain",
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const timeOf = (date: Date | string) => new Date(date).getTime();
const muscleName = (m: MuscleId) => MUSCLE_LABELS[m]?.toLowerCase() ?? m;
const muscleList = (ms: readonly MuscleId[]) => joinList(ms.map(muscleName));

/** The program lift (or lifts) an exercise is a version of, itself included. */
function movementFamily(id: string): Set<string> {
  const exercise = EXERCISES[id];
  const family = new Set<string>([id]);
  if (exercise?.barbellEquivalent) family.add(exercise.barbellEquivalent);
  if (exercise?.dumbbellAlternative) family.add(exercise.dumbbellAlternative);
  for (const lift of Object.keys(EXERCISES)) {
    if (homeOptionsFor(lift).includes(id)) family.add(lift);
  }
  return family;
}

/** True when two exercises are versions of one movement (`movementFamily` overlaps). */
export function isSameMovement(a: string, b: string): boolean {
  const fa = movementFamily(a);
  for (const id of movementFamily(b)) if (fa.has(id)) return true;
  return false;
}

/** The original's muscles a candidate covers. */
export function coverageOf(original: Exercise, candidate: Exercise): SwapCoverage {
  const works = new Set([...candidate.primaryMuscles, ...candidate.secondaryMuscles]);
  return {
    primary: original.primaryMuscles.filter((m) => candidate.primaryMuscles.includes(m)),
    missingPrimary: original.primaryMuscles.filter((m) => !candidate.primaryMuscles.includes(m)),
    secondary: original.secondaryMuscles.filter((m) => works.has(m)),
  };
}

/** The sets an exercise was done in, as history: no warm-ups, no weights set by hand, none after `now`. */
function historyOf(sets: readonly StrengthSet[], exerciseId: string, now: number) {
  const sessions = new Map<string, { at: number; imported: boolean }>();
  for (const set of sets) {
    if (set.exerciseId !== exerciseId || set.provisional || set.role === "warmup") continue;
    const at = timeOf(set.date);
    if (!Number.isFinite(at) || at > now) continue;
    const was = sessions.get(set.sessionId);
    if (!was || at > was.at) sessions.set(set.sessionId, { at, imported: set.imported === true });
  }
  return [...sessions.values()];
}

/** "3 weeks ago" style wording for a past date. */
export function agoText(date: Date, now: Date): string {
  const days = calendarDaysBetween(date, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 61) return `${plural(Math.round(days / 7), "week")} ago`;
  return `${plural(Math.round(days / 30), "month")} ago`;
}

// ─── Prescription ────────────────────────────────────────────────────────────

const PROGRAM_TIERS: readonly Tier[] = ["T1", "T2", "T3"];

/** A weight from an estimated max (total load) for `reps`, as lifted, rounded down to `step`. */
function weightFromMax(max: number, exerciseId: string, reps: number, step: number): number {
  const raw = asLifted(impliedWeightForReps(max, reps), exerciseId);
  return Math.floor(raw / step + 1e-9) * step;
}

const SEED_NOTES: Record<string, string> = {
  history: "From your recent sets of it",
  learned: "From your strength on the lift, through your own ratio between the two",
  estimate: "From your strength on the lift, through a starting ratio",
  ratio: "A starting ratio of the lift's weight",
  conversion: "The lift's weight converted to dumbbells",
};

function accessoryFor(
  exerciseId: string,
  sets: readonly StrengthSet[],
  context: SwapContext,
  equipment: Pick<EquipmentProfile, "dumbbellIncrementLbs">
) {
  return accessoryPrescription({
    exerciseId,
    sets: sets.filter((set) => set.exerciseId === exerciseId),
    equipment,
    handSetWeight: context.accessoryWeights?.[exerciseId] ?? null,
    now: accessoryDay(context.now).prescribe,
  });
}

/**
 * What a candidate would be done at, from the existing weight sources only.
 *
 * Accessory slot (or none): the candidate's `accessoryPrescription` (sets, the top of its
 * rep range, AMRAP, and its weight), as the accessory plan adds it (`accessoryAddEdit`).
 *
 * T1, T2 or T3 slot: the slot's sets, reps and AMRAP, and a weight in this order:
 * 1. for a home exercise of the lift (one with a starting ratio), `seedVariantWeight`,
 *    which tries its own recent sets, the pooled estimate through the learned ratio, the
 *    pooled estimate through the starting ratio, then the ratio of the lift's weight (not
 *    capped at the heaviest dumbbell at the gym);
 * 2. otherwise its own recent sets (`ownHistoryFirstWeight` at the slot's reps), then the
 *    pooled estimate through a ratio learned from the lifter's pairs, then an accessory's
 *    double progression or weight set by hand, then the catalogue default; else none.
 */
export function prescribeSwap(exerciseId: string, originalId: string, context: SwapContext): SwapPrescription {
  const sets = usableSets(context);
  const slot = context.slot;
  const equipment = context.equipment;
  const step = accessoryLoadStep(exerciseId, equipment ?? { dumbbellIncrementLbs: 0 });

  if (!slot || !PROGRAM_TIERS.includes(slot.tier)) {
    const p = accessoryFor(exerciseId, sets, context, equipment ?? { dumbbellIncrementLbs: 0 });
    return { weight: p.weight ?? 0, sets: p.sets, reps: p.reps.max, isAMRAP: true, basis: p.basis, note: p.note };
  }

  const scheme = { sets: slot.sets, reps: slot.reps, isAMRAP: slot.isAMRAP };
  const barbellWeight = slot.originalWeight ?? slot.weight;

  // A home version picked at home before the workout is done as the lift: what the
  // home-substitute path plans for it (its own state, or its seed).
  // (Without the lift's state the weight is seeded below, as before.)
  if (equipment && context.liftState && isVariantTier(slot.tier) && swapCountsAsLift(slot.tier, originalId, exerciseId, context)) {
    const choice = chooseHomeVariant({
      liftId: originalId,
      tier: slot.tier,
      liftState: context.liftState,
      variantStates: context.variantStates ?? [],
      equipment,
      overrideId: exerciseId,
      strengthSets: sets,
      now: context.now,
    });
    if (choice && choice.state.exerciseId === exerciseId) {
      const own = variantScheme(choice.state, slot.tier === "T3" ? { sets: slot.sets, reps: slot.reps } : undefined);
      return {
        weight: choice.weight,
        sets: own.sets,
        reps: own.reps,
        isAMRAP: slot.isAMRAP,
        basis: "variant",
        note: choice.seeded ? "Its first weight as a home version of the lift" : "Its own weight as a home version of the lift",
      };
    }
  }

  if (equipment && isVariantTier(slot.tier) && priorFor(originalId, exerciseId)) {
    const seed = seedVariantWeight({
      liftId: originalId,
      exerciseId,
      tier: slot.tier,
      barbellWeight,
      targetReps: slot.reps,
      // The heaviest dumbbell is the home rack's; the gym has heavier ones.
      equipment: context.location === "gym" ? { ...equipment, maxDumbbellWeight: Number.POSITIVE_INFINITY } : equipment,
      strengthSets: sets,
      // The own-history window counts back from the day the swap is planned for.
      now: context.now,
    });
    return { ...scheme, weight: seed.weight, basis: seed.source, note: SEED_NOTES[seed.source] };
  }

  const own = ownHistoryFirstWeight(sets, exerciseId, { min: slot.reps, max: slot.reps }, step);
  if (own) return { ...scheme, weight: own.weight, basis: "history", note: SEED_NOTES.history };

  const ratio = transferRatioOf(sets, originalId, exerciseId);
  const estimate = pooledEstimateOf(sets, originalId)?.value ?? null;
  if (ratio && ratio.basis === "learned" && ratio.ratio > 0 && estimate != null && estimate > 0) {
    const weight = weightFromMax(estimate * ratio.ratio, exerciseId, slot.reps, step);
    if (weight > 0) return { ...scheme, weight, basis: "learned", note: SEED_NOTES.learned };
  }

  if (ACCESSORY_IDS.includes(exerciseId)) {
    const p = accessoryFor(exerciseId, sets, context, equipment ?? { dumbbellIncrementLbs: 0 });
    if ((p.basis === "progression" || p.basis === "hand") && p.weight != null && p.weight > 0) {
      return { ...scheme, weight: p.weight, basis: p.basis, note: p.note };
    }
  }

  const fallback = DEFAULT_ACCESSORY_WEIGHTS[exerciseId];
  if (fallback != null && fallback > 0) {
    return { ...scheme, weight: fallback, basis: "default", note: "A usual starting weight: change it if it is off" };
  }
  return { ...scheme, weight: 0, basis: "none", note: "No weight known yet: enter one" };
}

/** A prescription's weight that the lifter's own sets or the strength model gave. */
const KNOWN_BASES: ReadonlySet<SwapWeightBasis> = new Set(["history", "learned", "estimate", "progression", "hand", "variant"]);

const setsCache = new WeakMap<readonly StrengthSet[], Map<number, StrengthSet[]>>();

/** The evidence up to `now` (weights set by hand kept), once per list and moment. */
function usableSets(context: SwapContext): readonly StrengthSet[] {
  const all = context.strengthSets ?? [];
  const now = context.now.getTime();
  let byNow = setsCache.get(all);
  if (!byNow) {
    byNow = new Map();
    setsCache.set(all, byNow);
  }
  let sets = byNow.get(now);
  if (!sets) {
    sets = all.filter((set) => set.provisional || !(timeOf(set.date) > now));
    byNow.set(now, sets);
  }
  return sets;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function part(id: SwapScorePartId, points: number, detail: string): SwapScorePart {
  return { id, label: LABELS[id], points: round1(points) + 0, detail };
}

function scoreParts(
  original: Exercise,
  candidate: Exercise,
  coverage: SwapCoverage,
  prescription: SwapPrescription,
  history: SwapHistory | undefined,
  historyWeight: number,
  context: SwapContext,
  preferences: ExercisePreferences
): SwapScorePart[] {
  const parts: SwapScorePart[] = [];
  const nPrimary = original.primaryMuscles.length;
  const nSecondary = original.secondaryMuscles.length;

  // Main muscles.
  parts.push(
    part(
      "primary",
      nPrimary > 0 ? (SWAP_PRIMARY_WEIGHT * coverage.primary.length) / nPrimary : 0,
      coverage.missingPrimary.length === 0
        ? `Works ${muscleList(coverage.primary)}, as ${original.name} does`
        : `Works ${muscleList(coverage.primary)} but not ${muscleList(coverage.missingPrimary)}`
    )
  );

  // Helper muscles.
  parts.push(
    part(
      "secondary",
      nSecondary > 0 ? (SWAP_SECONDARY_WEIGHT * coverage.secondary.length) / nSecondary : 0,
      nSecondary === 0
        ? `${original.name} has no helper muscles to match`
        : coverage.secondary.length > 0
          ? `Also works ${muscleList(coverage.secondary)}`
          : "Works none of its helper muscles"
    )
  );

  // Same movement, else tier fit.
  const tier = context.slot?.tier;
  if (isSameMovement(original.id, candidate.id)) {
    parts.push(part("movement", SWAP_SAME_MOVEMENT_POINTS, `A version of the same movement as ${original.name}`));
  } else {
    const heavy = tier === "T1" || tier === "T2";
    const muscles = candidate.primaryMuscles.length + candidate.secondaryMuscles.length;
    const fits = !heavy || muscles >= SWAP_COMPOUND_MIN_MUSCLES;
    parts.push(
      part(
        "movement",
        fits ? SWAP_TIER_FIT_POINTS : 0,
        fits
          ? heavy
            ? `A compound lift, which suits a ${tier}`
            : "A different movement for the same muscles"
          : `An isolation exercise, light for a ${tier}`
      )
    );
  }

  // Preferred.
  const preferred = getPreference(preferences, candidate.id) === "preferred";
  parts.push(part("preferred", preferred ? SWAP_PREFERRED_POINTS : 0, preferred ? "You marked it preferred" : "Not marked preferred"));

  // Done before.
  parts.push(
    part(
      "history",
      historyWeight,
      history
        ? `Done ${plural(history.timesDone, "time")}, last ${agoText(history.lastDone, context.now)}${history.imported ? " (imported)" : ""}`
        : "Not done before"
    )
  );

  // Known weight.
  const known = KNOWN_BASES.has(prescription.basis);
  parts.push(part("weight", known ? SWAP_KNOWN_WEIGHT_POINTS : 0, known ? prescription.note : "No weight from your sets yet"));

  // Recovery of the muscles it adds.
  const worked = new Set([...original.primaryMuscles, ...original.secondaryMuscles]);
  const tired = candidate.primaryMuscles.filter((m) => !worked.has(m) && context.recovery?.[m] === "recovering");
  parts.push(
    part(
      "recovery",
      tired.length > 0 ? -SWAP_RECOVERY_PENALTY : 0,
      tired.length > 0
        ? `Adds ${muscleList(tired)}, still recovering`
        : "Adds no muscle that is still recovering"
    )
  );

  // Pain on a joint it loads.
  const sore = (context.painEntries ?? []).filter(
    (entry) =>
      entry.sensation === "pain" &&
      entry.severity >= SWAP_PAIN_MIN_SEVERITY &&
      candidate.painSensitiveRegions.includes(entry.region)
  );
  const regions = [...new Set(sore.map((entry) => entry.region.replace(/_/g, " ")))].sort();
  parts.push(
    part(
      "pain",
      sore.length > 0 ? -SWAP_PAIN_PENALTY : 0,
      sore.length > 0 ? `Loads your ${joinList(regions)}, where you logged pain` : "Loads no joint where you logged pain"
    )
  );

  return parts;
}

/** The candidate's one-line reason: its two best positive parts, then any penalty. */
function reasonOf(parts: readonly SwapScorePart[]): string {
  const order = (p: SwapScorePart) => SWAP_SCORE_PART_IDS.indexOf(p.id);
  const positive = parts
    .filter((p) => p.points > 0)
    .sort((a, b) => b.points - a.points || order(a) - order(b))
    .slice(0, 2)
    .sort((a, b) => order(a) - order(b));
  const negative = parts.filter((p) => p.points < 0);
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const words = positive.map((p, i) => (i === 0 ? p.detail : lower(p.detail)));
  const line = words.join("; ");
  const warning = negative.map((p) => lower(p.detail)).join("; ");
  if (!line) return warning ? warning.charAt(0).toUpperCase() + warning.slice(1) : "";
  return warning ? `${line}; but ${warning}` : line;
}

/**
 * Exercises that can stand in for `exerciseId`, best first, each with its score broken
 * into parts (SWAP_SCORE_PART_IDS, in that order), a one-line reason, the weight, sets
 * and reps it would be done at (`prescribeSwap`), its history and what it covers.
 *
 * Offered: every exercise in the catalogue that shares at least one main muscle with the
 * original, except the original, those in `exclude`, those blocked (overall or at this
 * location) and, at home, those that need a gym and, when the equipment has no bench,
 * those that need one (`NEEDS_BENCH`, as accessory selection leaves them out). Ranked by
 * score, ties to one that counts as the lift (`countsAs`), then by name, then id.
 * Unknown `exerciseId`: none.
 *
 * @evidence swap-recommendation
 */
export function recommendSwaps(exerciseId: string, context: SwapContext): SwapCandidate[] {
  const original = EXERCISES[exerciseId];
  if (!original) return [];
  const preferences = resolvePreferences(context.preferences, context.preferencesByLocation, context.location);
  const exclude = new Set([exerciseId, ...(context.exclude ?? [])]);
  const sets = usableSets(context);
  const now = context.now.getTime();
  const noBench = context.location === "home" && context.equipment?.hasBench === false;

  const candidates: SwapCandidate[] = [];
  for (const candidate of Object.values(EXERCISES)) {
    if (exclude.has(candidate.id)) continue;
    if (context.location === "home" && candidate.requiresGym) continue;
    if (noBench && NEEDS_BENCH.has(candidate.id)) continue;
    if (getPreference(preferences, candidate.id) === "blocked") continue;
    const coverage = coverageOf(original, candidate);
    if (coverage.primary.length === 0) continue;

    const sessions = historyOf(sets, candidate.id, now);
    let history: SwapHistory | undefined;
    let weighted = 0;
    if (sessions.length > 0) {
      const latest = sessions.reduce((a, b) => (b.at > a.at ? b : a));
      history = { timesDone: sessions.length, lastDone: new Date(latest.at), imported: latest.imported };
      const halfLife = STRENGTH_POOLING.evidenceHalfLifeDays * DAY_MS;
      for (const s of sessions) weighted += Math.pow(0.5, (now - s.at) / halfLife);
    }
    const historyWeight = SWAP_HISTORY_WEIGHT * (weighted / (weighted + SWAP_HISTORY_HALF_SESSIONS));

    const prescription = prescribeSwap(candidate.id, exerciseId, context);
    const counts = !!context.slot && swapCountsAsLift(context.slot.tier, exerciseId, candidate.id, context);
    const parts = scoreParts(original, candidate, coverage, prescription, history, historyWeight, context, preferences);
    const score = round1(parts.reduce((sum, p) => sum + p.points, 0)) + 0;
    candidates.push({
      exerciseId: candidate.id,
      score,
      parts,
      reason: reasonOf(parts),
      prescription,
      ...(history ? { history } : {}),
      coverage,
      ...(counts ? { countsAs: exerciseId } : {}),
    });
  }

  return candidates.sort(
    (a, b) =>
      b.score - a.score ||
      // Among equals, one that counts as the lift comes first.
      Number(!!b.countsAs) - Number(!!a.countsAs) ||
      EXERCISES[a.exerciseId].name.localeCompare(EXERCISES[b.exerciseId].name) ||
      (a.exerciseId < b.exerciseId ? -1 : a.exerciseId > b.exerciseId ? 1 : 0)
  );
}
