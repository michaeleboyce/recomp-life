// A scenario that removes the lift entirely (no sets of it and no sessions of it)
// must not project a gain from the personal rate.
import { describe, it, expect } from "vitest";
import type { Point } from "@/lib/metrics/types";
import { PROJECTION_COEFFICIENTS as C } from "./coefficients";
import {
  fitTrend,
  projectE1RM,
  summarizeScenario,
  type ProjectionBaseline,
  type ProjectionScenario,
} from "./index";
import { MS_PER_WEEK } from "./trend";

const NOW = new Date(2026, 10, 12, 18);
const WEEKS = 12;

const history: Point[] = [2, -3, 1, 4, -2, -1, 3, -4, 2, 0].map((noise, i) => ({
  t: NOW.getTime() - (9 - i) * MS_PER_WEEK,
  v: 250 + 2 * i + noise,
}));

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

const project = (scenario?: ProjectionScenario, base = baseline) =>
  projectE1RM({ history, baseline: base, scenario, weeks: WEEKS, now: NOW });

const slope = fitTrend(history)!.slopePerWeek;

describe("a scenario with no sets and no sessions of the lift", () => {
  const none = { directWeeklySets: 0, sessionsPerWeek: 0 };

  it("projects no gain: level points, like a flat trend", () => {
    const p = project(none);
    expect(p.status).toBe("flat-trend");
    expect(p.flatReason).toBe("no-dose");
    expect(p.startingRatePerWeek).toBe(0);
    expect(p.gain.v).toBe(0);
    for (const point of p.points) expect(point.v).toBe(p.points[0].v);
    expect(p.points[0].v).toBe(project().points[0].v);
    expect(p.gain.high).toBeGreaterThan(0);
    expect(p.gain.low).toBeLessThan(0);
  });

  it("says why, and does not claim the estimates are not rising", () => {
    const text = project(none).assumptions.join("\n");
    expect(text).toMatch(/with no sets of the lift, the model has nothing to scale/i);
    expect(text).not.toMatch(/not rising/i);
    expect(text).not.toMatch(/NaN|undefined|Infinity/);
  });

  it("ignores every other scenario field", () => {
    expect(project({ ...none, relatedWeeklySets: 20, passRate: 1, phase: "bulking" }).points).toEqual(
      project(none).points
    );
  });

  it("is summarised without a projected gain", () => {
    const sentence = summarizeScenario(baseline, none, project(none), project());
    expect(sentence).toMatch(/no squat sets or sessions/i);
    expect(sentence).toMatch(/nothing to scale/i);
    expect(sentence).toContain(String(Math.round(project(none).points[WEEKS].v)));
    expect(sentence).toContain(String(Math.round(project().points[WEEKS].v)));
    expect(sentence).not.toMatch(/not rising/i);
  });
});

describe("any non-zero dose keeps the documented clamp", () => {
  it("zero sets of the lift with sessions kept is clamped, not zeroed", () => {
    const p = project({ directWeeklySets: 0 });
    expect(p.status).toBe("ok");
    expect(p.flatReason).toBeNull();
    expect(p.startingRatePerWeek).toBeGreaterThanOrEqual(slope * C.minDoseMultiplier - 1e-9);
    expect(p.startingRatePerWeek).toBeLessThan(slope);
  });

  it("zero sessions with sets kept is clamped at the minimum", () => {
    const p = project({ sessionsPerWeek: 0 });
    expect(p.status).toBe("ok");
    expect(p.startingRatePerWeek).toBeCloseTo(slope * C.minDoseMultiplier, 9);
  });

  it("a small dose is not zero", () => {
    const p = project({ directWeeklySets: 1, sessionsPerWeek: 0.5 });
    expect(p.status).toBe("ok");
    expect(p.startingRatePerWeek).toBeGreaterThan(0);
  });

  it("a baseline that already has no dose still shows the current trend", () => {
    const untrained = { ...baseline, directWeeklySets: 0, sessionsPerWeek: 0 };
    for (const scenario of [undefined, {}, { directWeeklySets: 0, sessionsPerWeek: 0 }]) {
      const p = project(scenario, untrained);
      expect(p.status).toBe("ok");
      expect(p.startingRatePerWeek).toBeCloseTo(slope, 9);
    }
  });
});

describe("flatReason", () => {
  it("is null for a rising trend and 'not-rising' for a flat one", () => {
    expect(project().flatReason).toBeNull();
    const level = history.map((p) => ({ ...p, v: 250 }));
    const p = projectE1RM({ history: level, baseline, weeks: WEEKS, now: NOW });
    expect(p.status).toBe("flat-trend");
    expect(p.flatReason).toBe("not-rising");
  });

  it("stays 'not-rising' when a flat trend also gets a zero-dose scenario", () => {
    const level = history.map((p) => ({ ...p, v: 250 }));
    const p = projectE1RM({
      history: level,
      baseline,
      scenario: { directWeeklySets: 0, sessionsPerWeek: 0 },
      weeks: WEEKS,
      now: NOW,
    });
    expect(p.flatReason).toBe("not-rising");
  });
});
