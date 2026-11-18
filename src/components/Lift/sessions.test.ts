import { describe, expect, it } from "vitest";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { makeSet, makeWorkout } from "@/lib/data/testUtils";
import { importDay, makeImportedSession, makeImportedSet } from "@/lib/import/testRecords";
import { relatedExercises } from "@/lib/strength";
import type { Estimated1RM } from "@/types";
import { importedLiftSessions, importedPoolFor, liftSessions } from "./sessions";

describe("liftSessions", () => {
  it("lists every session with the lift, newest first, one row per tier", () => {
    const now = new Date(2026, 10, 11, 12);
    const demo = generateDemoData(now);
    const rows = liftSessions(demo.workouts, demo.estimated1RMs, "squat");
    const withSquat = demo.workouts.filter((w) =>
      w.sets.some((s) => s.exerciseId === "squat" && s.tier !== "warmup")
    );
    expect(rows.length).toBeGreaterThanOrEqual(withSquat.length);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].t).toBeGreaterThanOrEqual(rows[i].t);
    expect(rows.filter((r) => r.best)).toHaveLength(1);
  });

  it("marks the AMRAP set, failed sets, mean reps left and the best session", () => {
    const w1 = makeWorkout({
      id: "w1",
      completedAt: new Date("2026-11-01T10:00:00Z"),
      startedAt: new Date("2026-11-01T09:00:00Z"),
      sets: [
        makeSet({ exerciseId: "squat", tier: "warmup", weight: 95, actualReps: 5 }),
        makeSet({ exerciseId: "squat", tier: "T1", weight: 215, actualReps: 3, repsInReserve: "3+" }),
        makeSet({ exerciseId: "squat", tier: "T1", weight: 215, actualReps: 2, status: "failed", repsInReserve: "0" }),
        makeSet({ exerciseId: "squat", tier: "T1", weight: 215, actualReps: 5, isAMRAP: true }),
        makeSet({ exerciseId: "bench", tier: "T2", weight: 120, actualReps: 10 }),
      ],
    });
    const w2 = makeWorkout({
      id: "w2",
      completedAt: new Date("2026-11-05T10:00:00Z"),
      startedAt: new Date("2026-11-05T09:00:00Z"),
      sets: [makeSet({ exerciseId: "squat", tier: "T2", weight: 165, actualReps: 10 })],
    });
    const e1rms = [
      { exerciseId: "squat", workoutSessionId: "w1", estimated1RM: 240, date: new Date("2026-11-01") },
      { exerciseId: "squat", workoutSessionId: "w0", estimated1RM: 230, date: new Date("2026-10-01") },
    ] as Estimated1RM[];

    const [second, first] = liftSessions([w1, w2], e1rms, "squat");
    expect(second).toMatchObject({ workoutId: "w2", tier: "T2", weight: 165, meanRepsInReserve: null, best: false });
    expect(first).toMatchObject({ workoutId: "w1", tier: "T1", weight: 215, meanRepsInReserve: 1.5, best: true });
    expect(first.sets).toEqual([
      { reps: 3, amrap: false, failed: false },
      { reps: 2, amrap: false, failed: true },
      { reps: 5, amrap: true, failed: false },
    ]);
  });

  it("names the home substitute on a home session and never marks it best", () => {
    const home = makeWorkout({
      id: "home",
      completedAt: new Date("2026-11-08T10:00:00Z"),
      startedAt: new Date("2026-11-08T09:00:00Z"),
      sets: [
        makeSet({
          exerciseId: "squat",
          tier: "T1",
          weight: 60,
          originalWeight: 215,
          actualReps: 8,
          isAMRAP: true,
          isSubstituted: true,
          substituteExerciseId: "goblet_squat",
          location: "home",
        }),
      ],
    });
    // A stray e1RM row on the home workout must not put "best" on the dumbbell row.
    const e1rms = [
      { exerciseId: "squat", workoutSessionId: "home", estimated1RM: 300, date: new Date("2026-11-08") },
    ] as Estimated1RM[];
    const [row] = liftSessions([home], e1rms, "squat");
    expect(row).toMatchObject({ weight: 60, substituteExerciseId: "goblet_squat", best: false });
  });

  it("keeps barbell and home sets of one tier in separate rows", () => {
    const mixed = makeWorkout({
      id: "mixed",
      completedAt: new Date("2026-11-08T10:00:00Z"),
      startedAt: new Date("2026-11-08T09:00:00Z"),
      sets: [
        makeSet({ exerciseId: "squat", tier: "T1", weight: 215 }),
        makeSet({ exerciseId: "squat", tier: "T1", weight: 60, isSubstituted: true, substituteExerciseId: "goblet_squat" }),
      ],
    });
    const rows = liftSessions([mixed], [], "squat");
    expect(rows.map((r) => [r.weight, r.substituteExerciseId])).toEqual([
      [215, undefined],
      [60, "goblet_squat"],
    ]);
  });
});

