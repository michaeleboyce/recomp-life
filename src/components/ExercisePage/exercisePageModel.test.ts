import { describe, expect, it } from "vitest";
import { makeLiftState, makeSet, makeWorkout } from "@/lib/data/testUtils";
import { sessionEstimates } from "@/lib/strength";
import { strengthSetsOf } from "@/lib/workout/strength";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import type { LiftAdjustment, NextSetPlan } from "@/types";
import type { LiftSession } from "@/components/Lift/sessions";
import {
  classifyExercise,
  editorSets,
  exerciseAdjustments,
  exerciseEyebrow,
  exerciseTitle,
  homeCountsToward,
  lastWeight,
  liftHomeVersions,
  liftPlanWeight,
  nextPlannedEntry,
  performedSessions,
  ratioBasisText,
  t3LastSets,
} from "./exercisePageModel";

function entry(overrides: Partial<WorkoutExerciseState>): WorkoutExerciseState {
  return {
    exerciseId: "squat",
    tier: "T1",
    targetSets: 5,
    targetReps: 3,
    weight: 190,
    isAMRAP: true,
    isWarmUp: false,
    completedSets: 0,
    ...overrides,
  };
}

function adjustment(overrides: Partial<LiftAdjustment>): LiftAdjustment {
  return {
    id: overrides.id ?? "a",
    clientId: "c",
    exerciseId: "squat",
    at: new Date("2026-11-01"),
    source: "manual",
    set: { t1Weight: 200 },
    synced: false,
    ...overrides,
  } as LiftAdjustment;
}

describe("classifyExercise", () => {
  it("knows a barbell lift, a home version, a program T3, an accessory and anything else", () => {
    expect(classifyExercise("squat")).toEqual({ kind: "lift", liftId: "squat" });
    expect(classifyExercise("bulgarian_split_squat")).toEqual({ kind: "home", liftId: "squat" });
    expect(classifyExercise("goblet_squat")).toEqual({ kind: "home", liftId: "squat" });
    expect(classifyExercise("db_floor_press")).toEqual({ kind: "home", liftId: "bench" });
    expect(classifyExercise("db_row")).toEqual({ kind: "t3" });
    expect(classifyExercise("lat_pulldown")).toEqual({ kind: "t3" });
    expect(classifyExercise("face_pulls")).toEqual({ kind: "accessory" });
    expect(classifyExercise("incline_db_row")).toEqual({ kind: "accessory" });
    // Bodyweight: no load for double progression to move, so not an accessory.
    expect(classifyExercise("push_up")).toEqual({ kind: "reference" });
  });
});

describe("the header", () => {
  it("titles a barbell lift by its catalogue name and anything else by its display name", () => {
    expect(exerciseTitle("squat", classifyExercise("squat"))).toBe("Barbell Squat");
    expect(exerciseTitle("bulgarian_split_squat", classifyExercise("bulgarian_split_squat"))).toBe(
      "Bulgarian split squat"
    );
  });

  it("says what kind of exercise it is", () => {
    expect(exerciseEyebrow("squat", classifyExercise("squat"))).toBe("T1 · Squat");
    expect(exerciseEyebrow("squat", classifyExercise("squat"), "T2")).toBe("T2 · Squat");
    expect(exerciseEyebrow("bulgarian_split_squat", classifyExercise("bulgarian_split_squat"))).toBe(
      "Home version of Squat"
    );
    expect(exerciseEyebrow("db_row", classifyExercise("db_row"))).toBe("T3 · Pull");
    expect(exerciseEyebrow("face_pulls", classifyExercise("face_pulls"))).toBe("Accessory");
  });
});

describe("nextPlannedEntry", () => {
  const upcoming = [
    { templateId: "A1", projected: false, plan: [entry({ exerciseId: "squat", isWarmUp: true }), entry({ exerciseId: "bench", tier: "T2" })] },
    {
      templateId: "B1",
      projected: true,
      plan: [entry({ exerciseId: "squat", tier: "T1", substituteExerciseId: "bulgarian_split_squat" }), entry({ exerciseId: "db_row", tier: "T3" })],
    },
    { templateId: "A2", projected: true, plan: [entry({ exerciseId: "squat", tier: "T2", weight: 135 })] },
  ];

  it("finds the first coming workout with the exercise performed, warm-ups left out", () => {
    expect(nextPlannedEntry(upcoming, "squat")).toMatchObject({ templateId: "A2", workoutsAway: 2, projected: true });
    expect(nextPlannedEntry(upcoming, "bulgarian_split_squat")).toMatchObject({ templateId: "B1", workoutsAway: 1 });
    expect(nextPlannedEntry(upcoming, "db_row")?.entry.tier).toBe("T3");
    expect(nextPlannedEntry(upcoming, "face_pulls")).toBeNull();
    expect(nextPlannedEntry(undefined, "squat")).toBeNull();
  });
});

