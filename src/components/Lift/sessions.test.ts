import { describe, expect, it } from "vitest";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { makeSet, makeWorkout } from "@/lib/data/testUtils";
import type { Estimated1RM } from "@/types";
import { liftSessions } from "./sessions";

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

  it("marks the AMRAP set, failed sets, mean RPE and the best session", () => {
    const w1 = makeWorkout({
      id: "w1",
      completedAt: new Date("2026-11-01T10:00:00Z"),
      startedAt: new Date("2026-11-01T09:00:00Z"),
      sets: [
        makeSet({ exerciseId: "squat", tier: "warmup", weight: 95, actualReps: 5 }),
        makeSet({ exerciseId: "squat", tier: "T1", weight: 215, actualReps: 3, rpe: 7 }),
        makeSet({ exerciseId: "squat", tier: "T1", weight: 215, actualReps: 2, status: "failed", rpe: 9 }),
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
    expect(second).toMatchObject({ workoutId: "w2", tier: "T2", weight: 165, rpe: null, best: false });
    expect(first).toMatchObject({ workoutId: "w1", tier: "T1", weight: 215, rpe: 8, best: true });
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
