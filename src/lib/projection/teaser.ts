// The one-line "on this trend" figure shown outside the projection screen. Pure.
import type { Point } from "@/lib/metrics/types";
import type { ProjectionBaseline } from "./baseline";
import { projectE1RM } from "./project";

export interface ProjectionTeaser {
  /** Projected estimated 1RM at the horizon, rounded to a whole lb. */
  value: number;
  weeks: number;
}

/**
 * The current-trend projection `weeks` ahead, as the projection screen shows it:
 * `projectE1RM` with an empty scenario, rounded the way the screen's summary
 * sentence rounds. Pass the lift's whole estimated-1RM history (not the range on
 * screen) and the same baseline the projection screen uses, so both show one number.
 *
 * Null when there is nothing honest to tease: the status is not "ok" (too little
 * data, or a flat trend), `weeks` is not a positive whole number, or `weeks` is
 * further ahead than the history supports (`maxReliableWeeks`).
 */
export function projectionTeaser(input: {
  history: Point[];
  baseline: ProjectionBaseline;
  now: Date;
  weeks: number;
}): ProjectionTeaser | null {
  const { history, baseline, now, weeks } = input;
  if (!Number.isInteger(weeks) || weeks <= 0) return null;
  const projection = projectE1RM({ history, baseline, weeks, now });
  if (projection.status !== "ok" || projection.beyondReliableHorizon) return null;
  const end = projection.points[weeks];
  return end ? { value: Math.round(end.v), weeks } : null;
}
