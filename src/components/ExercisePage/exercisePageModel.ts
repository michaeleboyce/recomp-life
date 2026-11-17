// What one exercise's page shows, about that exercise only. Pure: no React, no database.
// Spec: docs/plans/2026-11-17-exercise-page-design.md (E1-E4, E9, E10).
import { ACCESSORY_IDS, EXERCISES } from "@/lib/exercises";
import { isMainLift, LIFT_NAMES, type MainLiftId } from "@/lib/liftNames";
import { T3_LAST_SET_INCREASE_REPS } from "@/lib/progression";
import {
  sessionEstimates,
  targetEstimates,
  type StrengthSet,
  type TransferRatio,
} from "@/lib/strength";
import { pooledEstimateOf, transferRatioOf } from "@/lib/workout/strength";
import type { UpcomingWorkout } from "@/lib/workout/upcoming";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  Estimated1RM,
  LiftAdjustment,
  LiftState,
  NextSetPlan,
  PlannedSet,
  Tier,
  WorkoutSession,
} from "@/types";
import type { Point } from "@/lib/metrics/types";
import { displayLiftName } from "@/components/Today/todayModel";
import { homeSubstitutesOf, programLiftFor } from "@/components/Lift/homeVersion";
import { liftSessions, type LiftSession } from "@/components/Lift/sessions";

/**
 * What kind of exercise a page is about:
 * - `lift`: one of the four barbell program lifts, done as itself.
 * - `home`: a home version of a program lift (`liftId`), with a weight of its own.
 * - `t3`: a program T3 exercise (in the rotation at T3).
 * - `accessory`: an accessory the user can add to a workout.
 * - `reference`: anything else in the catalogue.
 */
export type ExerciseKind =
  | { kind: "lift"; liftId: MainLiftId }
  | { kind: "home"; liftId: MainLiftId }
  | { kind: "t3" }
  | { kind: "accessory" }
  | { kind: "reference" };

/** Exercises the rotation has at T3. */
const PROGRAM_T3 = new Set(
  Object.values(WORKOUT_TEMPLATES).flatMap((t) => t.exercises.filter((e) => e.tier === "T3").map((e) => e.exerciseId))
);

export function classifyExercise(exerciseId: string): ExerciseKind {
  if (isMainLift(exerciseId)) return { kind: "lift", liftId: exerciseId };
  if (PROGRAM_T3.has(exerciseId)) return { kind: "t3" };
  const lift = programLiftFor(exerciseId);
  if (isMainLift(lift)) return { kind: "home", liftId: lift };
  if (ACCESSORY_IDS.includes(exerciseId)) return { kind: "accessory" };
  return { kind: "reference" };
}

/** The page's title: the catalogue name of a barbell lift ("Barbell Squat"), else the display name. */
export function exerciseTitle(exerciseId: string, kind: ExerciseKind): string {
  if (kind.kind === "lift") return EXERCISES[exerciseId]?.name ?? LIFT_NAMES[kind.liftId].label;
  return EXERCISES[exerciseId] ? displayLiftName(exerciseId) : exerciseId;
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).replace("_", " ");

/** "T1 · Squat", "Home version of Squat", "T3 · Pull", "Accessory", "Exercise". */
export function exerciseEyebrow(exerciseId: string, kind: ExerciseKind, nextTier?: Tier): string {
  switch (kind.kind) {
    case "lift":
      return `${nextTier === "T2" ? "T2" : "T1"} · ${LIFT_NAMES[kind.liftId].label}`;
    case "home":
      return `Home version of ${LIFT_NAMES[kind.liftId].label}`;
    case "t3":
      return `T3 · ${capitalise(EXERCISES[exerciseId]?.muscleGroup ?? "lift")}`;
    case "accessory":
      return "Accessory";
    case "reference":
      return "Exercise";
  }
}

