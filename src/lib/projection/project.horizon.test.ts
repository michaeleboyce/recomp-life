// Short histories: the range must carry the uncertainty of the fitted rate, and the
// result must say how far ahead the evidence supports looking.
import { describe, it, expect } from "vitest";
import type { Point } from "@/lib/metrics/types";
import { PROJECTION_COEFFICIENTS as C } from "./coefficients";
import { fitTrend, maxReliableWeeks, projectE1RM, type ProjectionBaseline } from "./index";
import { accumulatedWeeks, MIN_RELIABLE_WEEKS } from "./project";
import { MIN_TREND_POINTS, MS_PER_WEEK } from "./trend";

const NOW = new Date(2026, 10, 12, 18);

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

function weekly(values: number[]): Point[] {
  return values.map((v, i) => ({
    t: NOW.getTime() - (values.length - 1 - i) * MS_PER_WEEK,
    v,
  }));
}

const project = (history: Point[], weeks = 12) =>
  projectE1RM({ history, baseline, weeks, now: NOW });

const FOUR_STEADY = weekly([209, 215, 222, 228]);
const FOUR_JUMP = weekly([209, 209, 215, 234]);
const TEN_NOISY = weekly([256, 243, 257, 267, 251, 256, 271, 254, 271, 264]);

describe("fitTrend slope uncertainty", () => {
  it("reports the standard error of the slope and the span of the points", () => {
    const fit = fitTrend(FOUR_JUMP)!;
    // Weekly points at -1.5, -0.5, 0.5, 1.5 weeks from their mean: sum of squares 5.
    expect(fit.timeSumSquares).toBeCloseTo(5, 9);
    expect(fit.slopeSe).toBeCloseTo(fit.residualSd / Math.sqrt(5), 9);
    expect(fit.spanWeeks).toBeCloseTo(3, 9);
  });

  it("is zero for an exactly linear series", () => {
    expect(fitTrend(weekly([200, 205, 210, 215, 220]))!.slopeSe).toBeCloseTo(0, 9);
  });
});

describe("accumulatedWeeks", () => {
  it("is the factor the central line multiplies the starting rate by", () => {
    expect(accumulatedWeeks(0)).toBe(0);
    expect(accumulatedWeeks(1)).toBe(1);
    expect(accumulatedWeeks(3)).toBeCloseTo(
      1 + C.weeklyRateRetention + C.weeklyRateRetention ** 2,
      12
    );
    const p = project(TEN_NOISY);
    expect(p.gain.v).toBeCloseTo(p.startingRatePerWeek * accumulatedWeeks(12), 9);
  });
});

describe("range includes the uncertainty of the rate", () => {
  for (const [label, history] of [
    ["four steady results", FOUR_STEADY],
    ["four results with one jump", FOUR_JUMP],
    ["ten noisy results", TEN_NOISY],
  ] as const) {
    it(`${label}: level and rate terms combine in quadrature at every week`, () => {
      const fit = fitTrend(history)!;
      const p = project(history);
      const sd = Math.max(fit.residualSd, C.minResidualSdFraction * p.points[0].v);
      const slopeSe = sd / Math.sqrt(fit.timeSumSquares);
      for (const w of [0, 1, 4, 8, 12]) {
        const level = sd * (1 + C.bandGrowth * Math.sqrt(w));
        const rate = slopeSe * accumulatedWeeks(w);
        const half = C.bandWidthSd * Math.hypot(level, rate);
        expect(p.points[w].high - p.points[w].v).toBeCloseTo(half, 6);
      }
    });
  }

  it("four results give a far wider 12-week range than the level term alone", () => {
    for (const history of [FOUR_STEADY, FOUR_JUMP]) {
      const fit = fitTrend(history)!;
      const p = project(history);
      const sd = Math.max(fit.residualSd, C.minResidualSdFraction * p.points[0].v);
      const levelOnly = C.bandWidthSd * sd * (1 + C.bandGrowth * Math.sqrt(12));
      expect(p.points[12].high - p.points[12].v).toBeGreaterThan(1.5 * levelOnly);
    }
  });

  it("the same scatter over more results widens much less", () => {
    const fit = fitTrend(TEN_NOISY)!;
    const p = project(TEN_NOISY);
    const levelOnly = C.bandWidthSd * fit.residualSd * (1 + C.bandGrowth * Math.sqrt(12));
    const half = p.points[12].high - p.points[12].v;
    expect(half).toBeGreaterThan(levelOnly);
    expect(half).toBeLessThan(1.25 * levelOnly);
  });

  it("a flat trend also carries the rate term", () => {
    const history = weekly([250, 251, 249, 250, 250]);
    const p = project(history);
    expect(p.status).toBe("flat-trend");
    const fit = fitTrend(history)!;
    const sd = Math.max(fit.residualSd, C.minResidualSdFraction * p.points[0].v);
    const levelOnly = C.bandWidthSd * sd * (1 + C.bandGrowth * Math.sqrt(12));
    expect(p.points[12].high - p.points[12].v).toBeGreaterThan(levelOnly);
  });
});

