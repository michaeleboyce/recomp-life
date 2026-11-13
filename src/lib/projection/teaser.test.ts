import { describe, it, expect } from "vitest";
import type { Point } from "@/lib/metrics/types";
import {
  projectE1RM,
  projectionTeaser,
  summarizeScenario,
  type ProjectionBaseline,
} from "./index";
import { MS_PER_WEEK } from "./trend";

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

function weekly(values: number[], lastWeeksAgo = 0): Point[] {
  return values.map((v, i) => ({
    t: NOW.getTime() - (lastWeeksAgo + values.length - 1 - i) * MS_PER_WEEK,
    v,
  }));
}

const TEN = weekly([252, 249, 255, 260, 256, 259, 265, 260, 268, 268]);

describe("projectionTeaser", () => {
  it("is the projection screen's current-trend number for the same horizon", () => {
    for (const weeks of [4, 8]) {
      const current = projectE1RM({ history: TEN, baseline, weeks, now: NOW });
      const teaser = projectionTeaser({ history: TEN, baseline, now: NOW, weeks });
      expect(teaser).toEqual({ value: Math.round(current.points[weeks].v), weeks });
      // The number in the sentence at the top of the projection screen.
      expect(summarizeScenario(baseline, {}, current, current)).toContain(
        `about ${teaser!.value} in ${weeks} weeks`
      );
    }
  });

  it("is not a straight line through the points: the gain slows", () => {
    const first = TEN[0];
    const last = TEN[TEN.length - 1];
    const straight = last.v + ((last.v - first.v) / 9) * 8;
    const teaser = projectionTeaser({ history: TEN, baseline, now: NOW, weeks: 8 })!;
    expect(teaser.value).toBeLessThan(straight);
  });

  it("is null further ahead than the history supports", () => {
    expect(projectionTeaser({ history: TEN, baseline, now: NOW, weeks: 12 })).toBeNull();
    const four = weekly([209, 215, 222, 228]);
    expect(projectionTeaser({ history: four, baseline, now: NOW, weeks: 8 })).toBeNull();
    expect(projectionTeaser({ history: four, baseline, now: NOW, weeks: 4 })).not.toBeNull();
  });

  it("is null without a rising trend or without enough data", () => {
    const flat = weekly([250, 250, 250, 250, 250, 250, 250, 250, 250]);
    expect(projectionTeaser({ history: flat, baseline, now: NOW, weeks: 8 })).toBeNull();
    expect(projectionTeaser({ history: weekly([200, 205, 210]), baseline, now: NOW, weeks: 4 })).toBeNull();
    expect(projectionTeaser({ history: [], baseline, now: NOW, weeks: 4 })).toBeNull();
  });

  it("is null for a horizon that is not a positive whole number of weeks", () => {
    for (const weeks of [0, -4, NaN]) {
      expect(projectionTeaser({ history: TEN, baseline, now: NOW, weeks })).toBeNull();
    }
  });

  it("does not extrapolate across a break", () => {
    const stale = weekly([220, 223, 226, 229, 232, 235], 10);
    const teaser = projectionTeaser({ history: stale, baseline, now: NOW, weeks: 4 })!;
    expect(teaser.value).toBeLessThan(250);
  });
});