// Made-up imported sessions only: the repository is public.
describe("importedLiftSessions", () => {
  const benchDay = makeImportedSession(
    [
      makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 30, reps: 12, role: "warmup" }),
      makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 50, reps: 10, setOrder: 2 }),
      makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 50, reps: 9, setOrder: 3 }),
      makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 40, reps: 8, setOrder: 4, role: "drop" }),
      makeImportedSet({ exerciseName: "Made-up Bench", mappedExerciseId: "bench", weightPerImplementLb: 135, reps: 5 }),
      makeImportedSet({ exerciseName: "Made-up Curl", mappedExerciseId: "bicep_curls", weightPerImplementLb: 25, reps: 12 }),
    ],
    { id: "imp-a", sourceApp: "gravl", startedAt: importDay(10) }
  );
  const unmapped = makeImportedSession(
    [makeImportedSet({ exerciseName: "Zorbing Press", mappedExerciseId: null, muscles: ["chest"] })],
    { id: "imp-b", startedAt: importDay(12) }
  );
  const kept = makeImportedSession(
    [makeImportedSet({ exerciseName: "Made-up Floor Thing", mappedExerciseId: null, weightPerImplementLb: 45, reps: 12 })],
    { id: "imp-c", startedAt: importDay(11) }
  );
  const warmupOnly = makeImportedSession(
    [makeImportedSet({ exerciseName: "Made-up Bench", mappedExerciseId: "bench", role: "warmup" })],
    { id: "imp-d", startedAt: importDay(13) }
  );
  const all = [benchDay, unmapped, kept, warmupOnly];

  it("pools the lift with the exercises its strength estimate pools", () => {
    expect(importedPoolFor("bench")).toEqual(["bench", ...relatedExercises("bench")]);
    expect(importedPoolFor("bench")).toContain("db_bench");
  });

  it("gives a row per exercise of the pool, warm-ups left out, weight as lifted", () => {
    const rows = importedLiftSessions(all, importedPoolFor("bench"));
    expect(rows.map((r) => r.key)).toEqual(["imported-imp-a-db_bench", "imported-imp-a-bench"]);
    expect(rows[0]).toMatchObject({
      exerciseId: "db_bench",
      isVariant: true,
      source: "Gravl",
      weight: 50,
      perHand: true,
      sets: [
        { reps: 10, drop: false },
        { reps: 9, drop: false },
        { reps: 8, drop: true },
      ],
    });
    expect(rows[0].session).toBe(benchDay);
    expect(rows[1]).toMatchObject({ exerciseId: "bench", isVariant: false, weight: 135, perHand: false, sets: [{ reps: 5, drop: false }] });
  });

  it("reads a remapped name as it maps now, newest first", () => {
    const rows = importedLiftSessions(all, importedPoolFor("bench"), {
      "Made-up Floor Thing": { kind: "exercise", exerciseId: "db_floor_press" },
    });
    expect(rows.map((r) => r.key)).toEqual(["imported-imp-c-db_floor_press", "imported-imp-a-db_bench", "imported-imp-a-bench"]);
    expect(rows[0]).toMatchObject({ weight: 45, perHand: true });
  });

  it("for one exercise, lists that exercise only", () => {
    expect(importedLiftSessions(all, ["db_bench"]).map((r) => r.exerciseId)).toEqual(["db_bench"]);
    expect(importedLiftSessions(all, ["db_bench"])[0].isVariant).toBe(false);
  });

  it("leaves out names the library does not know and deleted sessions", () => {
    expect(importedLiftSessions([unmapped], ["bench"])).toEqual([]);
    expect(importedLiftSessions([{ ...benchDay, deletedAt: 5 }], ["bench"])).toEqual([]);
  });
});
