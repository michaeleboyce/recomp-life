import type { LiftState, Tier, WorkoutSession, WorkoutTemplate } from "@/types";
import type { BuildPlanInput, NextWorkoutDescription, WorkoutPlan } from "./types";

const NOT_IMPLEMENTED = "not implemented: src/lib/workout contract stub";

/** Tiers that get generated warm-up sets when warm-ups are enabled. */
export const WARM_UP_TIERS: readonly Tier[] = ["T1"];

/**
 * The ordered list of everything performed in a workout: for each template exercise
 * its warm-up entries (when enabled and the tier is in WARM_UP_TIERS) followed by the
 * working entry, then the selected accessories. Every entry starts at completedSets 0.
 *
 * At home, gym-only exercises are adapted with `adaptExerciseForHome`; an entry in
 * `overrides` selects one of that adaptation's alternatives instead of the default.
 */
export function buildWorkoutPlan(input: BuildPlanInput): WorkoutPlan {
  void input;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Reads the home substitutes saved on a session (`modifications` entries with
 * action "substitute" and source "equipment_limit") back into an overrides map.
 */
export function overridesFromSession(
  session: Pick<WorkoutSession, "modifications">
): Record<string, string> {
  void session;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Which template comes next in the A1 -> B1 -> A2 -> B2 rotation given completed
 * workouts (any order), and its plan. Unfinished workouts do not advance the rotation.
 */
export function describeNextWorkout(input: {
  completedWorkouts: Pick<WorkoutSession, "templateId" | "startedAt" | "completedAt">[];
  templates: Record<string, WorkoutTemplate>;
  liftStates: LiftState[];
  plan: Omit<BuildPlanInput, "template" | "liftStates">;
}): NextWorkoutDescription {
  void input;
  throw new Error(NOT_IMPLEMENTED);
}
