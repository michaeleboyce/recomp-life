import { describe, expect, it } from "vitest";
import type { Series } from "@/lib/metrics/types";
import { sessionEstimates } from "@/lib/strength";
import { strengthEvidenceOf } from "@/lib/workout/strength";
import { importedStrengthSets } from "./evidence";
import {
  appPointsOnly,
  importedBest,
  importedE1rmPoints,
  importedHistoryOf,
  importedLiftIndex,
  importedSessionsBetween,
  importedVolumePoints,
  importedWorkingWeightPoints,
  withImportedPoints,
} from "./history";
import { importDay, importedSession, importedSet } from "./testRecords";

// Made-up sessions only.

const squat = (day: number, weight: number, reps = 5, extra: Parameters<typeof importedSet>[0] = {}) =>
  importedSession(
    [
      importedSet({ role: "warmup", weightPerImplementLb: 95, reps: 8 }),
      importedSet({ weightPerImplementLb: weight, reps }),
      importedSet({ weightPerImplementLb: weight, reps: reps - 1 }),
      importedSet({ role: "drop", weightPerImplementLb: weight - 40, reps: 6 }),
      importedSet({ exerciseName: "Dumbbell Bench Press", mappedExerciseId: "db_bench", weightPerImplementLb: 50, reps: 10, ...extra }),
    ],
    { startedAt: importDay(day) }
  );

describe("importedLiftIndex", () => {
  const sessions = [squat(0, 185), squat(7, 195)];
  const sets = importedStrengthSets(sessions);

  it("gives one entry per imported session of each exercise, oldest first", () => {
    const history = importedHistoryOf(sets, "squat");
    expect(history.map((h) => h.sessionId)).toEqual(sessions.map((s) => s.id));
    expect(importedHistoryOf(sets, "db_bench")).toHaveLength(2);
    expect(importedHistoryOf(sets, "deadlift")).toEqual([]);
  });

  it("takes the estimated max by the app's formula, never from a warm-up or a drop", () => {
    const [first] = importedHistoryOf(sets, "squat");
    const expected = sessionEstimates(sets, "squat")[0];
    expect(first.estimatedMax).toBe(expected.estimatedMax);
    // 185 × (1 + 5/30), rounded as the app rounds it.
    expect(first.estimatedMax).toBeCloseTo(185 * (1 + 5 / 30), 0);
    expect(first.bestSet).toMatchObject({ weight: 185, reps: 5 });
  });

  it("gives the heaviest working set, the volume and the set count without the warm-up", () => {
    const [first] = importedHistoryOf(sets, "squat");
    expect(first.topSet).toEqual({ weight: 185, reps: 5, perHand: false });
    // 185×5 + 185×4 + 145×6; the warm-up is left out, the drop counted as the app counts its own.
    expect(first.volume).toBe(185 * 5 + 185 * 4 + 145 * 6);
    expect(first.sets).toBe(3);
    const [bench] = importedHistoryOf(sets, "db_bench");
    expect(bench.topSet).toEqual({ weight: 50, reps: 10, perHand: true });
  });

  it("dates each entry at the session's first set of the exercise", () => {
    const [first] = importedHistoryOf(sets, "squat");
    expect(first.t).toBeGreaterThanOrEqual(importDay(0).getTime());
    expect(first.t - importDay(0).getTime()).toBeLessThan(60_000);
  });

  it("reads only imported sets out of combined evidence, and is worked out once per list", () => {
    const combined = strengthEvidenceOf([], sessions);
    expect(importedHistoryOf(combined, "squat")).toHaveLength(2);
    expect(importedLiftIndex(combined)).toBe(importedLiftIndex(combined));
    const appOnly = sets.map((set) => ({ ...set, imported: undefined }));
    expect(importedHistoryOf(appOnly, "squat")).toEqual([]);
  });
});

describe("imported points", () => {
  const sets = importedStrengthSets([squat(0, 185), squat(7, 195)]);
  const history = importedHistoryOf(sets, "squat");

  it("are marked imported and labelled, one per session", () => {
    const e1rm = importedE1rmPoints(history);
    expect(e1rm).toHaveLength(2);
    expect(e1rm.every((p) => p.imported === true)).toBe(true);
    expect(e1rm[1].label).toBe("Imported · 195 x 5");
    expect(e1rm[1].refId).toBe(history[1].sessionId);
    expect(importedWorkingWeightPoints(history).map((p) => p.v)).toEqual([185, 195]);
    expect(importedVolumePoints(history)[0].v).toBe(history[0].volume);
  });

  it("merge into a series in time order, and can be taken out again", () => {
    const series: Series = {
      metric: "e1rm",
      params: { exerciseId: "squat" },
      points: [{ t: importDay(3).getTime(), v: 200, refId: "w1" }],
      unit: "lbs",
      better: "up",
    };
    const merged = withImportedPoints(series, importedE1rmPoints(history));
    expect(merged.points.map((p) => p.refId)).toEqual([history[0].sessionId, "w1", history[1].sessionId]);
    expect(series.points).toHaveLength(1);
    expect(appPointsOnly(merged.points)).toEqual(series.points);
    expect(withImportedPoints(series, [])).toBe(series);
  });
});

describe("importedBest", () => {
  const sets = importedStrengthSets([squat(0, 205), squat(7, 195)]);
  const history = importedHistoryOf(sets, "squat");

  it("is the highest imported estimate, before the app's first session or not", () => {
    const best = importedBest(history, importDay(30).getTime())!;
    expect(best.sessionId).toBe(history[0].sessionId);
    expect(best.value).toBe(history[0].estimatedMax);
    expect(best.beforeApp).toBe(true);
    expect(importedBest(history, importDay(3).getTime())!.beforeApp).toBe(false);
    expect(importedBest(history, null)!.beforeApp).toBe(true);
    expect(importedBest([], null)).toBeNull();
  });
});

describe("importedSessionsBetween", () => {
  it("counts the live imported sessions started in the window", () => {
    const sessions = [
      squat(0, 185),
      squat(2, 185),
      importedSession([importedSet()], { startedAt: importDay(3), deletedAt: 9 }),
      squat(9, 185),
    ];
    expect(importedSessionsBetween(sessions, importDay(0), importDay(7))).toBe(2);
    expect(importedSessionsBetween([], importDay(0), importDay(7))).toBe(0);
  });
});
