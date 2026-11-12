// Run metrics: one point per logged run. Pure.
import type { RunLog } from "@/types";
import { defineMetric, formatNumber, toMs } from "./helpers";
import type { MetricSource, Point } from "./types";

function perRun(
  source: MetricSource,
  pick: (run: RunLog) => Omit<Point, "t" | "refId"> | null
): Point[] {
  const points: Point[] = [];
  for (const run of source.runs) {
    const picked = pick(run);
    if (picked) points.push({ t: toMs(run.date), refId: run.id, ...picked });
  }
  return points;
}

/** Minutes as "m:ss", e.g. 9.5 -> "9:30". */
export function formatPace(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/** Miles per run; runs logged without a distance are skipped. */
export const runDistance = defineMetric(
  {
    id: "runDistance",
    label: "Run distance",
    unit: "miles",
    better: "up",
    scope: "global",
    format: (v) => formatNumber(v, 2),
  },
  (source) =>
    perRun(source, (run) =>
      run.distanceMiles == null ? null : { v: run.distanceMiles, label: run.category }
    )
);

/** Minutes per run. */
export const runDuration = defineMetric(
  {
    id: "runDuration",
    label: "Run duration",
    unit: "min",
    better: "up",
    scope: "global",
    format: (v) => formatNumber(v),
  },
  (source) => perRun(source, (run) => ({ v: run.durationMinutes, label: run.category }))
);

/** Minutes per mile, for runs with a distance above zero. */
export const runPace = defineMetric(
  {
    id: "runPace",
    label: "Run pace",
    unit: "min/mi",
    better: "down",
    scope: "global",
    format: formatPace,
  },
  (source) =>
    perRun(source, (run) =>
      run.distanceMiles != null && run.distanceMiles > 0
        ? {
            v: run.durationMinutes / run.distanceMiles,
            label: `${formatNumber(run.distanceMiles, 2)} mi in ${formatNumber(run.durationMinutes)} min`,
          }
        : null
    )
);

/** Perceived effort, 1 (easy) to 5 (all out), per run. */
export const runEffort = defineMetric(
  {
    id: "runEffort",
    label: "Run effort",
    unit: "level",
    better: "none",
    scope: "global",
    format: (v) => formatNumber(v),
  },
  (source) => perRun(source, (run) => ({ v: run.perceivedEffort, label: run.category }))
);
