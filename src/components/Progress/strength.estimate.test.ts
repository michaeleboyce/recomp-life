import { describe, expect, it } from "vitest";
import { lineValueAt } from "@/components/chart-kit/trendGeometry";
import { windowBounds } from "@/lib/metrics/window";
import { TREND_SMOOTHING, smoothedEstimate, strengthTimeline, type StrengthSet } from "@/lib/strength";
import { makeStrengthSet } from "@/lib/strength/testHelpers";
import { estimateNote, latestNote, lineChange, liftEstimate, strengthOverview, trendLimits, trendView } from "./strength";

const NOW = new Date(2026, 10, 18, 12);

/** Local noon, `days` before NOW. */
function daysAgo(days: number): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  return d;
}

/** One made-up bench session: an AMRAP top set at `weight` for `reps`. */
function session(id: string, days: number, weight: number, reps: number, imported = false): StrengthSet[] {
  return [
    makeStrengthSet({
      id: `${id}:1`,
      sessionId: id,
      exerciseId: "bench",
      weight,
      reps,
      date: daysAgo(days),
      ...(imported ? { imported: true } : {}),
    }),
  ];
}

// Made up: imported sessions a while ago, heavier than the latest one in the app.
const sets = [
  ...session("i1", 60, 155, 5, true),
  ...session("i2", 40, 160, 5, true),
  ...session("a1", 20, 140, 5),
  ...session("a2", 5, 140, 6),
];

describe("liftEstimate (H4)", () => {
  const timeline = strengthTimeline("bench", sets, { now: NOW.getTime() });

  it("is the planner's pooled estimate, the number the lift page headline shows", () => {
    const estimate = liftEstimate(timeline, "3m")!;
    expect(estimate.value).toBe(timeline.anchor!.value);
  });

  it("gives the change of the same smooth line the lift page draws, over the window", () => {
    const estimate = liftEstimate(timeline, "3m")!;
    const line = smoothedEstimate(timeline, { halfLifeDays: TREND_SMOOTHING.standard }).points;
    const from = Math.max(windowBounds("3m", NOW.getTime()).from, line[0].t);
    const expected = lineValueAt(line, NOW.getTime())!.v - lineValueAt(line, from)!.v;
    expect(estimate.change).toBeCloseTo(expected, 6);
    // The sparkline is that line in the window.
    expect(estimate.line.at(-1)!.v).toBeCloseTo(lineValueAt(line, NOW.getTime())!.v, 6);
    expect(estimate.line.every((p) => p.t >= from)).toBe(true);
  });

  it("says when the newest session was and whether it was imported", () => {
    expect(liftEstimate(timeline, "3m")!.latest).toEqual({ t: daysAgo(5).getTime(), imported: false });
    const old = strengthTimeline("bench", sets.slice(0, 2), { now: NOW.getTime() });
    expect(liftEstimate(old, "3m")!.latest).toEqual({ t: daysAgo(40).getTime(), imported: true });
  });

  it("is what strengthOverview gives each lift when handed the timelines", () => {
    const source = {
      workouts: [],
      e1rms: [],
      bodyweight: [],
      runs: [],
      readiness: [],
      pain: [],
      liftStates: [],
      settings: null,
    };
    const overview = strengthOverview(source, "3m", NOW.getTime(), undefined, [timeline]);
    const bench = overview.lifts.find((l) => l.id === "bench")!;
    expect(bench.estimate?.value).toBe(timeline.anchor!.value);
    expect(overview.lifts.find((l) => l.id === "squat")!.estimate).toBeUndefined();
  });

  it("is null for a lift with no sessions", () => {
    expect(liftEstimate(strengthTimeline("bench", [], { now: NOW.getTime() }), "3m")).toBeNull();
  });
});

