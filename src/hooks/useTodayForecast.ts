import { useMemo } from "react";
import {
  forecastSourceFrom,
  nextWorkoutFrom,
  readinessTodayFrom,
  type LedgerRecords,
} from "@/lib/data/forecasts";
import { makeSessionForecasts } from "@/lib/forecast";
import type { ResolvedNextWorkout } from "@/lib/workout/nextWorkout";
import { prChanceFromProbability, repsToBeat, type PrChance } from "@/lib/projection";
import type { WorkoutPlan } from "@/lib/workout/types";
import type { Forecast, ReadinessScore } from "@/types/glass";
import type { WorkoutLocation, WorkoutSession } from "@/types";
import { useSessionForecasts } from "./useForecastLedger";
import { useLedgerRecords } from "./useLedgerRecords";
import { useReadinessToday } from "./useReadinessToday";

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

/** Whether a failure to work out Today's forecast has been logged already. */
let failureReported = false;

/**
 * The forecast tiles for the next workout at `location`, from one snapshot of the
 * records. The numbers are the rows `startWorkout` would store if the workout started
 * now with this plan (`makeSessionForecasts`), so Today never shows a forecast the
 * ledger would not keep. The sleep and energy answers are not known yet; once they
 * are given the stored forecast can differ a little.
 *
 * Never throws: Today renders this on the home screen, above the Start button, and a
 * forecast is never worth losing that screen for. When scoring, readiness or a model
 * fails, every part is null (no tile is shown) and the failure is logged once.
 */
export function todayForecastFrom(
  records: LedgerRecords,
  location?: WorkoutLocation,
  next?: Pick<ResolvedNextWorkout, "plan">
): TodayForecast {
  try {
    return buildTodayForecast(records, location, next ?? nextWorkoutFrom(records, location));
  } catch (error) {
    if (!failureReported) {
      failureReported = true;
      console.error("Working out Today's forecast failed; showing none", error);
    }
    return { session: null, newBest: null, readiness: null };
  }
}

/** The forecast itself, for the next workout as resolved. Pure; may throw on records no model expects. */
function buildTodayForecast(
  records: LedgerRecords,
  location: WorkoutLocation | undefined,
  next: Pick<ResolvedNextWorkout, "plan">
): TodayForecast {
  const now = records.readAt;
  const { plan } = next;
  const readiness = readinessTodayFrom(records, { now, location, next });
  const rows = makeSessionForecasts(
    { id: "today" },
    plan,
    forecastSourceFrom(records, now, readiness)
  );
  return tilesFromForecasts(rows, plan, readiness);
}

/**
 * Today's three tiles from a workout's session forecasts (made now for the next
 * workout, or stored when an open one started) and its plan. Pure.
 */
export function tilesFromForecasts(
  rows: readonly Forecast[],
  plan: WorkoutPlan,
  readiness: ReadinessScore | null
): TodayForecast {
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
    const target = repsToBeat(t1.weight, best, credit);
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

/** Today's next workout and its forecast tiles, from one resolution. */
export interface TodayWorkout {
  /** The next workout at the location (`nextWorkoutFrom` → `resolveNextWorkout`). */
  next: ResolvedNextWorkout;
  /** The forecast tiles and readiness, made for exactly that plan. */
  forecast: TodayForecast;
}

/**
 * The next workout at `location` (the saved default when omitted), resolved ONCE from
 * one snapshot of the records, with the forecast tiles and readiness worked out from
 * that same plan: Today's lift rows, tiles and readiness cannot plan it differently.
 * `undefined` while loading.
 */
export function useTodayWorkout(location?: WorkoutLocation): TodayWorkout | undefined {
  const records = useLedgerRecords();
  return useMemo(() => {
    if (!records) return undefined;
    const next = nextWorkoutFrom(records, location);
    return { next, forecast: todayForecastFrom(records, location, next) };
  }, [records, location]);
}

/**
 * The tiles for a workout that is open, from the forecasts stored when it started
 * (`useSessionForecasts`), so Today shows the numbers the workout screen shows, not
 * a forecast for the next workout made now. `undefined` while loading or with no
 * session. Never throws, like `todayForecastFrom`.
 */
export function useOpenWorkoutForecast(
  session: WorkoutSession | null | undefined,
  plan: WorkoutPlan | undefined
): TodayForecast | undefined {
  const scored = useSessionForecasts(session?.id);
  const readiness = useReadinessToday({ location: session?.location });
  return useMemo(() => {
    if (!session || !plan || scored === undefined || readiness === undefined) return undefined;
    try {
      return tilesFromForecasts(
        scored.map((row) => row.forecast),
        plan,
        readiness
      );
    } catch (error) {
      console.error("Reading the open workout's forecast failed; showing none", error);
      return { session: null, newBest: null, readiness: null };
    }
  }, [session, plan, scored, readiness]);
}