describe("performedSessions", () => {
  const workouts = [
    makeWorkout({
      id: "gym",
      startedAt: new Date("2026-11-01T09:00:00Z"),
      completedAt: new Date("2026-11-01T10:00:00Z"),
      sets: [
        makeSet({ exerciseId: "squat", tier: "T1", weight: 200, actualReps: 5, isAMRAP: true }),
        makeSet({ exerciseId: "lat_pulldown", tier: "T3", weight: 100, actualReps: 20, isAMRAP: true }),
      ],
    }),
    makeWorkout({
      id: "home",
      startedAt: new Date("2026-11-03T09:00:00Z"),
      completedAt: new Date("2026-11-03T10:00:00Z"),
      sets: [
        makeSet({ exerciseId: "squat", tier: "T1", weight: 40, substituteExerciseId: "bulgarian_split_squat", isSubstituted: true }),
        makeSet({ exerciseId: "lat_pulldown", tier: "T3", weight: 45, actualReps: 26, substituteExerciseId: "db_row", isSubstituted: true }),
      ],
    }),
    makeWorkout({
      id: "row",
      startedAt: new Date("2026-11-05T09:00:00Z"),
      completedAt: new Date("2026-11-05T10:00:00Z"),
      sets: [makeSet({ exerciseId: "db_row", tier: "T3", weight: 50, actualReps: 18, isAMRAP: true })],
    }),
  ];

  it("gives a barbell lift its own sessions only, never a home version's", () => {
    const rows = performedSessions(workouts, [], "squat");
    expect(rows.map((r) => r.workoutId)).toEqual(["gym"]);
  });

  it("gives a home version its sessions done for the lift", () => {
    const rows = performedSessions(workouts, [], "bulgarian_split_squat");
    expect(rows.map((r) => [r.workoutId, r.weight])).toEqual([["home", 40]]);
  });

  it("gives an exercise both its own sessions and those done standing in for another, newest first", () => {
    const rows = performedSessions(workouts, [], "db_row");
    expect(rows.map((r) => r.workoutId)).toEqual(["row", "home"]);
    expect(lastWeight(rows)).toMatchObject({ weight: 50, tier: "T3" });
    expect(lastWeight([])).toBeNull();
  });
});

describe("exerciseAdjustments", () => {
  const all = [
    adjustment({ id: "start", source: "start", set: { t1Weight: 190, t2Weight: 135 } }),
    adjustment({ id: "home", variant: { exerciseId: "bulgarian_split_squat", tier: "T1" }, set: { t1Weight: 40 } }),
    adjustment({ id: "goblet", variant: { exerciseId: "goblet_squat", tier: "T1" }, set: { t1Weight: 50 } }),
    adjustment({ id: "row", exerciseId: "db_row", set: { t3Weight: 50 } }),
  ];

  it("a home version lists its own changes, not the squat's starting weights", () => {
    expect(exerciseAdjustments(all, "bulgarian_split_squat")!.map((a) => a.id)).toEqual(["home"]);
  });

  it("a barbell lift lists its changes without a home version", () => {
    expect(exerciseAdjustments(all, "squat")!.map((a) => a.id)).toEqual(["start"]);
    expect(exerciseAdjustments(all, "db_row")!.map((a) => a.id)).toEqual(["row"]);
    expect(exerciseAdjustments(undefined, "squat")).toBeUndefined();
  });
});

describe("liftPlanWeight", () => {
  it("reads the tier's planned weight while it differs", () => {
    const state = makeLiftState({ exerciseId: "squat", t1Weight: 200, t1PlannedWeight: 190, t3PlannedWeight: 50 });
    expect(liftPlanWeight(state, "T1", 200)).toBe(190);
    expect(liftPlanWeight(state, "T1", 190)).toBeNull();
    expect(liftPlanWeight(state, "T2", 135)).toBeNull();
    expect(liftPlanWeight(state, "T3", 55)).toBe(50);
    expect(liftPlanWeight(undefined, "T1", 200)).toBeNull();
  });
});

