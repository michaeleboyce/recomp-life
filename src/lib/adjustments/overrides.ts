// Weight overrides as log entries: the user lifted, or set before starting, a weight
// other than the one the program planned. That is the user's right, so the wording
// states what was done and what follows from it, and no rule is cited. Pure.
import { resolveForecast } from "@/lib/forecast";
import { workoutDetailHref } from "@/lib/routes";
import { CREDIT_DECIDING_STATUSES, CREDIT_TIERS } from "@/lib/workout/credit";
import { applyPlanEdits } from "@/lib/workout/planEdits";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import type {
  AdjustmentEntry,
  Forecast,
  PrescribedEntry,
  ProgressionOutcome,
  SetLog,
  Tier,
  WorkoutSession,
} from "@/types";
import {
  compareIds,
  countWord,
  isLive,
  lbs,
  liftLabel,
  sameWeight,
  tierTag,
  toDate,
  toMs,
} from "./text";
import { SOURCE_RANK, type AdjustmentFeedInput, type RankedEntry } from "./types";

type Log = Pick<AdjustmentFeedInput, "workouts" | "rebuild" | "forecasts">;

interface PlannedLift {
  exerciseId: string;
  tier: Tier;
  /** The weight the program planned, in lbs. */
  weight: number;
  prescribed?: PrescribedEntry;
  outcome?: ProgressionOutcome;
}

/**
 * The program lifts of a workout with their planned weights: the stored prescription,
 * or for a workout stored without one the weight its outcome started from.
 */
function plannedLifts(workout: WorkoutSession, outcomes: ProgressionOutcome[]): PlannedLift[] {
  const lifts = new Map<string, PlannedLift>();
  const key = (exerciseId: string, tier: Tier) => `${exerciseId}|${tier}`;
  for (const prescribed of workout.prescribed ?? []) {
    if (!CREDIT_TIERS.includes(prescribed.tier)) continue;
    lifts.set(key(prescribed.exerciseId, prescribed.tier), {
      exerciseId: prescribed.exerciseId,
      tier: prescribed.tier,
      weight: prescribed.weight,
      prescribed,
    });
  }
  for (const outcome of outcomes) {
    const held = lifts.get(key(outcome.exerciseId, outcome.tier));
    if (held) held.outcome = outcome;
    else {
      lifts.set(key(outcome.exerciseId, outcome.tier), {
        exerciseId: outcome.exerciseId,
        tier: outcome.tier,
        weight: outcome.from.weight,
        outcome,
      });
    }
  }
  return [...lifts.values()];
}

/**
 * The sets that say what weight a lift was done at, as `classifyEntry` reads them: only
 * sets marked completed or failed (a set lightened for pain, a run or equipment, or by
 * an accepted load drop, is the app's suggestion, not an override), each at
 * `originalWeight ?? weight`, so a home substitute counts as the program lift.
 */
function decidingSets(workout: WorkoutSession, lift: PlannedLift): SetLog[] {
  return workingSetsFor(workout.sets ?? [], lift.exerciseId, lift.tier).filter((set) =>
    CREDIT_DECIDING_STATUSES.includes(set.status)
  );
}

const creditedWeight = (set: SetLog) => set.originalWeight ?? set.weight;

/** "you lifted 210 instead of the planned 205", for sets that were not all at the planned weight. */
function whatWasLifted(lift: PlannedLift, sets: SetLog[]): string {
  const planned = lbs(lift.weight);
  const weights = sets.map(creditedWeight);
  const other = weights.filter((weight) => !sameWeight(weight, lift.weight));
  const distinct = [...new Set(other.map(lbs))];

  if (sets.some((set) => set.isSubstituted)) {
    // A substitute's own weight is on another scale, so only the direction is said.
    const direction = other.every((weight) => weight > lift.weight)
      ? "heavier"
      : other.every((weight) => weight < lift.weight)
        ? "lighter"
        : null;
    return direction
      ? `you went ${direction} than the planned ${planned} on the home substitute`
      : `you changed the weight from the planned ${planned} on the home substitute`;
  }
  const insteadOf = `instead of the planned ${planned}`;
  if (other.length < weights.length) {
    const share = `${countWord(other.length)} of ${countWord(weights.length)} sets`;
    return `you lifted ${share} at ${distinct.length === 1 ? distinct[0] : "other weights"} ${insteadOf}`;
  }
  if (distinct.length === 1) return `you lifted ${distinct[0]} ${insteadOf}`;
  return `you lifted ${lbs(Math.min(...other))} to ${lbs(Math.max(...other))} ${insteadOf}`;
}

/** What the program did with the lift, in one sentence. */
function whatFollows(lift: PlannedLift): string {
  const { outcome } = lift;
  if (!outcome) return "It is logged as lifted.";
  if ((outcome.kind === "passed" || outcome.kind === "t3Up") && outcome.reason === "heavier") {
    return `The next weight builds from what you lifted: ${lbs(outcome.to.weight)}.`;
  }
  const stays = `the plan stays at ${lbs(outcome.to.weight)}`;
  if (outcome.kind === "held" && outcome.reason === "heavier") {
    return `You missed reps at that weight, which is not counted as a miss; ${stays}.`;
  }
  if (outcome.kind === "loggedOnly") return `It is logged as lifted and ${stays}.`;
  return `Progression was worked out as usual from the planned ${lbs(lift.weight)}.`;
}

