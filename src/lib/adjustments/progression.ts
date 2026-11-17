// What the program rules did after each finished workout, as log entries. The outcomes
// come from the rebuild (`RebuildResult.outcomes`) and the per-lift lines from
// `describeOutcomes`, the same ones the workout page shows; this file adds the titles
// and the reasons. An ordinary workout is one entry; a stage change, a reset, a hold
// and a T3 increase each get their own. Pure.
import { OUTCOME_RULE_IDS, RESET_FACTOR, T3_LAST_SET_INCREASE_REPS } from "@/lib/progression";
import { workoutDetailHref } from "@/lib/routes";
import { describeOutcomes, type LiftOutcome } from "@/lib/workout/outcomes";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import type {
  AdjustmentEntry,
  ProgressionOutcomeKind,
  ProgressionOutcomeReason,
  SetLog,
  Tier,
  WorkoutSession,
} from "@/types";
import { joinList } from "@/lib/text";
import {
  capitalise,
  compareIds,
  countOf,
  countWord,
  dayName,
  isLive,
  lbs,
  liftLabel,
  liftShort,
  realRuleId,
  scheme,
  tierTag,
  toDate,
  toMs,
  withSchemeSigns,
} from "./text";
import { SOURCE_RANK, type AdjustmentFeedInput, type RankedEntry } from "./types";

/** Outcomes of a lift that was done in full, for "all three lifts passed". */
const DONE_IN_FULL: ReadonlySet<ProgressionOutcomeKind> = new Set(["passed", "t3Same", "t3Up"]);

/** What put a lift on hold, in the order `getHoldReason` checks them, plus a heavier miss. */
const HOLD_REASON_TEXT: Partial<Record<ProgressionOutcomeReason, string>> = {
  pain: "A set was skipped or lightened for pain.",
  run: "A set was lightened after a run.",
  equipment: "A set was lightened because of the equipment you had.",
  loadDrop: "You took the lighter weight the app offered after a hard first set.",
  heavier: "You lifted heavier than planned and missed reps.",
};

type EntryText = Pick<AdjustmentEntry, "title" | "detail" | "change">;

/** "the weight and scheme stay"; a T3 lift has no scheme to keep. */
function whatStays(tier: Tier): string {
  return tier === "T3" ? "the weight stays" : "the weight and scheme stay";
}

/** "You missed reps on two sets at 5×3." */
function missedSentence(outcome: LiftOutcome, sets: SetLog[]): string {
  const missed = sets.filter((set) => set.status === "failed" || set.actualReps < set.targetReps);
  const where = outcome.from.stage ? ` at ${scheme(outcome.from.stage)}` : "";
  return missed.length > 0
    ? `You missed reps on ${countOf(missed.length, "set")}${where}.`
    : `You missed reps${where}.`;
}

/** Why a lift was only logged: the session's own edit of its sets and reps, else it was done lighter. */
function loggedOnlyReason(session: WorkoutSession, outcome: LiftOutcome): string {
  const schemeEdited = (session.planEdits ?? []).some(
    (edit) =>
      edit.kind === "scheme" && edit.exerciseId === outcome.exerciseId && edit.tier === outcome.tier
  );
  return schemeEdited
    ? "You changed its sets and reps for this workout"
    : "You lifted lighter than planned";
}

/**
 * The title and reason for a lift whose outcome is an entry of its own, or null for
 * an outcome that belongs on the workout's one line (a pass, a T3 lift that stays, a
 * lift that was not done).
 */
