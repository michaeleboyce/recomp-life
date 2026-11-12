import { getExercise } from "@/lib/exercises";
import { evaluateT1Progression, evaluateT2Progression, shouldFreezeProgression } from "@/lib/progression";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { LiftState } from "@/types";
import { workingSetsFor } from "./setSelectors";
import type { CompletionInput, CompletionResult } from "./types";

/** How many entries each tracking array keeps. */
const TRACKING_WINDOW = 5;

/** What differs between the T1 and T2 halves of a lift state. */
const PROGRESSING_TIERS = {
  T1: { lastWorkoutDate: "t1LastWorkoutDate", evaluate: evaluateT1Progression },
  T2: { lastWorkoutDate: "t2LastWorkoutDate", evaluate: evaluateT2Progression },
} as const;

function isProgressingTier(tier: string): tier is keyof typeof PROGRESSING_TIERS {
  return tier === "T1" || tier === "T2";
}

/**
 * Everything that changes when a workout is finished, computed without touching the
 * database: new lift states (progression, or a freeze that only updates the last-
 * workout date when an exercise was partially completed) and the patch for the
 * session row. T1 and T2 share one code path.
 */
export function computeCompletion(input: CompletionInput): CompletionResult {
  const { session, plan, sets, liftStates, settings, recentE1RMsByExercise, now } = input;

  // Latest version of each lift state, so a second update of one exercise builds on
  // the first. `changed` keeps the order in which exercises were first updated.
  const current = new Map<string, LiftState>(liftStates.map((ls) => [ls.exerciseId, ls]));
  const changed: string[] = [];

  const template = WORKOUT_TEMPLATES[session.templateId];

  for (const templateEx of template?.exercises ?? []) {
    // T3 and accessories do not change lift state.
    if (!isProgressingTier(templateEx.tier)) continue;
    const tier = PROGRESSING_TIERS[templateEx.tier];

    const liftState = current.get(templateEx.exerciseId);
    if (!liftState) continue;

    const exerciseSets = workingSetsFor(sets, templateEx.exerciseId, templateEx.tier);
    if (exerciseSets.length === 0) continue;

    const planEntry = plan.find(
      (entry) =>
        entry.exerciseId === templateEx.exerciseId &&
        entry.tier === templateEx.tier &&
        !entry.isWarmUp
    );
    const targetSets = planEntry?.targetSets ?? templateEx.sets;

    let next: LiftState;
    if (shouldFreezeProgression(exerciseSets.length, targetSets)) {
      // Partial completion: no pass, no fail, only the date moves.
      next = { ...liftState, [tier.lastWorkoutDate]: now, synced: false };
    } else {
      const liftType =
        getExercise(templateEx.exerciseId).muscleGroup === "legs" ? "lower" : "upper";
      const rpes = exerciseSets.flatMap((set) => (set.rpe != null ? [set.rpe] : []));
      const amrapSet = exerciseSets.find((set) => set.isAMRAP);
      const previousRPEs = liftState.recentAvgRPEs || [];
      const previousAMRAPReps = liftState.recentAMRAPReps || [];

      next = {
        ...tier.evaluate(liftState, exerciseSets, session.location, settings.equipment, liftType),
        [tier.lastWorkoutDate]: now,
        // No entry means the caller did not look this exercise up: keep what is stored
        // instead of wiping it. An explicit empty array still clears it.
        recentE1RMs: (
          recentE1RMsByExercise[templateEx.exerciseId] ??
          liftState.recentE1RMs ??
          []
        ).slice(0, TRACKING_WINDOW),
        recentAvgRPEs:
          rpes.length > 0
            ? [...previousRPEs, rpes.reduce((a, b) => a + b, 0) / rpes.length].slice(
                -TRACKING_WINDOW
              )
            : previousRPEs,
        recentAMRAPReps: amrapSet
          ? [...previousAMRAPReps, amrapSet.actualReps].slice(-TRACKING_WINDOW)
          : previousAMRAPReps,
        synced: false,
      };
    }

    current.set(templateEx.exerciseId, next);
    if (!changed.includes(templateEx.exerciseId)) changed.push(templateEx.exerciseId);
  }

  const totalDurationSeconds = input.workoutStartTime
    ? Math.floor((now.getTime() - input.workoutStartTime.getTime()) / 1000)
    : 0;
  const endedEarly = input.currentExerciseIndex < plan.length;

  return {
    liftStateUpdates: changed.map((exerciseId) => current.get(exerciseId)!),
    sessionPatch: {
      completedAt: now,
      totalDurationSeconds,
      sets,
      ...(endedEarly ? { endedEarly: true as const } : {}),
    },
  };
}
