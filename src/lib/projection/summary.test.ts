import { describe, it, expect } from "vitest";
import type { Projection, ProjectionBaseline } from "./index";
import {
  describeRelatedTrend,
  FLAT_SLOPE_LBS,
  liftShortName,
  summarizeScenario,
} from "./summary";

const baseline: ProjectionBaseline = {
  exerciseId: "squat",
  sessionsPerWeek: 1.5,
  directWeeklySets: 5.1,
  relatedWeeklySets: 7.2,
  byMuscle: [],
  passRate: 0.92,
  phase: "maintaining",
  windowWeeks: 8,
};

/** A projection whose last point (at `weeks`) is `end`. */
function proj(end: number, weeks = 12, status: Projection["status"] = "ok"): Projection {
  const points = Array.from({ length: weeks + 1 }, (_, w) => ({
    t: w,
    v: 240 + ((end - 240) * w) / weeks,
    low: 0,
    high: 0,
  }));
  return {
    status,
    flatReason: status === "flat-trend" ? "not-rising" : null,
    points: status === "insufficient-data" ? [] : points,
    startingRatePerWeek: 1,
    gain: { v: end - 240, low: 0, high: 0 },
    evidenceIds: [],
    assumptions: [],
    fitWindowWeeks: 12,
    maxReliableWeeks: 12,
    beyondReliableHorizon: false,
    reliableHorizonNote: "",
    lastResultWeeksAgo: 0,
  };
}

describe("liftShortName", () => {
  it("drops the equipment prefix and keeps acronyms", () => {
    expect(liftShortName("squat")).toBe("squat");
    expect(liftShortName("bench")).toBe("bench press");
    expect(liftShortName("ohp")).toBe("OHP");
    expect(liftShortName("not_a_lift")).toBe("not_a_lift");
  });
});

describe("describeRelatedTrend", () => {
  it("says rising, flat or falling with the weekly change", () => {
    expect(describeRelatedTrend({ exerciseId: "goblet_squat", slopePerWeek: 2.5 })).toBe(
      "Goblet Squat is rising 2.5 lb a week"
    );
    expect(describeRelatedTrend({ exerciseId: "deadlift", slopePerWeek: -1 })).toBe(
      "Barbell Deadlift is falling 1 lb a week"
    );
    expect(
      describeRelatedTrend({ exerciseId: "deadlift", slopePerWeek: FLAT_SLOPE_LBS / 2 })
    ).toBe("Barbell Deadlift is flat");
  });
});

describe("summarizeScenario", () => {
  it("names the one changed field, the alternative and the current trend", () => {
    expect(summarizeScenario(baseline, { sessionsPerWeek: 2 }, proj(258.4), proj(251.6))).toBe(
      "With 2 squat sessions a week instead of 1.5, about 258 in 12 weeks. On your current trend, about 252."
    );
  });

  it("lists several changes in plain words, and only the changed ones", () => {
    const text = summarizeScenario(
      baseline,
      {
        sessionsPerWeek: baseline.sessionsPerWeek,
        directWeeklySets: 8,
        relatedWeeklySets: 10,
        passRate: 1,
        phase: "bulking",
      },
      proj(263),
      proj(252)
    );
    expect(text).toBe(
      "With 8 sets of squat a week instead of 5.1, 10 sets a week from other exercises for the same muscles instead of 7.2, 100% of sessions passed instead of 92% and bulking instead of maintaining, about 263 in 12 weeks. On your current trend, about 252."
    );
    expect(text).not.toMatch(/sessions a week/);
  });

  it("uses the singular for one session and one week", () => {
    expect(summarizeScenario(baseline, { sessionsPerWeek: 1 }, proj(245, 1), proj(246, 1))).toBe(
      "With 1 squat session a week instead of 1.5, about 245 in 1 week. On your current trend, about 246."
    );
  });

  it("with no change describes the current trend only", () => {
    expect(summarizeScenario(baseline, {}, proj(252, 8), proj(252, 8))).toBe(
      "On your current trend, about 252 in 8 weeks."
    );
    expect(
      summarizeScenario(baseline, { phase: "maintaining" }, proj(252, 8), proj(252, 8))
    ).toBe("On your current trend, about 252 in 8 weeks.");
  });

  it("says plainly when the trend is flat", () => {
    const flat = proj(240, 12, "flat-trend");
    expect(summarizeScenario(baseline, { sessionsPerWeek: 3 }, flat, flat)).toBe(
      "Your recent squat estimates are not rising, so the projection holds about 240 for the next 12 weeks."
    );
  });

  it("says when there is not enough data", () => {
    const none = proj(0, 12, "insufficient-data");
    expect(summarizeScenario(baseline, {}, none, none)).toBe(
      "Not enough recent squat results to project yet."
    );
  });
});
