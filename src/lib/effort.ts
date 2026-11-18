/**
 * Effort: reps in reserve.
 *
 * After a set the app asks one question, "How many more reps could you have done?",
 * with three answers. Self-ratings are off by about one rep on average, so three
 * buckets are as fine as the rating supports. Every place that needs a number for an
 * answer (the estimated max, averages, trends) reads it from here.
 *
 * @evidence effort-logging
 */

import type { RepsInReserve } from "@/types";

/** The answers, hardest first: the order they are shown in. */
export const REPS_IN_RESERVE_OPTIONS: readonly RepsInReserve[] = ["0", "1-2", "3+"];

/** The question asked after a set. */
export const REPS_IN_RESERVE_QUESTION = "How many more reps could you have done?";

/**
 * Reps counted for each answer wherever a number is needed. "1-2" is its midpoint.
 * "3+" is its floor, so anything computed from it is a lower bound.
 */
export const RIR_ESTIMATE: Readonly<Record<RepsInReserve, number>> = {
  "0": 0,
  "1-2": 1.5,
  "3+": 3,
};

/** True for one of the three stored answers. */
export function isRepsInReserve(value: unknown): value is RepsInReserve {
  return value === "0" || value === "1-2" || value === "3+";
}

/** Reps credited for an answer; 0 when none was logged (the set is read as all-out). */
export function repsInReserveCredit(answer?: RepsInReserve | null): number {
  return isRepsInReserve(answer) ? RIR_ESTIMATE[answer] : 0;
}

/** "0 left", "1-2 left", "3+ left". */
export function repsInReserveLabel(answer: RepsInReserve): string {
  return `${answer} left`;
}

/**
 * Mean reps left over the answers given, by RIR_ESTIMATE; null when there are none.
 * Higher means easier. Sets with no answer are left out, never guessed.
 */
export function averageRepsInReserve(
  answers: ReadonlyArray<RepsInReserve | null | undefined>
): number | null {
  const credits = answers.filter(isRepsInReserve).map((a) => RIR_ESTIMATE[a]);
  if (credits.length === 0) return null;
  return credits.reduce((sum, c) => sum + c, 0) / credits.length;
}
