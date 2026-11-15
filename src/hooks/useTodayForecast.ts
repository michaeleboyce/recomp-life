import { useMemo } from "react";
import {
  forecastSourceFrom,
  nextWorkoutFrom,
  readinessTodayFrom,
  type LedgerRecords,
} from "@/lib/data/forecasts";
import { makeSessionForecasts } from "@/lib/forecast";
import { prChanceFromProbability, repsToBeat, type PrChance } from "@/lib/projection";
import type { ReadinessScore } from "@/types/glass";
import type { WorkoutLocation } from "@/types";
import { useLedgerRecords } from "./useLedgerRecords";

export interface TodayForecast {
  /** How long the next workout takes. `low`/`high` only when a model gives a range. */
  session: { minutes: number; low?: number; high?: number } | null;
  /** The chance the T1 lift's last set sets a new best estimated max. */
  newBest: {
    /** 0 to 1, or null while only the category is known. */
    probability: number | null;
    chance: PrChance;
    /** The reps on the last set a new best needs, at the lifter's usual logged effort. */
    repsNeeded: number;
    /**
     * True when `repsNeeded` counts on an effort credit: the estimated max adds the
     * reps a logged effort says were left, so the count is "about", not a floor.
     */
    approximate: boolean;
    /** The estimated max that many reps would give. */
    estimate: number;
    /** The current best estimated max. */
    best: number;
  } | null;
  readiness: ReadinessScore | null;
}

const toMinutes = (seconds: number) => Math.round(seconds / 60);

/**
 * The forecast tiles for the next workout at `location`, from one snapshot of the
 * records. The numbers are the rows `startWorkout` would store if the workout started
 * now with this plan (`makeSessionForecasts`), so Today never shows a forecast the
 * ledger would not keep. The sleep and energy answers are not known yet; once they
 * are given the stored forecast can differ a little. Pure.
 */
export function todayForecastFrom(
  records: LedgerRecords,
  location?: WorkoutLocation
): TodayForecast {
  const now = records.readAt;
  const { plan } = nextWorkoutFrom(records, location);
  const readiness = readinessTodayFrom(records, { now, location });
  const rows = makeSessionForecasts(
    { id: "today" },
    plan,
    forecastSourceFrom(records, now, readiness)
  );

  const length = rows.find((row) => row.kind === "sessionLength")?.prediction;
  const session: TodayForecast["session"] =
    length && plan.some((entry) => !entry.isWarmUp)
      ? {
          minutes: Math.max(1, toMinutes(length.point)),
          ...(length.low !== undefined && length.high !== undefined
            ? { low: toMinutes(length.low), high: toMinutes(length.high) }
            : {}),
        }
      : null;

  // The first T1 lift, as the hero shows it. No row for it means no honest chance: a
  // home substitute (a different lift), no best yet, or no rep count that beats it.
  const t1 = plan.find((entry) => entry.tier === "T1" && !entry.isWarmUp);
  const row = t1
    ? rows.find(
        (candidate) =>
          candidate.kind === "newBest" &&
          candidate.exerciseId === t1.exerciseId &&
          candidate.tier === t1.tier
      )
    : undefined;
  let newBest: TodayForecast["newBest"] = null;
  const best = row?.event.level;
  const probability = row?.prediction.probability;
  if (t1 && row && typeof best === "number" && typeof probability === "number") {
    // The same count the stored chance is for: the reps needed at the usual effort.
    const credit = typeof row.inputs.effortCredit === "number" ? row.inputs.effortCredit : 0;
    const target = repsToBeat(t1.weight, best, 10 - credit);
    if (target) {
      newBest = {
        probability,
        chance: prChanceFromProbability(probability),
        repsNeeded: target.reps,
        approximate: credit > 0,
        estimate: target.e1rm,
        best,
      };
    }
  }

  return { session, newBest, readiness };
}

/**
 * The forecast tiles on Today, for the next workout at `location` (the saved default
 * when omitted). `undefined` while loading; each part is null when there is nothing
 * honest to show, and the tile for it is not rendered.
 *
 * Session length comes with its range, the new best as a chance with the reps it
 * needs, and readiness with what moved it; all three from the same models that write
 * the forecast ledger when the workout starts.
 */
export function useTodayForecast(location?: WorkoutLocation): TodayForecast | undefined {
  const records = useLedgerRecords();
  return useMemo(
    () => (records ? todayForecastFrom(records, location) : undefined),
    [records, location]
  );
}
