import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import type { MetricSource, Point } from "@/lib/metrics/types";
import type { LiftState } from "@/types";
import {
  formatCompact,
  liftMetrics,
  liftStats,
  liftTeaser,
  nextT1Opportunity,
  trendOverlay,
  zeroFilledWeeks,
} from "./liftSeries";
import { computeMetric } from "@/lib/metrics";
import { measureBaseline, projectionTeaser } from "@/lib/projection";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const now = new Date(2026, 10, 11, 12);
const demo = generateDemoData(now);
const source: MetricSource = {
  workouts: demo.workouts,
  e1rms: demo.estimated1RMs,
  bodyweight: demo.bodyweight,
  runs: demo.runs,
  readiness: demo.readinessLogs,
  pain: demo.painEntries,
  liftStates: demo.liftStates,
  settings: DEFAULT_USER_PROFILE.settings,
};

describe("formatCompact", () => {
  it("abbreviates thousands to one decimal", () => {
    expect(formatCompact(8400)).toBe("8.4k");
    expect(formatCompact(12000)).toBe("12k");
    expect(formatCompact(950)).toBe("950");
    expect(formatCompact(949.6)).toBe("950");
  });
});

describe("liftMetrics and liftStats", () => {
  it("summarises each metric over the range", () => {
    const m = liftMetrics(source, "squat", "all", now.getTime());
    expect(m.e1rm.series.points.length).toBe(
      demo.estimated1RMs.filter((r) => r.exerciseId === "squat").length
    );
    const stats = liftStats(m);
    expect(stats.working.value).toBe(m.workingWeight.summary.latest!.v);
    expect(stats.working.change).toBe(m.workingWeight.summary.change);
    const amraps = m.amrapReps.series.points.map((p) => p.v);
    expect(stats.lastSetReps).toBeCloseTo(amraps.reduce((a, b) => a + b, 0) / amraps.length);
    expect(stats.effort).not.toBeNull();
    const weeks = m.weeklyVolume.points.map((p) => p.v);
    expect(stats.weeklyVolume).toBeCloseTo(weeks.reduce((a, b) => a + b, 0) / weeks.length);
  });

  it("a shorter range changes the numbers", () => {
    const all = liftStats(liftMetrics(source, "squat", "all", now.getTime()));
    const short = liftStats(liftMetrics(source, "squat", "4w", now.getTime()));
    expect(short.working.change).not.toBe(all.working.change);
  });

  it("gives nulls with no data", () => {
    const empty = liftStats(
      liftMetrics({ ...source, workouts: [], e1rms: [] }, "squat", "3m", now.getTime())
    );
    expect(empty).toEqual({
      working: { value: null, change: null },
      lastSetReps: null,
      effort: null,
      weeklyVolume: null,
    });
  });
});

const line = (n: number, slope = 2): Point[] =>
  Array.from({ length: n }, (_, i) => ({ t: i * WEEK, v: 200 + slope * i }));

describe("trendOverlay", () => {
  it("needs four points", () => {
    expect(trendOverlay(line(3))).toBeNull();
  });

  it("draws a dashed line from the first to the last point", () => {
    const o = trendOverlay(line(5))!;
    expect(o).toMatchObject({ id: "trend", label: "Trend", style: "dashed" });
    expect(o.points.map((p) => p.t)).toEqual([0, 4 * WEEK]);
    expect(o.points[0].v).toBeCloseTo(200);
    expect(o.points[1].v).toBeCloseTo(208);
  });
});

describe("liftTeaser", () => {
  const history = computeMetric("e1rm", source, { exerciseId: "squat" }).points;
  const baseline = measureBaseline(source, "squat", now);

  it("is the projection screen's figure: 8 weeks ahead, else 4, from the whole history", () => {
    const teaser = liftTeaser(source, "squat", history, now.getTime());
    const expected =
      projectionTeaser({ history, baseline, now, weeks: 8 }) ??
      projectionTeaser({ history, baseline, now, weeks: 4 });
    expect(teaser).not.toBeNull();
    expect(teaser).toEqual(expected);
    // The range tab does not enter into it.
    for (const range of ["4w", "3m", "1y", "all"] as const) {
      const m = liftMetrics(source, "squat", range, now.getTime());
      expect(liftTeaser(source, "squat", m.e1rm.full.points, now.getTime())).toEqual(teaser);
    }
  });

  it("is null when nothing can be projected", () => {
    expect(liftTeaser(source, "squat", line(3), now.getTime())).toBeNull();
  });
});

describe("weekly volume", () => {
  const series = (pts: Point[]) => ({ id: "liftVolume", unit: "lbs", points: pts }) as never;

  it("counts the weeks in the range with no volume as 0, so they pull the mean down", () => {
    const t = now.getTime();
    const pts: Point[] = [
      { t: t - 10 * WEEK, v: 900 },
      { t: t - 3 * WEEK, v: 1000 },
      { t: t - 1 * DAY, v: 2000 },
    ];
    const filled = zeroFilledWeeks(series(pts), series(pts.slice(1)), "4w", t);
    // About five calendar weeks touch a 28-day window; only two have volume.
    expect(filled.points.length).toBeGreaterThanOrEqual(4);
    expect(filled.points.filter((p) => p.v > 0).map((p) => p.v)).toEqual([1000, 2000]);
    expect(filled.points.filter((p) => p.v === 0).length).toBe(filled.points.length - 2);
  });

  it("starts at the first logged volume when that is inside the range", () => {
    const t = now.getTime();
    const pts: Point[] = [{ t: t - 8 * DAY, v: 500 }];
    const filled = zeroFilledWeeks(series(pts), series(pts), "1y", t);
    expect(filled.points.length).toBeLessThanOrEqual(3);
    expect(filled.points[0].v).toBe(500);
  });

  it("the stat is the mean over every week of the range", () => {
    const m = liftMetrics(source, "squat", "3m", now.getTime());
    const weeks = m.weeklyVolume.points;
    expect(liftStats(m).weeklyVolume).toBeCloseTo(weeks.reduce((s, p) => s + p.v, 0) / weeks.length);
  });
});

describe("nextT1Opportunity", () => {
  const squat = demo.liftStates.find((s) => s.exerciseId === "squat") as LiftState;

  it("takes the T1 weight from the lift state and the reps to beat the best", () => {
    const next = nextT1Opportunity("squat", squat, 1000);
    expect(next.weight).toBe(squat.t1Weight);
    expect(next.opportunity).toBeNull();
    const reachable = nextT1Opportunity("squat", { ...squat, recentAMRAPReps: [5, 5, 5] }, squat.t1Weight * 1.05);
    expect(reachable.opportunity).toMatchObject({ chance: "likely" });
    expect(reachable.opportunity!.repsNeeded).toBeGreaterThan(1);
  });

  it("has no opportunity without a best", () => {
    expect(nextT1Opportunity("squat", squat, null).opportunity).toBeNull();
  });
});
