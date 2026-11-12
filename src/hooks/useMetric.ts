// Hooks that feed the metrics layer from the local database. The maths lives in
// src/lib/metrics; these only gather the records and memoise the result.
import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { computeMetric, inRange, summarize } from "@/lib/metrics";
import type {
  MetricId,
  MetricParams,
  MetricSource,
  RangeKey,
  Series,
  SeriesSummary,
} from "@/lib/metrics/types";
import type { ReadinessLog } from "@/types";
import { useSettings } from "./useProfile";
import { useBodyweightLog, useE1RMs, usePainEntries, useRuns } from "./useRecords";
import { useCompletedWorkouts, useLiftStates } from "./useWorkouts";

/** Readiness (sleep and stress) logs, oldest first; `undefined` while loading. */
export function useReadinessLogs(): ReadinessLog[] | undefined {
  return useLiveQuery(() => db.readinessLogs.orderBy("date").toArray(), []);
}

/**
 * Everything the metrics read, assembled from the record hooks; `undefined` until
 * every underlying query has loaded. The object identity is stable between renders
 * when no underlying data changed.
 */
export function useMetricSource(): MetricSource | undefined {
  const workouts = useCompletedWorkouts();
  const e1rms = useE1RMs();
  const bodyweight = useBodyweightLog();
  const runs = useRuns();
  const readiness = useReadinessLogs();
  const pain = usePainEntries();
  const liftStates = useLiftStates();
  const settings = useSettings();

  return useMemo(() => {
    if (
      workouts === undefined ||
      e1rms === undefined ||
      bodyweight === undefined ||
      runs === undefined ||
      readiness === undefined ||
      pain === undefined ||
      liftStates === undefined ||
      settings === undefined
    ) {
      return undefined;
    }
    return { workouts, e1rms, bodyweight, runs, readiness, pain, liftStates, settings };
  }, [workouts, e1rms, bodyweight, runs, readiness, pain, liftStates, settings]);
}

export interface MetricResult {
  /** The full series, before range filtering. */
  full: Series;
  /** The series limited to `range`. */
  series: Series;
  summary: SeriesSummary;
}

/** One metric, limited to a range (default "all"); `undefined` while loading. */
export function useMetric(
  id: MetricId,
  params?: MetricParams,
  range: RangeKey = "all"
): MetricResult | undefined {
  const source = useMetricSource();
  // Taken once per mount, so the range window does not slide on every render.
  const [now] = useState(() => Date.now());
  // Callers usually pass a fresh params object each render; key on its contents.
  const exerciseId = params?.exerciseId;
  const muscleGroup = params?.muscleGroup;

  const full = useMemo(() => {
    if (!source) return undefined;
    const stableParams: MetricParams = {};
    if (exerciseId !== undefined) stableParams.exerciseId = exerciseId;
    if (muscleGroup !== undefined) stableParams.muscleGroup = muscleGroup;
    return computeMetric(id, source, stableParams);
  }, [id, source, exerciseId, muscleGroup]);

  return useMemo(() => {
    if (!full) return undefined;
    const series = inRange(full, range, now);
    return { full, series, summary: summarize(series) };
  }, [full, range, now]);
}
