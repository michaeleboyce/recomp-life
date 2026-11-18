"use client";

import { useMemo, useState } from "react";
import { useImportedLiftIndex, useMetricSource } from "@/hooks";
import { appPointsOnly, importedBest, type ImportedBest } from "@/lib/import/history";
import type { RangeKey } from "@/lib/metrics/types";
import { liftWindowKey, useChartSpan } from "@/stores/chartWindowStore";
import { liftMetrics, liftStats, liftTeaser, nextT1Opportunity } from "./liftSeries";
import { liftSessions } from "./sessions";

/** What the lift page says about the lift's imported history. */
export interface LiftImportedView {
  /** Imported sessions of the lift (0: nothing to show or hide). */
  count: number;
  /** The highest imported estimated max, shown as history, never as a new best. */
  best: ImportedBest | null;
}

/**
 * What the lift page shows for a program lift over `range` (or the span its chart is
 * zoomed to): its e1RM and other
 * series, stats, next T1, projection teaser and sessions. Undefined while loading.
 *
 * With `showImported` (the default) the series and stats include the lift's imported
 * sessions, marked imported. The next session's new-best line is the app's own: it is
 * judged against the best estimated max of the app's workouts only.
 */
export function useLiftView(exerciseId: string, range: RangeKey, showImported = true) {
  const source = useMetricSource();
  // The window the lift's chart is zoomed to, if it is: the stats follow the chart.
  const span = useChartSpan(liftWindowKey(exerciseId));
  const index = useImportedLiftIndex();
  const [now] = useState(() => Date.now());

  return useMemo(() => {
    if (!source || !index) return undefined;
    const history = index.get(exerciseId) ?? [];
    const metrics = liftMetrics(source, exerciseId, { range, span }, now, showImported ? history : undefined);
    const liftState = source.liftStates.find((s) => s.exerciseId === exerciseId);
    const best = appPointsOnly(metrics.e1rm.full.points).reduce<number | null>(
      (max, p) => (max === null || p.v > max ? p.v : max),
      null
    );
    // The projection screen reads the whole history, imported sessions included, so the
    // teaser does too, whatever is shown on this page.
    const teaserHistory = showImported
      ? metrics.e1rm.full.points
      : liftMetrics(source, exerciseId, "all", now, history).e1rm.full.points;
    const firstApp = source.workouts.reduce<number | null>((min, w) => {
      const t = new Date(w.startedAt).getTime();
      return Number.isFinite(t) && (min === null || t < min) ? t : min;
    }, null);
    const imported: LiftImportedView = { count: history.length, best: importedBest(history, firstApp) };
    return {
      metrics,
      stats: liftStats(metrics),
      next: nextT1Opportunity(exerciseId, liftState, best),
      // The whole history, so the figure matches the projection screen and does not
      // move with the range tab.
      teaser: liftTeaser(source, exerciseId, teaserHistory, now),
      sessions: liftSessions(source.workouts, source.e1rms, exerciseId),
      imported,
    };
  }, [source, index, exerciseId, range, span, now, showImported]);
}

export type LiftView = NonNullable<ReturnType<typeof useLiftView>>;
