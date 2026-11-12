"use client";

import { LazyTrendChart } from "@/components/chart-kit";
import { getMetric } from "@/lib/metrics";
import type { Series } from "@/lib/metrics/types";

const format = getMetric("bodyweight").format;

/**
 * Bodyweight over time: the 7-day average as the main line, the daily weigh-ins
 * behind it as a lighter dotted line.
 */
export function BodyChart({
  average,
  weight,
  height,
}: {
  average: Series;
  weight: Series;
  height?: number;
}) {
  return (
    <LazyTrendChart
      series={average}
      overlays={[{ id: "daily", label: "Daily weigh-ins", points: weight.points, style: "dotted" }]}
      seriesLabel="7-day average"
      height={height}
      formatValue={format}
      ariaLabel="Bodyweight, 7-day average with daily weigh-ins"
      emptyMessage="No weigh-ins in this range"
    />
  );
}
