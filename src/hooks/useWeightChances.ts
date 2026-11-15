import { useMemo } from "react";
import {
  forecastSourceFrom,
  nextWorkoutFrom,
  readinessTodayFrom,
  type LedgerRecords,
} from "@/lib/data/forecasts";
import { makeSessionForecasts } from "@/lib/forecast";
import { prescribedFor } from "@/lib/workout/planEdits";
import type { Tier, WorkoutLocation } from "@/types";
import { useLedgerRecords } from "./useLedgerRecords";

/** Weight on the bar (lbs) -> chance (0 to 1) of a new best estimated max at it. */
export type WeightChances = Map<number, number>;

/** Whether a failure to work out the chances has been logged already. */
let failureReported = false;

/**
 * The chance of a new best for one lift of the next workout at each of `weights`,
 * from the same model and the same rows `startWorkout` would store (with the program's
 * prescription, so a heavier bar means fewer reps, not a stronger lifter). A weight
 * with no honest chance (no best yet, a home substitute, a lift that is not a T1) is
 * left out of the map. Never throws: an empty map on failure, logged once.
 */
export function weightChancesFrom(
  records: LedgerRecords,
  input: { exerciseId: string; tier: Tier; weights: readonly number[]; location?: WorkoutLocation }
): WeightChances {
  const chances: WeightChances = new Map();
  try {
    const now = records.readAt;
    const next = nextWorkoutFrom(records, input.location);
    const entry = next.plan.find(
      (candidate) =>
        !candidate.isWarmUp &&
        candidate.exerciseId === input.exerciseId &&
        candidate.tier === input.tier
    );
    if (!entry || entry.substituteExerciseId || input.weights.length === 0) return chances;
    const readiness = readinessTodayFrom(records, { now, location: input.location });
    const source = forecastSourceFrom(records, now, readiness);
    const session = { id: "why", prescribed: prescribedFor(next.template, records.liftStates) };
    for (const weight of input.weights) {
      const rows = makeSessionForecasts(session, [{ ...entry, weight }], source);
      const row = rows.find(
        (candidate) =>
          candidate.kind === "newBest" &&
          candidate.exerciseId === entry.exerciseId &&
          candidate.tier === entry.tier
      );
      const probability = row?.prediction.probability;
      if (typeof probability === "number") chances.set(weight, probability);
    }
  } catch (error) {
    if (!failureReported) {
      failureReported = true;
      console.error("Working out the new-best chances failed; showing none", error);
    }
    chances.clear();
  }
  return chances;
}

/**
 * The chance of a new best at each of `weights` for one lift of the next workout, for
 * the "Your call" choices in the why sheet. `undefined` while loading.
 */
export function useWeightChances(input: {
  exerciseId: string;
  tier: Tier;
  weights: readonly number[];
  location?: WorkoutLocation;
}): WeightChances | undefined {
  const records = useLedgerRecords();
  const { exerciseId, tier, location } = input;
  const key = input.weights.join(",");
  return useMemo(() => {
    if (!records) return undefined;
    const weights = key ? key.split(",").map(Number) : [];
    return weightChancesFrom(records, { exerciseId, tier, weights, location });
  }, [records, exerciseId, tier, location, key]);
}
