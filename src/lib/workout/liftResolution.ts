// What a workout does for each program lift, worked out once: the exercise performed,
// its weight as lifted and its scheme, the program's own prescription for the lift and,
// at home, the home exercise standing in. The prescription a session records and the
// plan it runs are both read from this one resolution. Pure: no React, no database.
import { DEFAULT_ACCESSORY_WEIGHTS, EXERCISES, getExercise } from "@/lib/exercises";
import type { StrengthSet } from "@/lib/strength";
import { generateWarmUpSets } from "@/lib/warmups";
import type {
  EquipmentProfile,
  LiftState,
  NextSetPlan,
  PlanEdit,
  PrescribedEntry,
  T1Stage,
  T2Stage,
  Tier,
  VariantSeed,
  VariantState,
  WorkoutLocation,
  WorkoutTemplate,
  WorkoutTemplateExercise,
} from "@/types";
import { nextSetPlanEdits } from "./nextSetPlans";
import { applyPlanEdits } from "./planEdits";
import { getPrescription } from "./prescription";
import { reentryKey } from "./reentry";
import type { PlanReentry, WorkoutExerciseState, WorkoutPlan } from "./types";
import { chooseHomeVariant, homePrescriptionOf, isVariantTier, type VariantTier } from "./variant";

/** Tiers that get generated warm-up sets when warm-ups are enabled. */
export const WARM_UP_TIERS: readonly Tier[] = ["T1"];

/** The home exercise standing in for a program lift, as a resolution carries it. */
export interface HomeResolution {
  /** The variant state the weight and scheme come from. */
  variantId: string;
  /** True when the weight is per hand (two dumbbells). */
  perHand: boolean;
  /** The home exercise's stage (T1, T2), or null (T3). */
  stage: VariantState["stage"];
  /** The weight asked for when `weight` is capped at the heaviest dumbbell. */
  cappedFrom?: number;
  /** For a home exercise never done for this lift and tier: how its first weight was chosen (H3). */
  seed?: VariantSeed;
}

/**
 * One program lift of a day, resolved: what is performed, at what weight and scheme,
 * and why. Every planning path reads these: the plan (`planFromLifts`) and the
 * prescription recorded at start (`prescriptionOf`) are two views of the same values.
 */
export interface LiftResolution {
  /** The template slot (the program lift and tier). */
  slot: WorkoutTemplateExercise;
  /** The program lift. */
  liftId: string;
  tier: VariantTier;
  /** The exercise performed: the lift itself, or at home the exercise standing in for it. */
  exerciseId: string;
  /** As lifted: per hand for a per-hand home exercise. */
  weight: number;
  sets: number;
  reps: number;
  /** The program's prescription for the lift itself, in barbell terms (the barbell-equivalent weight at home). */
  program: { weight: number; sets: number; reps: number; stage?: T1Stage | T2Stage };
  /** At home, when another exercise stands in for the lift. */
  home?: HomeResolution;
  /** The re-entry decision behind `weight`, when the first session back at a location took one (H6). */
  reentry?: PlanReentry;
}

export interface LiftResolutionInput {
  template: WorkoutTemplate;
  liftStates: readonly LiftState[];
  location: WorkoutLocation;
  equipment: EquipmentProfile;
  /** The home exercises' own states; left out, home lifts are planned from their seeds. Ignored at the gym. */
  variantStates?: readonly VariantState[];
  /** Every set as strength evidence: seeds a home exercise never used (H3). */
  strengthSets?: readonly StrengthSet[];
  /** Home substitutes picked on Configure (template exerciseId -> substitute id). */
  overrides?: Record<string, string>;
  /** Re-entry decisions for the states given (`resolveReentry`), by `reentryKey`. */
  reentries?: ReadonlyMap<string, PlanReentry>;
}

function stageOf(liftState: LiftState | undefined, tier: VariantTier): T1Stage | T2Stage | undefined {
  return tier === "T1" ? liftState?.t1Stage : tier === "T2" ? liftState?.t2Stage : undefined;
}

/**
 * Each program lift of the day (the template's T1, T2 and T3), resolved from the states
 * given. The program's prescription comes from the lift state (`getPrescription`). At
 * home, a gym-only lift is done as its home exercise (`chooseHomeVariant`): the current
 * variant's own weight and scheme, a variant never used seeded (H3), an entry in
 * `overrides` picking one of the conversion's alternatives. A re-entry decision is kept
 * on the lift it decided: the lift itself at the gym, its home exercise at home.
 *
 * @evidence home-progression
 */
