// Model polish: minimum range, scenario distance, flat or falling trends, and how
// many more results a projection needs. Property tests: every expectation is a
// relationship or is computed from the imported constants.
import { describe, it, expect } from "vitest";
import type { Point } from "@/lib/metrics/types";
import { PROJECTION_COEFFICIENTS as C } from "./coefficients";
import { fitTrend, projectE1RM, type ProjectionBaseline, type ProjectionScenario } from "./index";
import {
  accumulatedWeeks,
  MAX_SCENARIO_WIDENING,
  resultsNeeded,
  scenarioWidening,
  TREND_WINDOW_WEEKS,
} from "./project";
import { MIN_TREND_POINTS, MS_PER_WEEK } from "./trend";

const NOW = new Date(2026, 2, 30, 18);
const WEEKS = 12;

/** Points ending at `now`, one a week, exactly on a line (residual SD 0). */
function linear(perWeek: number, count = 8, start = 200): Point[] {
  return Array.from({ length: count }, (_, i) => ({
    t: NOW.getTime() - (count - 1 - i) * MS_PER_WEEK,
    v: start + perWeek * i,
  }));
}

const NOISY: Point[] = [2, -3, 1, 4, -2, -1, 3, -4, 2, 0].map((n, i) => ({
  t: NOW.getTime() - (9 - i) * MS_PER_WEEK,
  v: 250 + 2 * i + n,
}));

const STEP = C.weeklySetsCeiling / 8;
const baseline: ProjectionBaseline = {
  exerciseId: "squat",
  sessionsPerWeek: 1.5,
  directWeeklySets: STEP,
  relatedWeeklySets: STEP,
  byMuscle: [],
  passRate: 0.8,
  phase: "maintaining",
  windowWeeks: 8,
};

function project(history: Point[], scenario?: ProjectionScenario) {
  return projectE1RM({ history, baseline, scenario, weeks: WEEKS, now: NOW });
}

const width = (p: { low: number; high: number }) => p.high - p.low;

describe("minimum range", () => {
  it("the key is a small positive fraction", () => {
    expect(C.minResidualSdFraction).toBeGreaterThan(0);
    expect(C.minResidualSdFraction).toBeLessThan(0.1);
  });

  it("an exactly linear history still gets a range of at least the floor", () => {
    const history = linear(2);
    expect(fitTrend(history)!.residualSd).toBeCloseTo(0, 9);
    const p = project(history);
    expect(p.status).toBe("ok");
    const start = p.points[0].v;
    const floorHalf = C.bandWidthSd * C.minResidualSdFraction * start;
    expect(p.points[0].high - p.points[0].v).toBeCloseTo(floorHalf, 6);
    expect(p.points[0].v - p.points[0].low).toBeCloseTo(floorHalf, 6);
    const last = p.points[WEEKS];
    // Updated when the range gained the rate term: at the horizon the floor also
    // feeds the slope's standard error, combined in quadrature with the level term.
    const levelTerm = floorHalf * (1 + C.bandGrowth * Math.sqrt(WEEKS));
    const rateTerm =
      (floorHalf / Math.sqrt(fitTrend(history)!.timeSumSquares)) * accumulatedWeeks(WEEKS);
    expect(last.high - last.v).toBeCloseTo(Math.hypot(levelTerm, rateTerm), 6);
    expect(p.gain.high).toBeGreaterThan(p.gain.v);
    expect(p.gain.low).toBeLessThan(p.gain.v);
  });

  it("does not narrow a range that the scatter already makes wider", () => {
    const fit = fitTrend(NOISY)!;
    const p = project(NOISY);
    const sd = Math.max(fit.residualSd, C.minResidualSdFraction * p.points[0].v);
    expect(sd).toBeGreaterThanOrEqual(fit.residualSd);
    expect(p.points[0].high - p.points[0].v).toBeCloseTo(C.bandWidthSd * sd, 6);
  });

  it("says in the assumptions when the floor sets the range", () => {
    const text = project(linear(2)).assumptions.join("\n");
    expect(text).toContain(`${Math.round(C.minResidualSdFraction * 1000) / 10}%`);
  });
});