function ownEntry(session: WorkoutSession, outcome: LiftOutcome): EntryText | null {
  const { tier, kind, reason, from, to } = outcome;
  const name = liftLabel(outcome.exerciseId);
  const tagged = `${name}${tierTag(tier)}`;
  const sets = workingSetsFor(session.sets ?? [], outcome.exerciseId, tier);
  const weights = { from: lbs(from.weight), to: lbs(to.weight) };
  const neither = "It counts as neither a pass nor a miss";

  switch (kind) {
    case "passed":
    case "t3Same":
    case "notDone":
      return null;
    case "stageDown": {
      const change = { from: scheme(from.stage), to: scheme(to.stage) };
      return {
        title: `${name} ${change.from} → ${change.to} at ${lbs(to.weight)}`,
        detail: `${missedSentence(outcome, sets)} The weight stays and the scheme changes.`,
        change,
      };
    }
    case "reset": {
      const change = {
        from: `${lbs(from.weight)} at ${scheme(from.stage)}`,
        to: `${lbs(to.weight)} at ${scheme(to.stage)}`,
      };
      return {
        title: `${name} reset ${change.from} → ${change.to}`,
        detail:
          `${missedSentence(outcome, sets)} That was the last scheme, so the lift starts again ` +
          `at ${scheme(to.stage)} with ${Math.round(RESET_FACTOR * 100)}% of the weight.`,
        change,
      };
    }
    case "held": {
      const why = (reason && HOLD_REASON_TEXT[reason]) ?? "Progression was put on hold for this lift.";
      // A held lift done heavier than planned carries on from what was lifted.
      if (to.weight !== from.weight) {
        return {
          title: `${tagged} ${weights.from} → ${weights.to}`,
          detail: `${why} ${neither}, and the next weight carries on from what you lifted.`,
          change: weights,
        };
      }
      return {
        title: `${tagged} held at ${weights.from}`,
        detail:
          reason === "heavier"
            ? `${why} A miss at a weight the plan did not ask for is not counted, so ${whatStays(tier)}.`
            : `${why} ${neither}, so ${whatStays(tier)}.`,
      };
    }
    case "partial":
      return {
        title: `${tagged} held at ${weights.from}`,
        detail:
          `You stopped after ${countOf(sets.length, "set")}, before the lift was finished. ` +
          `${neither}, so ${whatStays(tier)}.`,
      };
    case "loggedOnly":
      return {
        title: `${tagged} only logged, stays at ${weights.from}`,
        detail:
          `${loggedOnlyReason(session, outcome)}, so it was logged without moving the program. ` +
          `${capitalise(whatStays(tier))}.`,
      };
    case "t3Up": {
      const lastSet = sets[sets.length - 1];
      return {
        title: `${tagged} ${weights.from} → ${weights.to}`,
        detail:
          reason === "heavier"
            ? "You lifted heavier than planned in every set, so the next weight carries on from what you lifted."
            : lastSet
              ? `Your last set was ${lastSet.actualReps} reps. At ${T3_LAST_SET_INCREASE_REPS} or more the weight goes up.`
              : `Your last set reached ${T3_LAST_SET_INCREASE_REPS} reps, so the weight goes up.`,
        change: weights,
      };
    }
  }
}

/** "Squat passed: next 200 lbs 5×3": the lift's name and the workout page's own line for it. */
function liftLine(outcome: LiftOutcome): string {
  return `${liftLabel(outcome.exerciseId)} ${withSchemeSigns(outcome.text)}`;
}

/** "all three lifts passed", or the lifts that passed when not every lift was done in full. */
function dayHeadline(outcomes: LiftOutcome[], passed: LiftOutcome[]): string {
  const all = outcomes.length >= 2 && outcomes.every((outcome) => DONE_IN_FULL.has(outcome.kind));
  if (!all) return `${joinList(passed.map((outcome) => liftShort(outcome.exerciseId)))} passed`;
  if (outcomes.length === 2) return "both lifts passed";
  return `all ${countWord(outcomes.length)} lifts passed`;
}

/**
 * The entries for every finished, live workout the rebuild has outcomes for.
 *
 * One entry for the workout when at least one lift passed: its title counts the passes
 * and its detail is the line `describeOutcomes` gives each lift that passed, stayed or
 * was not done. Each stage change, reset, hold (a set skipped or lightened, an accepted
 * load drop, a lift stopped part-way or only logged) and T3 increase is an entry of
 * its own, in the workout's lift order. A workout in which nothing passed and nothing
 * else happened gives no entry. Every entry is dated when the workout finished, links
 * to the workout and cites the rule its outcome names.
 */
export function progressionEntries(
  input: Pick<AdjustmentFeedInput, "workouts" | "rebuild">
): RankedEntry[] {
  const out: RankedEntry[] = [];
  const workouts = input.workouts
    .filter((workout) => isLive(workout) && workout.completedAt != null)
    .sort((a, b) => toMs(a.completedAt) - toMs(b.completedAt) || compareIds(a.id, b.id));

  for (const workout of workouts) {
    const at = toDate(workout.completedAt);
    const outcomes = describeOutcomes(workout, input.rebuild.outcomes.get(workout.id));
    if (!at || outcomes.length === 0) continue;
    const href = workoutDetailHref(workout.id);
    const own = outcomes.map((outcome) => ownEntry(workout, outcome));

    const onTheLine = outcomes.filter((_, index) => own[index] === null);
    const passed = onTheLine.filter((outcome) => outcome.kind === "passed");
    if (passed.length > 0) {
      out.push({
        rank: SOURCE_RANK.progression,
        entry: {
          id: `progression:${workout.id}`,
          at,
          source: "progression",
          title: `${dayName(workout.templateId)}: ${dayHeadline(outcomes, passed)}`,
          detail: onTheLine.map((outcome) => `${liftLine(outcome)}.`).join(" "),
          ruleId: OUTCOME_RULE_IDS.program,
          href,
        },
      });
    }

    outcomes.forEach((outcome, index) => {
      const text = own[index];
      if (!text) return;
      out.push({
        rank: SOURCE_RANK.progression + 1 + index,
        entry: {
          id: `progression:${workout.id}:${outcome.exerciseId}:${outcome.tier}`,
          at,
          source: "progression",
          ...text,
          // The rule the progression code itself names for this outcome.
          ruleId:
            realRuleId(outcome.ruleId) ??
            (outcome.tier === "T3" ? OUTCOME_RULE_IDS.t3 : OUTCOME_RULE_IDS.program),
          href,
        },
      });
    });
  }
  return out;
}