/** The exercise a plan entry or logged set was actually done as. */
export function performedId(entry: Pick<WorkoutExerciseState, "exerciseId" | "substituteExerciseId">): string {
  return entry.substituteExerciseId || entry.exerciseId;
}

/** The first coming workout with this exercise performed (warm-ups left out). */
export interface NextPlanned {
  entry: WorkoutExerciseState;
  templateId: string;
  /** 0 for the next workout, 1 for the one after, and so on. */
  workoutsAway: number;
  /** True when its weight assumes the workouts before it go as planned. */
  projected: boolean;
}

export function nextPlannedEntry(
  upcoming: readonly Pick<UpcomingWorkout, "templateId" | "plan" | "projected">[] | undefined,
  exerciseId: string
): NextPlanned | null {
  if (!upcoming) return null;
  for (let i = 0; i < upcoming.length; i++) {
    const workout = upcoming[i];
    const entry = workout.plan.find((e) => !e.isWarmUp && performedId(e) === exerciseId);
    if (entry) return { entry, templateId: workout.templateId, workoutsAway: i, projected: workout.projected };
  }
  return null;
}

/**
 * Every session in which this exercise was performed, newest first: its own sets (not
 * done as a home version of something else) and the sets done as a home version of
 * another lift. A barbell lift's page so has no home rows, and a home version's page
 * only its own.
 */
export function performedSessions(
  workouts: readonly WorkoutSession[],
  e1rms: readonly Estimated1RM[],
  exerciseId: string
): LiftSession[] {
  const own = liftSessions([...workouts], [...e1rms], exerciseId).filter((s) => !s.substituteExerciseId);
  const parents = new Set<string>();
  for (const workout of workouts) {
    for (const set of workout.sets ?? []) {
      if (set.substituteExerciseId === exerciseId && set.exerciseId !== exerciseId) parents.add(set.exerciseId);
    }
  }
  const asOther = [...parents].flatMap((liftId) =>
    liftSessions([...workouts], [], liftId).filter((s) => s.substituteExerciseId === exerciseId)
  );
  return [...own, ...asOther].sort((a, b) => b.t - a.t);
}

/** The weight last lifted, from the newest session; null with none. */
export function lastWeight(sessions: readonly LiftSession[]): Pick<LiftSession, "weight" | "tier" | "t"> | null {
  const latest = sessions[0];
  return latest ? { weight: latest.weight, tier: latest.tier, t: latest.t } : null;
}

/**
 * The weight changes about this exercise only, in the order given: a home exercise's
 * own (`variant.exerciseId`), and for anything done as itself its adjustments without
 * `variant`. So a home version never lists the barbell lift's starting weights.
 */
export function exerciseAdjustments(
  adjustments: readonly LiftAdjustment[] | undefined,
  exerciseId: string
): LiftAdjustment[] | undefined {
  if (!adjustments) return undefined;
  return adjustments.filter((a) =>
    a.variant ? a.variant.exerciseId === exerciseId : a.exerciseId === exerciseId
  );
}

/**
 * The plan's own weight for a lift's tier while it is set by hand (`LiftState.t1PlannedWeight`
 * and the like, E7), or null when it is not or when it is the same.
 */
export function liftPlanWeight(state: LiftState | undefined, tier: Tier, weight: number): number | null {
  if (!state) return null;
  const planned =
    tier === "T1" ? state.t1PlannedWeight : tier === "T2" ? state.t2PlannedWeight : tier === "T3" ? state.t3PlannedWeight : undefined;
  return planned !== undefined && planned !== weight ? planned : null;
}

/** The exercise's own estimated max per session, oldest first, from its own T1 sets. */
export function strengthPoints(sets: readonly StrengthSet[] | undefined, exerciseId: string): Point[] {
  if (!sets) return [];
  return sessionEstimates(sets, exerciseId).map((e) => ({ t: new Date(e.date).getTime(), v: e.estimatedMax }));
}

