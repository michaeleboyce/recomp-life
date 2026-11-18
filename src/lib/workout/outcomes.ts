// What one finished session did to each of its program lifts, in words. The outcomes
// come from the progression code itself (`computeCompletion`, kept per workout by the
// rebuild), so this file only writes the line: it never works out what happened.
// Pure: no React, no database.
import { formatNumber } from "@/lib/metrics/helpers";
import type { ProgressionOutcome, ProgressionOutcomeKind, SetLog, WorkoutSession } from "@/types";
import { workingSetsFor } from "./setSelectors";
import { t3IncreaseOfOutcome, t3LastSetAgainst, type T3Increase } from "./t3Increase";

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
    case "t3Same":
      return describeT3(t3IncreaseOfOutcome(outcome), kind, reason, next, sets);
  }
}

/**
 * A T3's line against the threshold its session was judged by: "26 reps on the last
 * set, needed 18: next 95 lbs", "19 reps on the last set, needed 20: stays at 50 lbs"
 * (`t3LastSetAgainst`). Shared with the home exercises' lines (`describeVariantOutcome`).
 */
export function describeT3(
  inc: T3Increase | null,
  kind: "t3Up" | "t3Same",
  reason: ProgressionOutcome["reason"],
  next: string,
  sets: readonly Pick<SetLog, "actualReps">[]
): string {
  const lastSet = sets[sets.length - 1];
  if (kind === "t3Up") {
    if (reason === "heavier") return `done heavier: next ${next}`;
    if (!inc) return `went up: next ${next}`;
    return lastSet
      ? `${t3LastSetAgainst(lastSet.actualReps, inc.threshold)}: next ${next}`
      : `last set reached ${inc.threshold}: next ${next}`;
  }
  return lastSet && inc ? `${t3LastSetAgainst(lastSet.actualReps, inc.threshold)}: stays at ${next}` : `stays at ${next}`;
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
