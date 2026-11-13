// The weekly review: how one Monday-to-Sunday week went, each number against what it
// is compared to. Pure: no React, no database, no clock (`now` is passed in).
import { computeMetric } from "@/lib/metrics";
import { toMs } from "@/lib/metrics/helpers";
import type { Insight } from "@/lib/insights";
import {
  bodyweightReview,
  cardioReview,
  effortReview,
  liftReviews,
  readinessReview,
  volumeReview,
  weeklyValue,
  workoutsInWeek,
} from "./sections";
import { buildTakeaways } from "./takeaways";
import { inWeek, nextWeek, previousWeek, weekOf } from "./weeks";
import type { PRReview, ReviewOptions, ReviewSource, WeeklyReview } from "./types";

export function buildWeeklyReview(
  source: ReviewSource,
  insights: Insight[],
  weekStart: Date,
  now: Date,
  options: ReviewOptions = {}
): WeeklyReview {
  const start = weekOf(weekStart);
  const end = nextWeek(start);
  const sessionPoints = computeMetric("sessionsPerWeek", source).points;
  const lifts = liftReviews(source, start, end);

  const prs: PRReview[] = lifts.flatMap((l) =>
    l.isPR && l.bestE1RM !== null
      ? [
          {
            liftId: l.id,
            label: l.label,
            value: l.bestE1RM,
            gain: l.bestE1RM - previousBest(source, l.id, l.bestE1RM, start, end),
            workoutId: l.bestWorkoutId,
          },
        ]
      : []
  );

  const has = (rows: ReadonlyArray<{ date: Date | string }>) =>
    rows.some((r) => inWeek(toMs(r.date), start));
  const isEmpty =
    workoutsInWeek(source, start).length === 0 &&
    !has(source.bodyweight) &&
    !has(source.runs) &&
    !has(source.activities ?? []);

  const measured = {
    weekStart: start,
    weekEnd: end,
    isCurrentWeek: inWeek(now.getTime(), start),
    sessions: {
      count: workoutsInWeek(source, start).length,
      target: options.sessionTarget ?? null,
      previous: weeklyValue(sessionPoints, previousWeek(start)),
    },
    lifts,
    prs,
    bodyweight: bodyweightReview(source, start, end),
    volume: volumeReview(source, start),
    cardio: cardioReview(source, start),
    readiness: readinessReview(source, start),
    effort: effortReview(source, start),
    isEmpty,
  };
  return { ...measured, takeaways: buildTakeaways(measured, insights, now) };
}

/** The best estimate before the week's best was set (the one it beat). */
function previousBest(
  source: ReviewSource,
  liftId: string,
  value: number,
  start: Date,
  end: Date
): number {
  const points = computeMetric("e1rm", source, { exerciseId: liftId }).points;
  const at = points.find((p) => p.v === value && p.t >= start.getTime() && p.t < end.getTime());
  const earlier = points.filter((p) => at && p.t < at.t).map((p) => p.v);
  return Math.max(...earlier);
}
