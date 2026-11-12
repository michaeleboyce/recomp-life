// Projection of one lift's estimated 1RM under a "what if" scenario, from the local
// database. The maths lives in src/lib/projection; this only gathers and memoises.
import { useMemo, useState } from "react";
import { computeMetric } from "@/lib/metrics";
import type { Point } from "@/lib/metrics/types";
import {
  measureBaseline,
  projectE1RM,
  relatedExerciseIds,
  resultsNeeded,
  summarizeScenario,
  type Projection,
  type ProjectionBaseline,
  type ProjectionScenario,
} from "@/lib/projection";
import { MIN_TREND_POINTS } from "@/lib/projection/trend";
import { useMetricSource } from "./useMetric";

export interface ProjectionResult {
  baseline: ProjectionBaseline;
  /** The current trend: the empty scenario. */
  current: Projection;
  /** The projection under the given scenario. */
  scenario: Projection;
  /** The lift's estimated-1RM history. */
  history: Point[];
  /** The plain-language sentence for the top of the screen. */
  summary: string;
  /** More results needed before a trend can be fitted (0 when it can). */
  resultsNeeded: number;
  /** The instant the projection starts from (taken once per mount). */
  now: number;
}

/**
 * Projects `exerciseId` `weeks` ahead under `scenario`; `undefined` while loading.
 * Related lifts are the other exercises training the lift's primary muscles that
 * have at least MIN_TREND_POINTS working-weight points.
 */
export function useProjection(
  exerciseId: string,
  scenario: ProjectionScenario,
  weeks: number
): ProjectionResult | undefined {
  const source = useMetricSource();
  const [now] = useState(() => Date.now());
  // Callers usually pass a fresh scenario object each render; key on its contents.
  const { sessionsPerWeek, directWeeklySets, relatedWeeklySets, passRate, phase } = scenario;

  const inputs = useMemo(() => {
    if (!source) return undefined;
    const date = new Date(now);
    const history = computeMetric("e1rm", source, { exerciseId }).points;
    const baseline = measureBaseline(source, exerciseId, date);
    const relatedHistory: Record<string, Point[]> = {};
    for (const id of relatedExerciseIds(exerciseId)) {
      const points = computeMetric("workingWeight", source, { exerciseId: id }).points;
      if (points.length >= MIN_TREND_POINTS) relatedHistory[id] = points;
    }
    return { date, history, baseline, relatedHistory };
  }, [source, exerciseId, now]);

  const current = useMemo(() => {
    if (!inputs) return undefined;
    const { history, baseline, relatedHistory, date } = inputs;
    return projectE1RM({ history, baseline, weeks, now: date, relatedHistory });
  }, [inputs, weeks]);

  return useMemo(() => {
    if (!inputs || !current) return undefined;
    const { history, baseline, relatedHistory, date } = inputs;
    const stable: ProjectionScenario = {};
    if (sessionsPerWeek !== undefined) stable.sessionsPerWeek = sessionsPerWeek;
    if (directWeeklySets !== undefined) stable.directWeeklySets = directWeeklySets;
    if (relatedWeeklySets !== undefined) stable.relatedWeeklySets = relatedWeeklySets;
    if (passRate !== undefined) stable.passRate = passRate;
    if (phase !== undefined) stable.phase = phase;
    const projected = projectE1RM({
      history,
      baseline,
      scenario: stable,
      weeks,
      now: date,
      relatedHistory,
    });
    return {
      baseline,
      current,
      scenario: projected,
      history,
      summary: summarizeScenario(baseline, stable, projected, current),
      resultsNeeded: resultsNeeded(history, date),
      now,
    };
  }, [
    inputs,
    current,
    weeks,
    now,
    sessionsPerWeek,
    directWeeklySets,
    relatedWeeklySets,
    passRate,
    phase,
  ]);
}
