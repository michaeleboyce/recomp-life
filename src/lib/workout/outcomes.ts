// What one finished session did to each of its program lifts, in words. The outcomes
// come from the progression code itself (`computeCompletion`, kept per workout by the
// rebuild), so this file only writes the line: it never works out what happened.
// Pure: no React, no database.
import { formatNumber } from "@/lib/metrics/helpers";
import { T3_LAST_SET_INCREASE_REPS } from "@/lib/progression";
import type { ProgressionOutcome, ProgressionOutcomeKind, SetLog, WorkoutSession } from "@/types";
import { workingSetsFor } from "./setSelectors";

export type ProgramTier = ProgressionOutcome["tier"];

export type OutcomeKind = ProgressionOutcomeKind;

/** A progression outcome with the line that describes it. */
export interface LiftOutcome extends ProgressionOutcome {
  /** The full line, e.g. "passed: next 195 lbs 5x3". */
  text: string;
}

const lbs = (weight: number) => `${formatNumber(weight, 1)} lbs`;

/**
 * The line for one outcome, e.g. "missed: moves to 6x2 at 190 lbs". `sets` are the
 * lift's working sets in that session; they are only read for the rep count of a T3
 * lift that stayed at its weight, which is left out when they are not given.
 */
export function describeOutcome(outcome: ProgressionOutcome, sets: SetLog[] = []): string {
  const { tier, kind, reason, from, to } = outcome;
  const next = lbs(to.weight);
  const nextWithStage = to.stage ? `${next} ${to.stage}` : next;
  /** For a lift nothing happened to: a T3 lift names its weight, T1 and T2 have nothing to add. */
  const stillThere = (verb: string) =>
    tier === "T3" ? `${verb}: stays at ${next}` : `${verb}: no change`;

  switch (kind) {
    case "passed":
      return `passed: next ${nextWithStage}`;
    case "stageDown":
      return `missed: moves to ${to.stage} at ${next}`;
    case "reset":
      return `missed: resets to ${nextWithStage}`;
    case "held":
      // A held lift done heavier than prescribed carries on from what was lifted.
      return to.weight !== from.weight ? `held: next ${nextWithStage}` : stillThere("held");
    case "partial":
      return stillThere("partly done");
    case "notDone":
      return stillThere("not done");
    case "loggedOnly":
      return stillThere("only logged");
    case "t3Up":
      return reason === "heavier"
        ? `done heavier: next ${next}`
        : `last set reached ${T3_LAST_SET_INCREASE_REPS}: next ${next}`;
    case "t3Same": {
      const lastSet = sets[sets.length - 1];
      return lastSet
        ? `stays at ${next} (last set ${lastSet.actualReps} of ${T3_LAST_SET_INCREASE_REPS} reps)`
        : `stays at ${next}`;
    }
  }
}

/**
 * One described outcome per T1, T2 and T3 lift of a finished session, in the order
 * given. `outcomes` are the rebuild's outcomes for that workout
 * (`RebuildResult.outcomes.get(session.id)`). Returns nothing when they are missing:
 * the workout is not finished or not in the log.
 */
export function describeOutcomes(
  session: Pick<WorkoutSession, "sets">,
  outcomes: readonly ProgressionOutcome[] | undefined
): LiftOutcome[] {
  return (outcomes ?? []).map((outcome) => ({
    ...outcome,
    text: describeOutcome(
      outcome,
      workingSetsFor(session.sets ?? [], outcome.exerciseId, outcome.tier)
    ),
  }));
}
