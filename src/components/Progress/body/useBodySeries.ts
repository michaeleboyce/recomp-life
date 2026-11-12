"use client";

import { useMemo, useState } from "react";
import { useMetricSource } from "@/hooks";
import { computeMetric, inRange, summarize } from "@/lib/metrics";
import type { RangeKey, Series, SeriesSummary } from "@/lib/metrics/types";
import type { BodyweightLog } from "@/types";

export interface BodySeries {
  /** Daily weigh-ins in the range. */
  weight: Series;
  weightSummary: SeriesSummary;
  /** 7-day average at each weigh-in, in the range. */
  average: Series;
  /** The latest 7-day average over the whole log, whatever the range. */
  latestAverage: number | null;
  /** Weekly rate of change in the range (negative = losing). */
  rate: Series;
  /** The most recent weekly rate over the whole log. */
  latestRate: number | null;
  cutting: boolean;
  /** Every weigh-in, oldest first. */
  log: BodyweightLog[];
}

/** The bodyweight metrics for a range, computed once from one metric source; undefined while loading. */
export function useBodySeries(range: RangeKey): BodySeries | undefined {
  const source = useMetricSource();
  const [now] = useState(() => Date.now());

  const full = useMemo(() => {
    if (!source) return undefined;
    return {
      weight: computeMetric("bodyweight", source),
      average: computeMetric("bodyweight7d", source),
      rate: computeMetric("lossRate", source),
    };
  }, [source]);

  return useMemo(() => {
    if (!source || !full) return undefined;
    const weight = inRange(full.weight, range, now);
    return {
      weight,
      weightSummary: summarize(weight),
      average: inRange(full.average, range, now),
      latestAverage: full.average.points.at(-1)?.v ?? null,
      rate: inRange(full.rate, range, now),
      latestRate: full.rate.points.at(-1)?.v ?? null,
      cutting: source.settings?.trainingPhase?.mode === "cutting",
      log: source.bodyweight,
    };
  }, [source, full, range, now]);
}