/**
 * " The forecast made for 205 is set aside, not scored as a miss." when a stored
 * forecast for this lift in this workout is void because the weight changed (the
 * resolver's own verdict), else nothing.
 */
function forecastSetAside(log: Log, workout: WorkoutSession, lift: PlannedLift): string {
  const at = toDate(workout.completedAt);
  if (!at) return "";
  const voided = log.forecasts.find((forecast: Forecast) => {
    if (forecast.workoutId !== workout.id || forecast.exerciseId !== lift.exerciseId) return false;
    if ((forecast.tier ?? "T1") !== lift.tier || !isLive(forecast)) return false;
    const status = resolveForecast(forecast, { workouts: log.workouts, bodyweight: [] }, at);
    return status.state === "void" && status.reason === "weight-changed";
  });
  const weight = voided?.event.weight;
  return typeof weight === "number"
    ? ` The forecast made for ${lbs(weight)} is set aside, not scored as a miss.`
    : "";
}

/**
 * The weight the user set for the lift before starting (a plan edit of kind weight),
 * when the lift was then not done. Read by applying the session's edits to the lift's
 * prescribed slot, so an edit that was later replaced, or a lift that was swapped out
 * or removed, gives nothing. Gym sessions only: at home the edit is in the
 * substitute's weights, which cannot be compared with the plan's.
 */
function weightSetBeforeStarting(workout: WorkoutSession, lift: PlannedLift): number | null {
  const { prescribed } = lift;
  const edits = workout.planEdits ?? [];
  if (!prescribed || workout.location !== "gym") return null;
  if (!edits.some((edit) => edit.kind === "weight")) return null;
  const slot = applyPlanEdits(
    [
      {
        exerciseId: prescribed.exerciseId,
        tier: prescribed.tier,
        targetSets: prescribed.sets,
        targetReps: prescribed.reps,
        weight: prescribed.weight,
        isAMRAP: false,
        isWarmUp: false,
        completedSets: 0,
      },
    ],
    edits
  ).find((entry) => entry.exerciseId === lift.exerciseId && entry.tier === lift.tier);
  return slot && !sameWeight(slot.weight, lift.weight) ? slot.weight : null;
}

/** The title and detail for one lift of a workout, or null when its weight was not overridden. */
function overrideText(
  log: Log,
  workout: WorkoutSession,
  lift: PlannedLift
): Pick<AdjustmentEntry, "title" | "detail"> | null {
  const name = `${liftLabel(lift.exerciseId)}${tierTag(lift.tier)}`;
  const sets = decidingSets(workout, lift);

  if (sets.some((set) => !sameWeight(creditedWeight(set), lift.weight))) {
    return {
      title: `${name}: ${whatWasLifted(lift, sets)}`,
      detail: `${whatFollows(lift)}${forecastSetAside(log, workout, lift)}`,
    };
  }
  // No set of the lift at all: the only override there can be is one made before starting.
  if (workingSetsFor(workout.sets ?? [], lift.exerciseId, lift.tier).length > 0) return null;
  const chosen = weightSetBeforeStarting(workout, lift);
  if (chosen === null) return null;
  return {
    title: `${name}: you set ${lbs(chosen)} for this workout instead of the planned ${lbs(lift.weight)}`,
    detail: "The lift was not done, so nothing changes.",
  };
}

/**
 * One entry per program lift of a finished, live workout that was done at a weight
 * other than the planned one, dated when the workout finished and linking to it.
 * The title says what was lifted against what was planned; the detail says what the
 * program did with it and whether a forecast was set aside. A weight set before
 * starting for a lift that was then not done gets an entry saying so. No rule is
 * cited and nothing is offered to undo: it was the user's call.
 */
export function overrideEntries(log: Log): RankedEntry[] {
  const out: RankedEntry[] = [];
  const workouts = log.workouts
    .filter((workout) => isLive(workout) && workout.completedAt != null)
    .sort((a, b) => toMs(a.completedAt) - toMs(b.completedAt) || compareIds(a.id, b.id));

  for (const workout of workouts) {
    const at = toDate(workout.completedAt);
    if (!at) continue;
    const lifts = plannedLifts(workout, log.rebuild.outcomes.get(workout.id) ?? []);

    lifts.forEach((lift, index) => {
      const text = overrideText(log, workout, lift);
      if (!text) return;
      out.push({
        rank: SOURCE_RANK.override + index,
        entry: {
          id: `override:${workout.id}:${lift.exerciseId}:${lift.tier}`,
          at,
          source: "override",
          ...text,
          href: workoutDetailHref(workout.id),
        },
      });
    });
  }
  return out;
}
