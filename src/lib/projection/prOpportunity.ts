// PR opportunity: how many reps at a given weight would raise a lift's best
// estimated 1RM, and how reachable that is. Pure functions.
import { calculateE1RM, E1RM_MAX_REPS, isE1RMEligibleSet } from "@/lib/e1rm";
import type { Tier } from "@/types";

export type PrChance = "likely" | "stretch" | "unlikely" | "unknown";

export interface PrOpportunity {
  /** Fewest reps at this weight whose estimate beats the current best. */
  repsNeeded: number;
  /** The estimated 1RM that many reps would give. */
  e1rmAtRepsNeeded: number;
  bestE1RM: number;
  chance: PrChance;
}

/** How many of the most recent AMRAP sets set the expectation for the next one. */
export const PR_CHANCE_RECENT_SETS = 5;

/**
 * Needing up to this many reps more than the recent median is a "stretch";
 * needing more than that is "unlikely". At or below the median is "likely".
 */
export const PR_STRETCH_MAX_REPS_ABOVE = 2;

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * The fewest reps at `weight` (1..E1RM_MAX_REPS) whose `calculateE1RM` estimate is
 * strictly above `bestE1RM`, with that estimate; null when none does or inputs are
 * not positive and finite.
 *
 * The estimate is taken without an RPE, i.e. as an all-out set: a logged RPE below
 * 10 would only raise it. `calculateE1RM` gives no estimate for a single, so the
 * answer is never 1 rep.
 */
export function repsToBeat(
  weight: number,
  bestE1RM: number
): { reps: number; e1rm: number } | null {
  if (!isPositiveFinite(weight) || !isPositiveFinite(bestE1RM)) return null;
  for (let reps = 1; reps <= E1RM_MAX_REPS; reps++) {
    const e1rm = calculateE1RM(weight, reps);
    if (e1rm !== null && e1rm > bestE1RM) return { reps, e1rm };
  }
  return null;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * How reachable `repsNeeded` is given the lift's recent AMRAP rep counts (oldest
 * first, newest last, as stored on `LiftState.recentAMRAPReps`).
 *
 * Compares with the median of the last PR_CHANCE_RECENT_SETS sets: at or below it is
 * "likely", up to PR_STRETCH_MAX_REPS_ABOVE reps above it is a "stretch", more is
 * "unlikely". With no usable history the answer is "unknown".
 */
export function prChance(repsNeeded: number, recentAMRAPReps: number[]): PrChance {
  const recent = recentAMRAPReps
    .filter((reps) => Number.isFinite(reps))
    .slice(-PR_CHANCE_RECENT_SETS);
  if (recent.length === 0 || !Number.isFinite(repsNeeded)) return "unknown";
  const typical = median(recent);
  if (repsNeeded <= typical) return "likely";
  if (repsNeeded <= typical + PR_STRETCH_MAX_REPS_ABOVE) return "stretch";
  return "unlikely";
}

/** Whether a set of this tier and AMRAP flag counts toward e1RM at any rep count. */
function canCountTowardE1RM(tier: Tier, isAMRAP: boolean): boolean {
  for (let reps = 1; reps <= E1RM_MAX_REPS; reps++) {
    if (isE1RMEligibleSet(tier, isAMRAP, reps)) return true;
  }
  return false;
}

/**
 * The PR opportunity for a set, or null when the set cannot count toward e1RM
 * (see `isE1RMEligibleSet`), when there is no best yet, or when no rep count beats it.
 */
export function describePrOpportunity(input: {
  tier: Tier;
  isAMRAP: boolean;
  weight: number;
  bestE1RM: number | null;
  recentAMRAPReps: number[];
}): PrOpportunity | null {
  const { tier, isAMRAP, weight, bestE1RM, recentAMRAPReps } = input;
  if (bestE1RM === null || !canCountTowardE1RM(tier, isAMRAP)) return null;
  const target = repsToBeat(weight, bestE1RM);
  if (!target) return null;
  return {
    repsNeeded: target.reps,
    e1rmAtRepsNeeded: target.e1rm,
    bestE1RM,
    chance: prChance(target.reps, recentAMRAPReps),
  };
}