describe("scenario distance", () => {
  it("widening is exactly 1 for no change and grows with |ln multiplier|", () => {
    expect(scenarioWidening(1)).toBe(1);
    expect(scenarioWidening(1.2)).toBeCloseTo(1 + C.scenarioUncertainty * Math.log(1.2), 12);
    expect(scenarioWidening(1 / 1.2)).toBeCloseTo(scenarioWidening(1.2), 12);
    expect(scenarioWidening(1.3)).toBeGreaterThan(scenarioWidening(1.1));
    expect(scenarioWidening(0)).toBe(MAX_SCENARIO_WIDENING);
    expect(scenarioWidening(1e-12)).toBe(MAX_SCENARIO_WIDENING);
    expect(scenarioWidening(NaN)).toBe(MAX_SCENARIO_WIDENING);
  });

  it("is a modest judgment value", () => {
    expect(C.scenarioUncertainty).toBeGreaterThan(0);
    expect(C.scenarioUncertainty).toBeLessThanOrEqual(1);
  });

  it("an empty scenario leaves the range exactly as the current trend's", () => {
    const current = project(NOISY);
    expect(project(NOISY, {}).points).toEqual(current.points);
    expect(
      project(NOISY, { sessionsPerWeek: baseline.sessionsPerWeek, phase: baseline.phase }).points
    ).toEqual(current.points);
  });

  it("a scenario further from what the lifter does gets a wider range", () => {
    const current = project(NOISY);
    const near = project(NOISY, { sessionsPerWeek: 2 });
    const far = project(NOISY, { sessionsPerWeek: 3 });
    const lower = project(NOISY, { passRate: baseline.passRate / 2 });
    const w = (p: typeof current) => width(p.points[WEEKS]);
    expect(w(near)).toBeGreaterThan(w(current));
    expect(w(far)).toBeGreaterThan(w(near));
    expect(w(lower)).toBeGreaterThan(w(current));
    // The widening is the factor applied to the current trend's half-width.
    const total = near.startingRatePerWeek / current.startingRatePerWeek;
    expect(w(near) / w(current)).toBeCloseTo(scenarioWidening(total), 6);
  });

  it("explains the extra width in the assumptions", () => {
    expect(project(NOISY).assumptions.join("\n")).not.toMatch(/further from what you do/i);
    expect(project(NOISY, { sessionsPerWeek: 3 }).assumptions.join("\n")).toMatch(
      /further from what you do/i
    );
  });
});

describe("flat or falling trend", () => {
  for (const [label, history] of [
    ["flat", linear(0)],
    ["falling", linear(-2)],
  ] as const) {
    it(`a ${label} trend reports "flat-trend" with level points and a range`, () => {
      const p = project(history, { sessionsPerWeek: 3, phase: "bulking" });
      expect(p.status).toBe("flat-trend");
      expect(p.startingRatePerWeek).toBe(0);
      expect(p.points).toHaveLength(WEEKS + 1);
      for (const point of p.points) expect(point.v).toBe(p.points[0].v);
      expect(p.gain.v).toBe(0);
      expect(p.gain.high).toBeGreaterThan(0);
      expect(p.gain.low).toBeLessThan(0);
      expect(p.evidenceIds.length).toBeGreaterThan(0);
    });
  }

  it("ignores the scenario entirely, so current and alternative are the same", () => {
    const history = linear(-1);
    expect(project(history, { sessionsPerWeek: 3, passRate: 1 })).toEqual(project(history));
  });

  it("explains in plain words why, and what would change it", () => {
    const text = project(linear(-2)).assumptions.join("\n");
    expect(text).toMatch(/not rising/i);
    expect(text).toMatch(/no personal rate/i);
    expect(text).toMatch(/more sessions/i);
    expect(text).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("a rising trend is still ok", () => {
    expect(project(linear(1)).status).toBe("ok");
  });
});

describe("resultsNeeded", () => {
  it("counts the points still missing from the trend window", () => {
    expect(resultsNeeded([], NOW)).toBe(MIN_TREND_POINTS);
    expect(resultsNeeded(linear(2, 1), NOW)).toBe(MIN_TREND_POINTS - 1);
    expect(resultsNeeded(linear(2, 3), NOW)).toBe(MIN_TREND_POINTS - 3);
    expect(resultsNeeded(linear(2, 8), NOW)).toBe(0);
  });

  it("ignores points after now and outside the window", () => {
    const old = linear(2, 6).map((p) => ({ ...p, t: p.t - (TREND_WINDOW_WEEKS + 10) * MS_PER_WEEK }));
    const recent = linear(2, 2);
    const future = { t: NOW.getTime() + MS_PER_WEEK, v: 999 };
    expect(resultsNeeded([...old, ...recent, future], NOW)).toBe(MIN_TREND_POINTS - 2);
  });

  it("is at least 1 when the points cannot be fitted", () => {
    const sameDay = Array.from({ length: 5 }, () => ({ t: NOW.getTime(), v: 200 }));
    expect(resultsNeeded(sameDay, NOW)).toBe(1);
  });
});