describe("strength", () => {
  const workouts = [
    makeWorkout({
      id: "w1",
      startedAt: new Date("2026-11-01T09:00:00Z"),
      completedAt: new Date("2026-11-01T10:00:00Z"),
      sets: [
        makeSet({ exerciseId: "squat", tier: "T1", weight: 200, actualReps: 5, isAMRAP: true, completedAt: new Date("2026-11-01T09:30:00Z") }),
        makeSet({
          exerciseId: "squat",
          substituteExerciseId: "bulgarian_split_squat",
          isSubstituted: true,
          tier: "T1",
          weight: 40,
          actualReps: 6,
          isAMRAP: true,
          completedAt: new Date("2026-11-01T09:40:00Z"),
        }),
      ],
    }),
  ];
  const sets = strengthSetsOf(workouts);

  it("says what a home version's latest session means for its lift, with the ratio", () => {
    const counts = homeCountsToward(sets, "squat", "bulgarian_split_squat");
    expect(counts.pooled).toBeGreaterThan(0);
    expect(counts.ratio?.ratio).toBeGreaterThan(0);
    expect(counts.says).toBe(Math.round(sessionEstimates(sets, "bulgarian_split_squat")[0].estimatedMax / counts.ratio!.ratio));
    expect(counts.fromTarget).toBe(false);
    expect(homeCountsToward(undefined, "squat", "goblet_squat")).toMatchObject({ pooled: null, says: null });
  });

  it("lists a lift's home versions with their ratios", () => {
    const versions = liftHomeVersions(sets, "squat");
    expect(versions.map((v) => v.exerciseId)).toEqual(["goblet_squat", "bulgarian_split_squat", "db_lunge"]);
    expect(versions.every((v) => v.ratio !== null)).toBe(true);
    expect(ratioBasisText({ pairs: 0 })).toBe("starting ratio");
    expect(ratioBasisText({ pairs: 1 })).toBe("from 1 pair of your sessions");
  });
});

describe("t3LastSets", () => {
  const session = (
    key: string,
    reps: number[],
    tier: LiftSession["tier"] = "T3",
    weight = 50,
    substituteExerciseId?: string
  ): LiftSession => ({
    key,
    workoutId: key,
    t: 0,
    tier,
    weight,
    sets: reps.map((r) => ({ reps: r, amrap: false, failed: false })),
    meanRepsInReserve: null,
    best: false,
    ...(substituteExerciseId ? { substituteExerciseId } : {}),
  });
  const equipment = { dumbbellIncrementLbs: 5, maxDumbbellWeight: 50 };

  it("reads the last set's reps against the threshold, not the total", () => {
    const rows = t3LastSets(
      [session("a", [15, 15, 20]), session("b", [20, 20, 19]), session("c", [5], "T1")],
      equipment
    );
    expect(rows.map((r) => [r.key, r.reps, r.threshold, r.reached])).toEqual([
      ["a", 20, 20, true],
      ["b", 19, 20, false],
    ]);
  });

  it("marks each session against the threshold of its own weight", () => {
    const rows = t3LastSets(
      [session("heavy", [15, 15, 18], "T3", 120), session("light", [15, 15, 23], "T3", 25)],
      equipment
    );
    expect(rows.map((r) => [r.key, r.threshold, r.reached])).toEqual([
      ["heavy", 18, true],
      ["light", 24, false],
    ]);
  });

  it("a home session at the heaviest dumbbell asks the maximum", () => {
    const [row] = t3LastSets([session("home", [15, 15, 24], "T3", 50, "db_row")], equipment);
    expect(row).toMatchObject({ threshold: 25, reached: false });
  });
});

describe("the set editor's sets", () => {
  const planSets = [
    { weight: 100, reps: 5 },
    { weight: 100, reps: 5 },
    { weight: 100, reps: 5 },
  ];

  it("are the plan's sets, or the stored next-session plan's when it fits", () => {
    const mine = [{ weight: 105, reps: 5 }, ...planSets.slice(1)];
    const stored: NextSetPlan = {
      exerciseId: "squat",
      liftId: "squat",
      tier: "T1",
      sets: mine,
      planSets,
      createdAt: "2026-11-17T00:00:00.000Z",
    };
    expect(editorSets(stored, planSets)).toBe(mine);
    expect(editorSets({ ...stored, sets: mine.slice(1) }, planSets)).toBe(planSets);
    expect(editorSets(undefined, planSets)).toBe(planSets);
  });
});