export function resolveLifts(input: LiftResolutionInput): LiftResolution[] {
  const { template, location, equipment, strengthSets } = input;
  const overrides = input.overrides ?? {};
  const variantStates = input.variantStates ?? [];
  const liftStateById = new Map(input.liftStates.map((ls) => [ls.exerciseId, ls]));
  const lifts: LiftResolution[] = [];

  for (const slot of template.exercises) {
    getExercise(slot.exerciseId);
    if (!isVariantTier(slot.tier)) continue;
    const tier = slot.tier;
    const liftState = liftStateById.get(slot.exerciseId);
    const prescription = getPrescription(slot, liftState);
    const stage = stageOf(liftState, tier);
    const program = { ...prescription, ...(stage ? { stage } : {}) };

    const choice =
      location === "home"
        ? chooseHomeVariant({
            liftId: slot.exerciseId,
            tier,
            liftState,
            variantStates,
            equipment,
            overrideId: overrides[slot.exerciseId],
            ...(strengthSets ? { strengthSets } : {}),
          })
        : null;
    // Null for "no_substitute" and for exercises that already work at home.
    const lift: LiftResolution = choice
      ? (() => {
          const home = homePrescriptionOf(choice, { sets: slot.sets, reps: slot.reps });
          return {
            slot,
            liftId: slot.exerciseId,
            tier,
            exerciseId: home.exerciseId,
            weight: home.weight,
            sets: home.sets,
            reps: home.reps,
            program,
            home: {
              variantId: choice.state.id,
              perHand: home.perHand,
              stage: choice.state.stage,
              ...(choice.cappedFrom != null ? { cappedFrom: choice.cappedFrom } : {}),
              ...(choice.seeded ? { seed: choice.state.seed } : {}),
            },
          };
        })()
      : {
          slot,
          liftId: slot.exerciseId,
          tier,
          exerciseId: slot.exerciseId,
          weight: prescription.weight,
          sets: prescription.sets,
          reps: prescription.reps,
          program,
        };

    const reentry = input.reentries?.get(reentryKey(lift.liftId, tier));
    const decided =
      reentry &&
      (reentry.location === "gym" ? !lift.home : lift.home != null && reentry.exerciseId === lift.exerciseId);
    lifts.push(decided ? { ...lift, reentry } : lift);
  }
  return lifts;
}

/**
 * What the program prescribes for each lift, as a session stores it at start: the lift's
 * own prescription and, done as a home exercise, that exercise's (`PrescribedEntry.home`).
 * Read from the same resolution as the plan, so the two cannot disagree.
 */
export function prescriptionOf(lifts: readonly LiftResolution[]): PrescribedEntry[] {
  return lifts.map((lift) => ({
    exerciseId: lift.liftId,
    tier: lift.tier,
    weight: lift.program.weight,
    sets: lift.program.sets,
    reps: lift.program.reps,
    ...(lift.program.stage ? { stage: lift.program.stage } : {}),
    ...(lift.home
      ? {
          home: {
            exerciseId: lift.exerciseId,
            weight: lift.weight,
            perHand: lift.home.perHand,
            ...(lift.home.stage ? { stage: lift.home.stage } : {}),
            sets: lift.sets,
            reps: lift.reps,
          },
        }
      : {}),
  }));
}

export interface PlanOptions {
  location: WorkoutLocation;
  equipment: EquipmentProfile;
  includeWarmUps: boolean;
  selectedAccessories: readonly string[];
}

/**
 * The program's plan of a day from its resolved lifts, before any edit: for each lift
 * its warm-ups (when enabled and the tier is in WARM_UP_TIERS) and its working entry,
 * then the selected accessories. A home exercise keeps the barbell weight it stands for
 * as `originalWeight`. Every entry starts at completedSets 0.
 */
export function planFromLifts(lifts: readonly LiftResolution[], options: PlanOptions): WorkoutPlan {
  const { location, equipment, includeWarmUps, selectedAccessories } = options;
  const plan: WorkoutPlan = [];
  for (const lift of lifts) {
    const substituteExerciseId = lift.home ? lift.exerciseId : undefined;
    const originalWeight = lift.home ? lift.program.weight : undefined;
    if (includeWarmUps && WARM_UP_TIERS.includes(lift.tier)) {
      for (const warmUp of generateWarmUpSets(lift.weight, location, equipment)) {
        plan.push({
          exerciseId: lift.liftId,
          substituteExerciseId,
          tier: "warmup",
          targetSets: 1,
          targetReps: warmUp.reps,
          weight: warmUp.weight,
          originalWeight,
          isAMRAP: false,
          isWarmUp: true,
          completedSets: 0,
        });
      }
    }
    const entry: WorkoutExerciseState = {
      exerciseId: lift.liftId,
      substituteExerciseId,
      tier: lift.tier,
      targetSets: lift.sets,
      targetReps: lift.reps,
      weight: lift.weight,
      originalWeight,
      isAMRAP: lift.slot.isAMRAP,
      isWarmUp: false,
      completedSets: 0,
      ...(lift.home
        ? {
            variantId: lift.home.variantId,
            perHand: lift.home.perHand,
            ...(lift.home.cappedFrom != null ? { cappedFrom: lift.home.cappedFrom } : {}),
            ...(lift.home.seed ? { seed: lift.home.seed } : {}),
          }
        : {}),
      ...(lift.reentry ? { reentry: lift.reentry } : {}),
    };
    plan.push(entry);
  }

  for (const accessoryId of selectedAccessories) {
    if (!EXERCISES[accessoryId]) continue;
    plan.push({
      exerciseId: accessoryId,
      tier: "accessory",
      targetSets: 3,
      targetReps: 15,
      weight: DEFAULT_ACCESSORY_WEIGHTS[accessoryId] ?? 0,
      isAMRAP: true,
      isWarmUp: false,
      completedSets: 0,
    });
  }
  return plan;
}

/**
 * The program's plan with next-session set plans (E6) and then the user's edits applied,
 * in that order, so a change made in Edit workout wins. Returns the plan and the set-plan
 * edits used (saved on the session ahead of the user's).
 */
export function withPlanEdits(
  base: WorkoutPlan,
  nextSetPlans: Readonly<Record<string, NextSetPlan>> | undefined,
  edits: readonly PlanEdit[] | undefined
): { plan: WorkoutPlan; nextSetPlanEdits: PlanEdit[] } {
  const setPlanEdits = nextSetPlanEdits(base, nextSetPlans);
  const all = [...setPlanEdits, ...(edits ?? [])];
  return { plan: all.length ? applyPlanEdits(base, all) : base, nextSetPlanEdits: setPlanEdits };
}
