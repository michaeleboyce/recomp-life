import { getExercise } from "@/lib/exercises";
import {
  evaluateT1,
  evaluateT2,
  evaluateT3,
  getHoldReason,
  makeOutcome,
  outcomePoint,
  shouldFreezeProgression,
} from "@/lib/progression";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  LiftState,
  ProgressionOutcome,
  ProgressionOutcomeKind,
  ProgressionOutcomeReason,
} from "@/types";
import { classifyEntry, heavierWeightPerformed } from "./credit";
import { workingSetsFor } from "./setSelectors";
import type { CompletionInput, CompletionResult } from "./types";

/** How many entries each tracking array keeps. */
const TRACKING_WINDOW = 5;

/**
 * What differs between the T1 and T2 halves of a lift state. Only T1 sessions feed the
 * effort history (`recentAvgRPEs`, `recentAMRAPReps`): mixing heavy and light days in
 * one array would make its trend meaningless.
 */
const PROGRESSING_TIERS = {
  T1: {
    weight: "t1Weight",
    lastWorkoutDate: "t1LastWorkoutDate",
    evaluate: evaluateT1,
    tracksEffort: true,
  },
  T2: {
    weight: "t2Weight",
    lastWorkoutDate: "t2LastWorkoutDate",
    evaluate: evaluateT2,
    tracksEffort: false,
  },
} as const;

function isProgressingTier(tier: string): tier is keyof typeof PROGRESSING_TIERS {
  return tier === "T1" || tier === "T2";
}

const LOWER_BODY_PRIMARY_MUSCLES: readonly string[] = ["quads", "hamstrings", "glutes"];

/**
 * Which step a lift's T1 and T2 weight goes up by on a pass (`getIncrement`): "lower"
 * for lifts whose main muscles are in the legs or hips (squat, deadlift and their
 * substitutes), "upper" for every other lift.
 */
export function progressionLiftType(exerciseId: string): "upper" | "lower" {
  const exercise = getExercise(exerciseId);
  if (exercise.muscleGroup === "legs") return "lower";
  return exercise.primaryMuscles.some((m) => LOWER_BODY_PRIMARY_MUSCLES.includes(m)) ? "lower" : "upper";
}

/**
 * `computeCompletion`'s result: the lift-state updates and session patch as before,
 * plus what the program rules did to each T1, T2 and T3 lift of the day.
 */
export interface CompletionWithOutcomes extends CompletionResult {
  /**
   * One outcome per T1, T2 and T3 lift of the template that has a lift state, in
   * template order, including the lifts that were not done, were stopped part-way or
   * were only logged. `from` is the lift as it stood going in (what was prescribed),
   * `to` is the lift as it stands afterwards.
   */
  outcomes: ProgressionOutcome[];
}

/**
 * The outcome of a lift that was evaluated from a heavier weight than prescribed: it
 * starts from what was prescribed, and says the heavier weight is why unless the
 * rules gave a reason of their own. A T3 lift that only kept the heavier weight went
 * up because of it.
 */
function fromPrescribed(
  outcome: ProgressionOutcome,
  prescribed: ProgressionOutcome["from"]
): ProgressionOutcome {
  const keptHeavier = outcome.kind === "t3Same";
  return makeOutcome(
    outcome.exerciseId,
    outcome.tier,
    keptHeavier ? "t3Up" : outcome.kind,
    prescribed,
    outcome.to,
    keptHeavier ? "heavier" : (outcome.reason ?? "heavier")
  );
}

/**
 * Everything that changes when a workout is finished, computed without touching the
 * database: new lift states (progression, or a freeze that only updates the last-
 * workout date when an exercise was partially completed), the patch for the session
 * row, and the outcome for each program lift. T1 and T2 share one code path; T3 only
 * ever raises `t3Weight`, and a partially completed T3 changes nothing at all.
 *
 * Each lift is credited on its own (`classifyEntry`): in a session that recorded what
 * the program prescribed, a lift the user edited away from that prescription changes
 * no lift state, and a lift done heavier than prescribed in every set progresses from
 * the heavier weight. Sessions without `prescribed` behave as they always have.
 *
 * The outcomes are a by-product of the same branches that produce the lift states, so
 * they cannot say something the states do not.
 *
 * @evidence off-program-credit
 * @evidence t3-progression
 */
