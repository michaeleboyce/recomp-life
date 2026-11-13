import { describe, expect, it } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { cutTargetBand } from "@/components/Progress/body/bodyMath";
import { WEEKLY_SESSION_TARGET } from "@/components/Today/GlanceTiles";
import { calculateGroupVolume } from "@/lib/volumeTracking";
import { calculateWeeklyRateOfLoss } from "@/lib/rateOfLoss";
import type { SetLog } from "@/types";
import { buildWeeklyReview, previousWeek, weekOf, type ReviewSource } from "./index";
import { AFTER, OPTS, W0, W1, W2, W3, WEEK, fixture, warm, weighIns } from "./testFixture";

// lossRate is the sign-flipped rateOfLoss over the 14 days to the week's last weigh-in.
const RATE = -calculateWeeklyRateOfLoss(weighIns, 14)!.lbsPerWeek;

const volume = (s: SetLog[]) => s.reduce((sum, x) => sum + x.weight * x.actualReps, 0);
const lift = (r: ReturnType<typeof buildWeeklyReview>, id: string) => r.lifts.find((l) => l.id === id)!;

describe("buildWeeklyReview", () => {
  const review = buildWeeklyReview(fixture(), [], WEEK, AFTER, OPTS);

  it("counts sessions inside the week boundaries against the target and last week", () => {
    expect(review.sessions).toEqual({ count: 3, target: WEEKLY_SESSION_TARGET, previous: 1 });
    expect(review.isCurrentWeek).toBe(false);
    expect(review.isEmpty).toBe(false);
  });

  it("reports each lift's best, change against the four weeks before, PR and working weight", () => {
    expect(review.lifts.map((l) => l.id)).toEqual(["squat", "bench", "deadlift", "ohp"]);
    expect(lift(review, "squat")).toMatchObject({
      bestE1RM: 225, priorBest: 215, e1rmChange: 10, isPR: true, bestWorkoutId: "w1",
      workingWeight: 200, workingWeightChange: 5, sessions: 1,
    });
    expect(lift(review, "bench")).toMatchObject({ bestE1RM: 175, e1rmChange: -5, isPR: false, workingWeight: 150, workingWeightChange: null, sessions: 2 });
    expect(lift(review, "deadlift")).toMatchObject({ bestE1RM: null, e1rmChange: null, isPR: false, workingWeight: null, sessions: 1 });
    // A first-ever estimate is not a best; the Sunday 23:59 session counts.
    expect(lift(review, "ohp")).toMatchObject({ bestE1RM: 120, priorBest: null, e1rmChange: null, isPR: false, sessions: 1 });
  });

  it("lists the PRs with the gain over the previous best", () => {
    expect(review.prs).toEqual([{ liftId: "squat", label: "Squat", value: 225, gain: 10, workoutId: "w1" }]);
  });

  it("reports the 7-day average, its change and the pace while cutting", () => {
    const bw = review.bodyweight!;
    expect(bw.weighIns).toBe(7);
    expect(bw.average).toBeCloseTo(195.2, 6);
    expect(bw.change).toBeCloseTo(-1.4, 6);
    expect(bw.weeklyRate).toBe(RATE);
    expect(bw.pace).toBe("on pace");
    expect(bw.cutting).toBe(true);
    expect(bw.targetBand).toEqual(cutTargetBand(bw.average));
  });

  it("drops the pace and band while maintaining", () => {
    const bw = buildWeeklyReview(fixture("maintaining"), [], WEEK, AFTER, OPTS).bodyweight!;
    expect(bw).toMatchObject({ pace: null, targetBand: null, cutting: false });
    expect(bw.weeklyRate).toBe(RATE);
  });

  it("is null with fewer than two weigh-ins in the week", () => {
    const src = fixture();
    src.bodyweight = weighIns.filter((w) => w.date < new Date(2026, 10, 3));
    expect(buildWeeklyReview(src, [], WEEK, AFTER, OPTS).bodyweight).toBeNull();
  });

  it("counts hard sets per muscle group as calculateGroupVolume does, and tonnage", () => {
    const now = calculateGroupVolume([...warm, ...W1, ...W2, ...W3]);
    const before = calculateGroupVolume(W0);
    for (const g of review.volume.groups) {
      expect(g.sets).toBe(now[g.group as keyof typeof now]?.directSets ?? 0);
      expect(g.previous).toBe(before[g.group as keyof typeof before]?.directSets ?? 0);
    }
    expect(review.volume.groups.length).toBeGreaterThan(0);
    const counts = review.volume.groups.map((g) => g.sets);
    expect(counts).toEqual([...counts].sort((a, b) => b - a));
    expect(review.volume.tonnage).toBe(volume([...W1, ...W2, ...W3]));
    expect(review.volume.previousTonnage).toBe(volume(W0));
  });

  it("totals runs and activities against last week", () => {
    expect(review.cardio).toEqual({
      runs: { count: 1, miles: 3, minutes: 30 },
      activities: { count: 1, miles: 0, minutes: 60 },
      previousRuns: { count: 1, miles: 2, minutes: 20 },
      previousActivities: { count: 0, miles: 0, minutes: 0 },
    });
  });

  it("counts low-sleep and low-energy check-ins", () => {
    expect(review.readiness).toEqual({ checkIns: 2, lowSleep: 1, lowEnergy: 1 });
    expect(buildWeeklyReview({ ...fixture(), readiness: [] }, [], WEEK, AFTER).readiness).toBeNull();
  });

  it("averages T1 RPE against last week", () => {
    expect(review.effort).toEqual({ meanRpe: 8, sets: 3, previous: 8 });
  });

  it("reads ISO-string dates the same as Date objects", () => {
    const iso = JSON.parse(JSON.stringify(fixture())) as ReviewSource;
    const fromIso = buildWeeklyReview(iso, [], WEEK, AFTER, OPTS);
    expect({ ...fromIso, weekStart: 0, weekEnd: 0 }).toEqual({ ...review, weekStart: 0, weekEnd: 0 });
  });

  it("marks an empty week", () => {
    const empty = buildWeeklyReview(fixture(), [], new Date(2026, 8, 7), AFTER, OPTS);
    expect(empty.isEmpty).toBe(true);
    expect(empty.sessions.count).toBe(0);
    expect(empty.takeaways).toEqual([]);
    expect(empty.bodyweight).toBeNull();
    expect(empty.cardio).toBeNull();
  });

  it("knows the current week", () => {
    const current = buildWeeklyReview(fixture(), [], new Date(2026, 10, 9), AFTER, OPTS);
    expect(current.isCurrentWeek).toBe(true);
    expect(current.sessions.count).toBe(1);
  });
});

