// Read hooks over the forecast ledger. A stored forecast holds only the prediction;
// its status (open, void, resolved) and the track record are worked out here on every
// read, from the log as it stands. The maths lives in src/lib/forecast.
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { forecastSourceFrom, readinessTodayFrom } from "@/lib/data/forecasts";
import {
  scoreForecasts,
  trackRecord,
  type ForecastSource,
  type ScoredForecast,
  type TrackRecordSplit,
} from "@/lib/forecast";
import { useLedgerRecords } from "./useLedgerRecords";

/**
 * What the forecast models may see right now: finished workouts, weigh-ins, lift
 * states, best estimated maxes, settings, today's readiness shift and the widening
 * factor each kind's record calls for. Pass it to the model functions in
 * src/lib/forecast (`forecastReps`, `forecastE1RM`, `makeHorizonForecasts`...) to
 * preview a forecast exactly as the ledger would store it. `undefined` while loading.
 */
export function useForecastSource(): ForecastSource | undefined {
  const records = useLedgerRecords();
  return useMemo(() => {
    if (!records) return undefined;
    const now = records.readAt;
    return forecastSourceFrom(records, now, readinessTodayFrom(records, { now }));
  }, [records]);
}

/**
 * Every stored forecast with its derived status, oldest first. One row per slot: where
 * two devices forecast the same thing for the same week, the earliest counts.
 * `undefined` while loading, `[]` when nothing is stored.
 */
export function useScoredForecasts(): ScoredForecast[] | undefined {
  return useLiveQuery(async () => {
    const [forecasts, workouts, bodyweight] = await Promise.all([
      db.forecasts.toArray(),
      db.workouts.toArray(),
      db.bodyweight.toArray(),
    ]);
    return scoreForecasts(forecasts, { workouts, bodyweight }, new Date());
  }, []);
}

/**
 * The forecasts made when one workout started, with their status: open while it is
 * in progress, resolved once it is finished, void when it was discarded or deleted or
 * the lift was done at another weight. `undefined` while loading, `[]` when the
 * workout has none (or no id is given).
 */
export function useSessionForecasts(
  workoutId: string | null | undefined
): ScoredForecast[] | undefined {
  return useLiveQuery(async () => {
    if (!workoutId) return [];
    const [forecasts, workout] = await Promise.all([
      db.forecasts.where("workoutId").equals(workoutId).toArray(),
      db.workouts.get(workoutId),
    ]);
    // A session forecast is checked against its own workout only.
    return scoreForecasts(
      forecasts,
      { workouts: workout ? [workout] : [], bodyweight: [] },
      new Date()
    );
  }, [workoutId]);
}

/**
 * How the stored forecasts compared with what happened: overall and split by kind,
 * by lift and by how much history each forecast stood on. `undefined` while loading;
 * with nothing resolved yet every count is zero and every share is null.
 */
export function useTrackRecord(): TrackRecordSplit | undefined {
  const scored = useScoredForecasts();
  return useMemo(() => (scored ? trackRecord(scored) : undefined), [scored]);
}
