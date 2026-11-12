// With relatedSetTransfer forced to 0, work from other exercises must change nothing.
import { describe, it, expect, vi } from "vitest";
import type { Point } from "@/lib/metrics/types";

vi.mock("./coefficients", async (importOriginal) => {
  const original = await importOriginal<typeof import("./coefficients")>();
  return {
    PROJECTION_COEFFICIENTS: { ...original.PROJECTION_COEFFICIENTS, relatedSetTransfer: 0 },
  };
});

import { projectE1RM, type ProjectionBaseline } from "./index";
import { MS_PER_WEEK } from "./trend";

const NOW = new Date(2026, 2, 30, 18);
const history: Point[] = [2, -3, 1, 4, -2, -1, 3, -4].map((noise, i) => ({
  t: NOW.getTime() - (7 - i) * MS_PER_WEEK,
  v: 250 + 2 * i + noise,
}));
const baseline: ProjectionBaseline = {
  exerciseId: "squat",
  sessionsPerWeek: 1.5,
  directWeeklySets: 4,
  relatedWeeklySets: 3,
  byMuscle: [],
  passRate: 0.8,
  phase: "maintaining",
  windowWeeks: 8,
};

describe("projectE1RM with relatedSetTransfer = 0", () => {
  it("related sets change nothing", () => {
    const base = projectE1RM({ history, baseline, weeks: 12, now: NOW });
    for (const relatedWeeklySets of [0, 1, 6, 30]) {
      const p = projectE1RM({ history, baseline, scenario: { relatedWeeklySets }, weeks: 12, now: NOW });
      expect(p.points).toEqual(base.points);
      expect(p.gain).toEqual(base.gain);
    }
  });

  it("sets of the lift itself still count", () => {
    const base = projectE1RM({ history, baseline, weeks: 12, now: NOW });
    const more = projectE1RM({
      history,
      baseline,
      scenario: { directWeeklySets: 6 },
      weeks: 12,
      now: NOW,
    });
    expect(more.gain.v).toBeGreaterThan(base.gain.v);
  });
});