/** One T3 session's last set against the rep count that adds weight. */
export interface T3LastSet {
  key: string;
  t: number;
  weight: number;
  reps: number;
  /** The last set reached T3_LAST_SET_INCREASE_REPS. */
  reached: boolean;
}

/**
 * The last set of each of the newest T3 sessions, newest first.
 */
export function t3LastSets(sessions: readonly LiftSession[], limit = 5): T3LastSet[] {
  return sessions
    .filter((s) => s.tier === "T3" && s.sets.length > 0)
    .slice(0, limit)
    .map((s) => {
      const reps = s.sets[s.sets.length - 1].reps;
      return { key: s.key, t: s.t, weight: s.weight, reps, reached: reps >= T3_LAST_SET_INCREASE_REPS };
    });
}

/** What a home exercise says about its program lift. */
export interface HomeCountsToward {
  liftId: MainLiftId;
  /** The lift's pooled strength estimate, or null with no evidence. */
  pooled: number | null;
  /** What this exercise's latest session (or target) says about the lift: "≈ squat 205". */
  says: number | null;
  /** True when `says` is from a weight set by hand, not a logged session. */
  fromTarget: boolean;
  ratio: TransferRatio | null;
}

/**
 * The lift's pooled estimate, what this exercise's own latest session says the lift
 * is (its strength ÷ the ratio), and the ratio with its pairs.
 */
export function homeCountsToward(
  sets: readonly StrengthSet[] | undefined,
  liftId: MainLiftId,
  exerciseId: string
): HomeCountsToward {
  if (!sets) return { liftId, pooled: null, says: null, fromTarget: false, ratio: null };
  const pooled = pooledEstimateOf(sets, liftId);
  const ratio = transferRatioOf(sets, liftId, exerciseId);
  const logged = sessionEstimates(sets, exerciseId).at(-1);
  const target = logged ? undefined : targetEstimates(sets, exerciseId).at(-1);
  const latest = logged ?? target;
  const says = latest && ratio && ratio.ratio > 0 ? Math.round(latest.strength / ratio.ratio) : null;
  return { liftId, pooled: pooled?.value ?? null, says, fromTarget: !logged && !!target, ratio };
}

/** A barbell lift's home versions with the ratio the log supports for each. */
export function liftHomeVersions(
  sets: readonly StrengthSet[] | undefined,
  liftId: MainLiftId
): { exerciseId: string; ratio: TransferRatio | null }[] {
  return homeSubstitutesOf(liftId).map((exerciseId) => ({
    exerciseId,
    ratio: sets ? transferRatioOf(sets, liftId, exerciseId) : null,
  }));
}

/** "starting ratio" with no pairs of the user's own, else "from 3 pairs". */
export function ratioBasisText(ratio: Pick<TransferRatio, "pairs">): string {
  return ratio.pairs === 0 ? "starting ratio" : `from ${ratio.pairs} ${ratio.pairs === 1 ? "pair" : "pairs"} of your sessions`;
}

/** The sets the next session plans, one per set. */
export function planSetsOf(
  entry: Pick<WorkoutExerciseState, "targetSets" | "targetReps" | "weight" | "perSet">
): PlannedSet[] {
  return (
    entry.perSet?.map((s) => ({ ...s })) ??
    Array.from({ length: entry.targetSets }, () => ({ weight: entry.weight, reps: entry.targetReps }))
  );
}

/**
 * The sets to show in the set editor: the stored next-session plan's when it has one
 * with as many sets as the plan, else the plan's own.
 */
export function editorSets(stored: NextSetPlan | undefined, planSets: PlannedSet[]): PlannedSet[] {
  return stored && stored.sets.length === planSets.length ? stored.sets : planSets;
}

/** True when two set lists are the same weights and reps in the same order. */
export function sameSets(a: readonly PlannedSet[], b: readonly PlannedSet[]): boolean {
  return a.length === b.length && a.every((s, i) => s.weight === b[i].weight && s.reps === b[i].reps);
}
