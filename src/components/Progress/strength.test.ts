import { describe, expect, it } from "vitest";
import type { Point } from "@/lib/metrics/types";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import type { MetricSource } from "@/lib/metrics/types";
import { stallOf, strengthOverview, totalE1RMPoints, totalLabel } from "./strength";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const p = (day: number, v: number): Point => ({ t: day * DAY, v });

describe("totalE1RMPoints", () => {
  it("is empty when no lift has an estimate", () => {
    expect(totalE1RMPoints({})).toEqual({ points: [], lifts: [] });
  });

  it("starts once all four lifts have an estimate and carries each lift's latest forward", () => {
    const total = totalE1RMPoints({
      squat: [p(1, 200), p(5, 210)],
      bench: [p(2, 150)],
      deadlift: [p(3, 250), p(6, 260)],
      ohp: [p(4, 100)],
    });
    expect(total.lifts).toEqual(["squat", "bench", "deadlift", "ohp"]);
    expect(total.points).toEqual([
      { t: 4 * DAY, v: 200 + 150 + 250 + 100 },
      { t: 5 * DAY, v: 210 + 150 + 250 + 100 },
      { t: 6 * DAY, v: 210 + 150 + 260 + 100 },
    ]);
  });

  it("sums only the lifts that have estimates and says which", () => {
    const total = totalE1RMPoints({ squat: [p(1, 200), p(3, 205)], bench: [p(2, 150)], ohp: [] });
    expect(total.lifts).toEqual(["squat", "bench"]);
    expect(total.points.map((x) => x.v)).toEqual([350, 355]);
  });

  it("adds estimates on the same timestamp once", () => {
    const total = totalE1RMPoints({ squat: [p(1, 200)], bench: [p(1, 150)] });
    expect(total.points).toEqual([{ t: DAY, v: 350 }]);
  });
});

describe("totalLabel", () => {
  it("names the four lifts together, else the ones included", () => {
    expect(totalLabel(["squat", "bench", "deadlift", "ohp"])).toBe("Total of four lifts, est. 1RM");
    expect(totalLabel(["squat", "bench"])).toBe("Total of squat and bench, est. 1RM");
    expect(totalLabel(["squat", "bench", "ohp"])).toBe(
      "Total of squat, bench and overhead press, est. 1RM"
    );
    expect(totalLabel(["deadlift"])).toBe("Deadlift, est. 1RM");
  });
});

describe("stallOf", () => {
  it("is null with fewer than three estimates or when the last three rose", () => {
    expect(stallOf([p(0, 100), p(7, 100)])).toBeNull();
    expect(stallOf([p(0, 100), p(7, 101), p(14, 103)])).toBeNull();
  });

  it("reports the change and weeks over the last three estimates when they did not rise", () => {
    expect(stallOf([p(0, 90), p(7, 120), p(14, 121), p(28, 120)])).toEqual({ change: 0, weeks: 3 });
    expect(stallOf([p(0, 120), p(2, 118), p(4, 115)])).toEqual({ change: -5, weeks: 1 });
  });
});

describe("strengthOverview", () => {
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

  it("lists the four lifts with their latest estimate and lift state", () => {
    const o = strengthOverview(source, "3m", now.getTime());
    expect(o.lifts.map((l) => l.id)).toEqual(["squat", "bench", "deadlift", "ohp"]);
    for (const lift of o.lifts) {
      const rows = demo.estimated1RMs
        .filter((r) => r.exerciseId === lift.id)
        .sort((a, b) => +a.date - +b.date);
      expect(lift.summary.latest?.v).toBe(rows.at(-1)!.estimated1RM);
      expect(lift.liftState?.exerciseId).toBe(lift.id);
    }
    expect(o.total.lifts).toHaveLength(4);
    expect(o.total.summary.latest?.v).toBe(
      o.lifts.reduce((sum, l) => sum + (l.summary.latest?.v ?? 0), 0)
    );
  });

  it("limits the series to the range", () => {
    const all = strengthOverview(source, "all", now.getTime());
    const short = strengthOverview(source, "4w", now.getTime());
    expect(short.total.series.points.length).toBeLessThan(all.total.series.points.length);
    expect(short.total.series.points.every((x) => x.t >= now.getTime() - 4 * WEEK)).toBe(true);
    expect(short.total.summary.change).not.toBe(all.total.summary.change);
  });

  it("is empty with no records", () => {
    const empty = strengthOverview({ ...source, e1rms: [], workouts: [] }, "3m", now.getTime());
    expect(empty.hasData).toBe(false);
    expect(empty.total.series.points).toEqual([]);
  });
});
