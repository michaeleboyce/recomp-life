import { describe, expect, it } from "vitest";
import { TREND_SMOOTHING, smoothedEstimate, strengthTimeline } from "@/lib/strength";
import { day, makeT1Session } from "@/lib/strength/testHelpers";
import { trendTotal } from "./strength";

const sets = [
  ...[0, 3, 6].flatMap((d, i) => makeT1Session({ sessionId: `s${i}`, exerciseId: "squat", weight: 200 + 5 * i, amrapReps: 5, day: d })),
  ...[1, 4, 7].flatMap((d, i) => makeT1Session({ sessionId: `b${i}`, exerciseId: "bench", weight: 150 + 5 * i, amrapReps: 5, day: d })),
];

describe("trendTotal (M7)", () => {
  it("sums the lifts' smooth lines and the planner's estimates", () => {
    const now = day(10).getTime();
    const timelines = ["squat", "bench", "deadlift", "ohp"].map((id) => strengthTimeline(id, sets, { now }));
    const total = trendTotal(timelines, "all", now);
    expect(total.lifts).toEqual(["squat", "bench"]);
    expect(total.label).toBe("Total of squat and bench, est. 1RM");
    expect(total.value).toBe(timelines[0].anchor!.value + timelines[1].anchor!.value);
    const lineToday = (i: number) => smoothedEstimate(timelines[i], { halfLifeDays: TREND_SMOOTHING.standard }).today!.v;
    expect(total.summary.latest!.v).toBeCloseTo(lineToday(0) + lineToday(1), 6);
    // Starts once both lifts have a line.
    expect(total.series.points[0].t).toBeGreaterThanOrEqual(timelines[1].points[0].t);
  });

  it("is empty with no sessions", () => {
    const total = trendTotal([strengthTimeline("squat", [], { now: day(1).getTime() })], "3m", day(1).getTime());
    expect(total.lifts).toEqual([]);
    expect(total.value).toBeNull();
    expect(total.series.points).toEqual([]);
  });
});