describe("demo data", () => {
  it("gives sensible, finite values for the most recent full week", () => {
    const now = new Date(2026, 10, 13, 12);
    const demo = generateDemoData(now);
    const source: ReviewSource = {
      workouts: demo.workouts.map((w) => ({ ...w, sets: demo.sets.filter((s) => w.sets.some((x) => x.id === s.id)) })),
      e1rms: demo.estimated1RMs,
      bodyweight: demo.bodyweight,
      runs: demo.runs,
      readiness: demo.readinessLogs,
      pain: demo.painEntries,
      liftStates: demo.liftStates,
      settings: { ...DEFAULT_USER_PROFILE.settings, trainingPhase: { mode: "cutting" } },
    };
    const week = previousWeek(weekOf(now));
    const r = buildWeeklyReview(source, [], week, now, OPTS);
    expect(r.isEmpty).toBe(false);
    expect(r.sessions.count).toBeGreaterThanOrEqual(2);
    expect(r.sessions.count).toBeLessThanOrEqual(4);
    expect(r.lifts.some((l) => l.bestE1RM !== null)).toBe(true);
    for (const l of r.lifts) {
      for (const v of [l.bestE1RM, l.e1rmChange, l.workingWeight, l.workingWeightChange]) {
        if (v !== null) expect(Number.isFinite(v)).toBe(true);
      }
      if (l.bestE1RM !== null) expect(l.bestE1RM).toBeGreaterThan(50);
    }
    const bw = r.bodyweight!;
    expect(bw.average).toBeGreaterThan(220);
    expect(bw.average).toBeLessThan(235);
    expect(Number.isFinite(bw.change!)).toBe(true);
    expect(r.volume.tonnage).toBeGreaterThan(0);
    expect(r.volume.groups.every((g) => Number.isFinite(g.sets))).toBe(true);
    expect(r.takeaways.length).toBeGreaterThan(0);
    expect(r.takeaways.length).toBeLessThanOrEqual(3);
  });
});