export function computeCompletion(input: CompletionInput): CompletionWithOutcomes {
  const { session, plan, sets, liftStates, settings, recentE1RMsByExercise, now } = input;

  // Latest version of each lift state, so a second update of one exercise builds on
  // the first. `changed` keeps the order in which exercises were first updated.
  const current = new Map<string, LiftState>(liftStates.map((ls) => [ls.exerciseId, ls]));
  const changed: string[] = [];
  const outcomes: ProgressionOutcome[] = [];

  const template = WORKOUT_TEMPLATES[session.templateId];

  for (const templateEx of template?.exercises ?? []) {
    // Accessories do not change lift state.
    if (templateEx.tier !== "T3" && !isProgressingTier(templateEx.tier)) continue;
    const outcomeTier = templateEx.tier;

    const storedLiftState = current.get(templateEx.exerciseId);
    if (!storedLiftState) continue;

    const prescribedPoint = outcomePoint(storedLiftState, outcomeTier);
    /** Records an outcome that leaves the lift exactly as it was. */
    const unchanged = (kind: ProgressionOutcomeKind, reason?: ProgressionOutcomeReason) => {
      outcomes.push(
        makeOutcome(
          templateEx.exerciseId,
          outcomeTier,
          kind,
          prescribedPoint,
          prescribedPoint,
          reason
        )
      );
    };

    const exerciseSets = workingSetsFor(sets, templateEx.exerciseId, templateEx.tier);
    if (exerciseSets.length === 0) {
      unchanged("notDone");
      continue;
    }

    const planEntry = plan.find(
      (entry) =>
        entry.exerciseId === templateEx.exerciseId &&
        entry.tier === templateEx.tier &&
        !entry.isWarmUp
    );
    // A session that recorded its prescription may have been edited: a lift that was
    // removed or swapped out, or done lighter or at another scheme, is only logged.
    if (
      session.prescribed &&
      (!planEntry || classifyEntry(planEntry, session.prescribed, sets) === "logged-only")
    ) {
      unchanged("loggedOnly", "edited");
      continue;
    }
    const targetSets = planEntry?.targetSets ?? templateEx.sets;
    const partial = shouldFreezeProgression(exerciseSets.length, targetSets);
    // Stopping part-way is neither a pass nor a miss. When a set was skipped or reduced
    // for pain, a run or equipment (or a T2 load drop was accepted), that is the reason
    // the outcome gives.
    const holdReason = getHoldReason(outcomeTier, exerciseSets);
    const partialOutcome = () => (holdReason ? unchanged("held", holdReason) : unchanged("partial"));

    // Done heavier than prescribed, every set: the heavier weight becomes the lift's
    // weight, so a pass builds from it. Missing reps at a weight the program did not
    // ask for is not a failure of the prescribed one: nothing changes.
    const heavier =
      session.prescribed && !partial
        ? heavierWeightPerformed(templateEx, session.prescribed, sets)
        : null;
    if (heavier != null && exerciseSets.some((set) => set.status === "failed")) {
      unchanged("held", "heavier");
      continue;
    }
    const liftState =
      heavier == null
        ? storedLiftState
        : {
            ...storedLiftState,
            [isProgressingTier(templateEx.tier)
              ? PROGRESSING_TIERS[templateEx.tier].weight
              : "t3Weight"]: heavier,
          };
    /** Records the outcome of a lift the rules evaluated (from `liftState`). */
    const evaluatedOutcome = (outcome: ProgressionOutcome) => {
      outcomes.push(heavier == null ? outcome : fromPrescribed(outcome, prescribedPoint));
    };

    let next: LiftState;
    if (!isProgressingTier(templateEx.tier)) {
      // T3 has no stage, fail count or date: the weight goes up, or stays (at the
      // heavier weight when that is what was lifted). A partially completed T3, and one
      // with a set skipped or reduced for pain, a run or equipment, does not go up.
      if (partial) {
        partialOutcome();
        continue;
      }
      const evaluated = evaluateT3(liftState, exerciseSets);
      const increased = evaluated.outcome.kind === "t3Up";
      if (!increased && heavier == null) {
        outcomes.push(evaluated.outcome);
        continue;
      }
      evaluatedOutcome(evaluated.outcome);
      next = { ...(increased ? evaluated.state : liftState), synced: false };
    } else if (partial) {
      const tier = PROGRESSING_TIERS[templateEx.tier];
      // Partial completion: no pass, no fail, only the date moves.
      partialOutcome();
      next = { ...liftState, [tier.lastWorkoutDate]: now, synced: false };
    } else {
      const tier = PROGRESSING_TIERS[templateEx.tier];
      const liftType = progressionLiftType(templateEx.exerciseId);
      const rpes = exerciseSets.flatMap((set) => (set.rpe != null ? [set.rpe] : []));
      const amrapSet = exerciseSets.find((set) => set.isAMRAP);
      const previousRPEs = liftState.recentAvgRPEs || [];
      const previousAMRAPReps = liftState.recentAMRAPReps || [];

      const evaluated = tier.evaluate(
        liftState,
        exerciseSets,
        session.location,
        settings.equipment,
        liftType
      );
      evaluatedOutcome(evaluated.outcome);
      next = {
        ...evaluated.state,
        [tier.lastWorkoutDate]: now,
        // No entry means the caller did not look this exercise up: keep what is stored
        // instead of wiping it. An explicit empty array still clears it.
        recentE1RMs:
          recentE1RMsByExercise[templateEx.exerciseId] ?? liftState.recentE1RMs ?? [],
        recentAvgRPEs:
          tier.tracksEffort && rpes.length > 0
            ? [...previousRPEs, rpes.reduce((a, b) => a + b, 0) / rpes.length].slice(
                -TRACKING_WINDOW
              )
            : previousRPEs,
        recentAMRAPReps:
          tier.tracksEffort && amrapSet
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
    outcomes,
  };
}