describe("the newest evidence of the estimate and the card's note (Q4)", () => {
  const now = NOW.getTime();
  const dbBench = (id: string, days: number, imported = false): StrengthSet[] => [
    makeStrengthSet({
      id: `${id}:1`,
      sessionId: id,
      exerciseId: "db_bench",
      weight: 60,
      perHand: true,
      reps: 8,
      date: daysAgo(days),
      ...(imported ? { imported: true } : {}),
    }),
  ];

  it("is the newest session of any source, a home version included", () => {
    const tl = strengthTimeline("bench", [...sets.slice(0, 2), ...dbBench("h", 8, true)], { now });
    const estimate = liftEstimate(tl, "3m")!;
    expect(estimate.latest).toEqual({ t: daysAgo(40).getTime(), imported: true });
    expect(estimate.newest).toEqual({ t: daysAgo(8).getTime(), imported: true, exerciseId: "db_bench" });
    expect(liftEstimate(timeline(), "3m")!.newest).toEqual({ t: daysAgo(5).getTime(), imported: false, exerciseId: "bench" });
  });

  function timeline() {
    return strengthTimeline("bench", sets, { now });
  }
  const overview = (tl: ReturnType<typeof timeline>) => {
    const source = { workouts: [], e1rms: [], bodyweight: [], runs: [], readiness: [], pain: [], liftStates: [], settings: null };
    return strengthOverview(source, "3m", now, undefined, [tl]).lifts.find((l) => l.id === "bench")!;
  };

  it("says nothing for the app's own session in the range", () => {
    expect(latestNote(overview(timeline()), "3m", now)).toBeNull();
  });

  it("gives the date with Imported, and names a home version when it is the newest", () => {
    const imported = strengthTimeline("bench", sets.slice(0, 2), { now });
    expect(latestNote(overview(imported), "3m", now)).toBe(`Imported, ${shortDay(daysAgo(40))}`);
    const home = strengthTimeline("bench", [...sets.slice(0, 2), ...dbBench("h", 8, true)], { now });
    expect(latestNote(overview(home), "3m", now)).toBe(`Imported, ${shortDay(daysAgo(8))} · DB Bench Press`);
    const appHome = strengthTimeline("bench", [...sets, ...dbBench("h", 2)], { now });
    expect(latestNote(overview(appHome), "3m", now)).toBe(`${shortDay(daysAgo(2))} · DB Bench Press`);
  });

  it("says the same for a lift's estimate on its own (Today's tiles) as for its card", () => {
    const cases = [
      timeline(),
      strengthTimeline("bench", sets.slice(0, 2), { now }),
      strengthTimeline("bench", [...sets.slice(0, 2), ...dbBench("h", 8, true)], { now }),
      strengthTimeline("bench", [...sets, ...dbBench("h", 2)], { now }),
    ];
    for (const tl of cases) {
      expect(estimateNote("bench", liftEstimate(tl, "3m")!, "3m", now)).toBe(latestNote(overview(tl), "3m", now));
    }
    expect(estimateNote("bench", liftEstimate(cases[2], "3m")!, "3m", now)).toBe(`Imported, ${shortDay(daysAgo(8))} · DB Bench Press`);
  });

  it("gives the date, with the year when it is not this year, when the newest is older than the range", () => {
    const old = new Date(2024, 7, 2, 18);
    const source = { workouts: [], e1rms: [], bodyweight: [], runs: [], readiness: [], pain: [], liftStates: [], settings: null };
    const lift = { ...strengthOverview(source, "3m", now).lifts[1], latestBeforeRange: { t: old.getTime(), v: 175 } };
    expect(latestNote(lift, "3m", now)).toBe("Aug 2, 2024");
    expect(latestNote({ ...lift, latestBeforeRange: { t: old.getTime(), v: 175, imported: true } }, "3m", now)).toBe(
      "Imported, Aug 2, 2024"
    );
  });
});

/** "Nov 10" (this year in these tests). */
function shortDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

describe("trendView and lineChange (one window and change for the chart and the cards)", () => {
  const timeline = strengthTimeline("bench", sets, { now: NOW.getTime() });
  const now = NOW.getTime();

  it("limits run from the first dot (or a week back) to now", () => {
    expect(trendLimits(timeline)).toEqual({ from: daysAgo(60).getTime(), to: now });
    const one = strengthTimeline("bench", session("x", 2, 100, 5), { now });
    expect(trendLimits(one)).toEqual({ from: now - 7 * 24 * 3600 * 1000, to: now });
  });

  it("the view is the preset, or the zoomed span, cut to the limits", () => {
    expect(trendView(timeline, "4w")).toEqual({ from: windowBounds("4w", now).from, to: now });
    expect(trendView(timeline, "all")).toEqual(trendLimits(timeline));
    const span = { from: daysAgo(30).getTime(), to: daysAgo(10).getTime() };
    expect(trendView(timeline, { range: "3m", span })).toEqual(span);
    expect(trendView(timeline, { range: "3m", span: { from: daysAgo(400).getTime(), to: now + 1e9 } })).toEqual(
      trendLimits(timeline)
    );
  });

  it("the change is the line's end minus its start in the view, null with no span of line", () => {
    const line = smoothedEstimate(timeline, { halfLifeDays: TREND_SMOOTHING.standard }).points;
    const view = trendView(timeline, "3m");
    const c = lineChange(line, view);
    expect(c.first!.v).toBeCloseTo(lineValueAt(line, Math.max(view.from, line[0].t))!.v, 6);
    expect(c.last!.v).toBeCloseTo(lineValueAt(line, now)!.v, 6);
    expect(c.change).toBeCloseTo(c.last!.v - c.first!.v, 6);
    expect(liftEstimate(timeline, "3m")!.change).toBe(c.change);
    expect(lineChange([], view)).toEqual({ first: null, last: null, change: null });
  });
});