describe("maxReliableWeeks", () => {
  it("is 0 without enough points to fit", () => {
    expect(maxReliableWeeks(MIN_TREND_POINTS - 1, 10)).toBe(0);
    expect(maxReliableWeeks(0, 0)).toBe(0);
  });

  it("is the span of the history used, to the nearest week, and at least the minimum", () => {
    expect(MIN_RELIABLE_WEEKS).toBe(4);
    expect(maxReliableWeeks(4, 3)).toBe(MIN_RELIABLE_WEEKS);
    expect(maxReliableWeeks(4, 0.5)).toBe(MIN_RELIABLE_WEEKS);
    expect(maxReliableWeeks(10, 9)).toBe(9);
    expect(maxReliableWeeks(12, 7.6)).toBe(8);
    expect(maxReliableWeeks(13, 12)).toBe(12);
    expect(maxReliableWeeks(6, NaN)).toBe(MIN_RELIABLE_WEEKS);
  });
});

describe("projection horizon gate", () => {
  it("four weekly results support four weeks, so 8 and 12 are flagged", () => {
    for (const history of [FOUR_STEADY, FOUR_JUMP]) {
      expect(project(history, 4).maxReliableWeeks).toBe(4);
      expect(project(history, 4).beyondReliableHorizon).toBe(false);
      expect(project(history, 8).beyondReliableHorizon).toBe(true);
      expect(project(history, 12).beyondReliableHorizon).toBe(true);
    }
  });

  it("does not depend on the horizon asked for", () => {
    expect(project(TEN_NOISY, 4).maxReliableWeeks).toBe(9);
    expect(project(TEN_NOISY, 12).maxReliableWeeks).toBe(9);
    expect(project(TEN_NOISY, 8).beyondReliableHorizon).toBe(false);
    expect(project(TEN_NOISY, 12).beyondReliableHorizon).toBe(true);
  });

  it("a full twelve-week window supports twelve weeks", () => {
    const history = weekly(Array.from({ length: 13 }, (_, i) => 250 + i + (i % 2 ? 2 : -2)));
    const p = project(history, 12);
    expect(p.maxReliableWeeks).toBe(12);
    expect(p.beyondReliableHorizon).toBe(false);
    expect(p.assumptions.join("\n")).not.toMatch(/further ahead than/i);
  });

  it("explains the limit in words the screen can show", () => {
    const p = project(FOUR_STEADY, 12);
    expect(p.reliableHorizonNote).toMatch(/4 results/);
    expect(p.reliableHorizonNote).toMatch(/3 weeks/);
    expect(p.reliableHorizonNote).toMatch(/4 weeks ahead/);
    expect(p.assumptions).toContain(p.reliableHorizonNote);
    // Within the limit the note exists for the screen but is not an assumption.
    const within = project(FOUR_STEADY, 4);
    expect(within.reliableHorizonNote).toBe(p.reliableHorizonNote);
    expect(within.assumptions).not.toContain(within.reliableHorizonNote);
  });

  it("is 0 and unflagged without enough data", () => {
    const p = project(weekly([200, 205, 210]));
    expect(p.status).toBe("insufficient-data");
    expect(p.maxReliableWeeks).toBe(0);
    expect(p.beyondReliableHorizon).toBe(false);
    expect(p.reliableHorizonNote).toBe("");
  });
});
