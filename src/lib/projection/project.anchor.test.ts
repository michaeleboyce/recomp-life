// Where the projection starts: never beyond the most recent result, and from the
// last actual result when that result is old.
import { describe, it, expect } from "vitest";
import type { Point } from "@/lib/metrics/types";
import { fitTrend, projectE1RM, type ProjectionBaseline } from "./index";
import { STALE_HISTORY_WEEKS } from "./project";
import { MS_PER_WEEK } from "./trend";

const NOW = new Date(2026, 10, 12, 18);
const WEEKS = 12;

const baseline: ProjectionBaseline = {
  exerciseId: "squat",
  sessionsPerWeek: 1.5,
  directWeeklySets: 8,
  relatedWeeklySets: 6,
  byMuscle: [],
  passRate: 0.9,
  phase: "maintaining",
  windowWeeks: 8,
};

/** One result a week, the last one `lastWeeksAgo` weeks before now. */
function weekly(values: number[], lastWeeksAgo = 0): Point[] {
  return values.map((v, i) => ({
    t: NOW.getTime() - (lastWeeksAgo + values.length - 1 - i) * MS_PER_WEEK,
    v,
  }));
}

const project = (history: Point[]) => projectE1RM({ history, baseline, weeks: WEEKS, now: NOW });

describe("projection start after a break", () => {
  it("a rising history that stopped ten weeks ago starts from the last result, not above it", () => {
    const p = project(weekly([220, 223, 226, 229, 232, 235], 10));
    expect(p.status).toBe("ok");
    expect(p.points[0].t).toBe(NOW.getTime());
    expect(p.points[0].v).toBeCloseTo(235, 6);
    expect(p.lastResultWeeksAgo).toBeCloseTo(10, 6);
  });

  it("a falling history that stopped ten weeks ago holds at the last result, not below it", () => {
    const p = project(weekly([250, 248, 246, 244, 242, 240], 10));
    expect(p.status).toBe("flat-trend");
    for (const point of p.points) expect(point.v).toBeCloseTo(240, 6);
  });

  it("says how old the estimate is and that the projection may be optimistic", () => {
    const text = project(weekly([220, 223, 226, 229, 232, 235], 10)).assumptions.join("\n");
    expect(text).toMatch(/10 weeks old/);
    expect(text).toMatch(/time off usually costs some strength/i);
    expect(text).toMatch(/optimistic/i);
    expect(text).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("uses the last actual result once the history is stale, even when it sits off the trend", () => {
    const history = weekly([220, 226, 224, 231, 229, 238], STALE_HISTORY_WEEKS + 2);
    const fit = fitTrend(history)!;
    const p = project(history);
    expect(p.points[0].v).toBeCloseTo(238, 6);
    expect(p.points[0].v).not.toBeCloseTo(fit.valueAt(history[5].t), 1);
  });
});

describe("projection start with recent results", () => {
  it("a history ending now is unchanged: it starts at the fitted value now", () => {
    const history = weekly([221, 222, 227, 228, 233, 234]);
    const fit = fitTrend(history)!;
    const p = project(history);
    expect(p.points[0].v).toBeCloseTo(fit.valueAt(NOW.getTime()), 9);
    expect(p.lastResultWeeksAgo).toBe(0);
    expect(p.assumptions.join("\n")).not.toMatch(/weeks old/);
  });

  it("a last result a few weeks old starts at the fitted value at that result, not extrapolated to now", () => {
    const history = weekly([221, 222, 227, 228, 233, 234], 3);
    const fit = fitTrend(history)!;
    const latest = history[history.length - 1].t;
    const p = project(history);
    expect(3).toBeLessThanOrEqual(STALE_HISTORY_WEEKS);
    expect(p.points[0].v).toBeCloseTo(fit.valueAt(latest), 9);
    expect(p.points[0].v).toBeLessThan(fit.valueAt(NOW.getTime()));
    expect(p.assumptions.join("\n")).not.toMatch(/weeks old/);
  });
});
