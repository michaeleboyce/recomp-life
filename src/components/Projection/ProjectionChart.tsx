"use client";

import { LazyTrendChart, type TrendOverlay } from "@/components/chart-kit";
import type { Point } from "@/lib/metrics/types";
import type { Projection } from "@/lib/projection";

interface ProjectionChartProps {
  liftLabel: string;
  history: Point[];
  current: Projection;
  /** Drawn only when the scenario differs from the baseline. */
  alternative?: Projection;
  now: number;
}

const round = (v: number) => String(Math.round(v));

function endOf(projection: Projection) {
  return projection.points[projection.points.length - 1];
}

function overlay(id: string, label: string, projection: Projection, style: TrendOverlay["style"]): TrendOverlay {
  return { id, label, points: projection.points, band: projection.points, style };
}

/** History, the current trend with its range, and the alternative (dashed) with its range. */
export function ProjectionChart({ liftLabel, history, current, alternative, now }: ProjectionChartProps) {
  const end = endOf(current);
  const weeks = current.points.length - 1;
  const currentLabel = `Current trend, range ${round(end.low)} to ${round(end.high)}`;
  const overlays = [overlay("current", currentLabel, current, "solid")];
  let altText = "";
  if (alternative) {
    const altEnd = endOf(alternative);
    overlays.push(overlay("alternative", "Your alternative", alternative, "dashed"));
    altText = `; your alternative ${round(altEnd.v)}, range ${round(altEnd.low)} to ${round(altEnd.high)}`;
  }
  const last = history[history.length - 1];
  const ariaLabel =
    `${liftLabel} estimated 1RM history${last ? ` to ${round(last.v)}` : ""}, then projected ${weeks} weeks: ` +
    `current trend ${round(end.v)}, range ${round(end.low)} to ${round(end.high)}${altText}`;

  return (
    <LazyTrendChart
      data={history}
      unit="lbs"
      height={220}
      overlays={overlays}
      nowMarker={now}
      formatValue={round}
      seriesLabel="Estimated 1RM"
      ariaLabel={ariaLabel}
    />
  );
}
