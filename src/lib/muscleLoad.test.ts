import { describe, it, expect } from "vitest";
import {
  getExerciseActivation,
  activationHeatLevels,
  combinedActivationHeat,
  calculateMuscleLoad,
  getWeeklyMuscleLoad,
  weeklyHeatLevel,
  weeklyHeatLevels,
  relativeHeatLevels,
  getMuscleLastTrained,
  getMuscleRecovery,
  exercisesForMuscle,
} from "./muscleLoad";
import { MUSCLE_IDS } from "./muscles";
import type { SetLog, TrainingPhase, WorkoutSession } from "@/types";

function makeSet(overrides: Partial<SetLog> = {}): SetLog {
  return {
    id: "test-set",
    clientId: "test-client",
    exerciseId: "squat",
    tier: "T1",
    setNumber: 1,
    targetReps: 3,
    actualReps: 3,
    weight: 190,
    isAMRAP: false,
    completedAt: new Date("2026-02-10T10:00:00"),
    restAfterSeconds: 180,
    status: "completed",
    isSubstituted: false,
    location: "gym",
    synced: false,
    ...overrides,
  };
}

function makeWorkout(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: "w1",
    clientId: "c1",
    templateId: "A1",
    location: "gym",
    startedAt: new Date("2026-02-10T10:00:00"),
    completedAt: new Date("2026-02-10T11:00:00"),
    totalDurationSeconds: 3600,
    includeWarmUps: false,
    selectedAccessories: [],
    sets: [makeSet()],
    preWorkoutPainEntries: [],
    modifications: [],
    synced: false,
    ...overrides,
  };
}

const maintaining: TrainingPhase = { mode: "maintaining" };
const cutting: TrainingPhase = { mode: "cutting" };

function hoursAfter(base: Date, hours: number): Date {
  return new Date(base.getTime() + hours * 60 * 60 * 1000);
}

describe("getExerciseActivation", () => {
  it("returns each muscle with its level", () => {
    const a = getExerciseActivation("bench");
    expect(a.chest).toBe("primary");
    expect(a.front_delts).toBe("secondary");
    expect(a.triceps).toBe("secondary");
    expect(a.rotator_cuff).toBe("stabilizer");
    expect(a.quads).toBeUndefined();
  });

  it("returns an empty map for an unknown exercise", () => {
    expect(getExerciseActivation("nope")).toEqual({});
  });
});

describe("activationHeatLevels", () => {
  it("maps primary 4, secondary 2, stabiliser 1", () => {
    const h = activationHeatLevels("bench");
    expect(h.chest).toBe(4);
    expect(h.triceps).toBe(2);
    expect(h.rotator_cuff).toBe(1);
  });
});

describe("combinedActivationHeat", () => {
  it("takes the highest level across exercises", () => {
    // bench: triceps secondary (2); tricep_pushdowns: triceps primary (4)
    const h = combinedActivationHeat(["bench", "tricep_pushdowns"]);
    expect(h.triceps).toBe(4);
    expect(h.chest).toBe(4);
  });

  it("ignores unknown exercise ids", () => {
    expect(combinedActivationHeat(["nope"])).toEqual({});
  });
});

describe("calculateMuscleLoad (R13)", () => {
  it("returns fractional sets per muscle", () => {
    const load = calculateMuscleLoad([
      makeSet({ exerciseId: "bench", id: "a" }),
      makeSet({ exerciseId: "bench", id: "b" }),
    ]);
    expect(load.chest).toBe(2);
    expect(load.triceps).toBe(1);
    expect(load.rotator_cuff).toBeUndefined();
  });

  it("excludes warm-ups and pain skips", () => {
    expect(
      calculateMuscleLoad([
        makeSet({ tier: "warmup" }),
        makeSet({ status: "skipped_pain" }),
      ])
    ).toEqual({});
  });
});

describe("getWeeklyMuscleLoad", () => {
  const weekStart = new Date("2026-02-09T00:00:00");

  it("sums completed workouts inside the week", () => {
    const load = getWeeklyMuscleLoad(
      [
        makeWorkout({ id: "w1" }),
        makeWorkout({
          id: "w2",
          startedAt: new Date("2026-02-12T10:00:00"),
          completedAt: new Date("2026-02-12T11:00:00"),
        }),
      ],
      weekStart
    );
    expect(load.quads).toBe(2);
  });

  it("ignores workouts outside the week and unfinished ones", () => {
    const load = getWeeklyMuscleLoad(
      [
        makeWorkout({ id: "w1", startedAt: new Date("2026-02-01T10:00:00") }),
        makeWorkout({ id: "w2", completedAt: null }),
      ],
      weekStart
    );
    expect(load).toEqual({});
  });
});

describe("weeklyHeatLevel", () => {
  it("uses the 3 / 6 / 10 set thresholds", () => {
    expect(weeklyHeatLevel(0)).toBe(0);
    expect(weeklyHeatLevel(0.5)).toBe(1);
    expect(weeklyHeatLevel(2.5)).toBe(1);
    expect(weeklyHeatLevel(3)).toBe(2);
    expect(weeklyHeatLevel(5.5)).toBe(2);
    expect(weeklyHeatLevel(6)).toBe(3);
    expect(weeklyHeatLevel(9.5)).toBe(3);
    expect(weeklyHeatLevel(10)).toBe(4);
    expect(weeklyHeatLevel(25)).toBe(4);
  });

  it("weeklyHeatLevels maps a whole load", () => {
    expect(weeklyHeatLevels({ chest: 10, triceps: 4 })).toEqual({
      chest: 4,
      triceps: 2,
    });
  });
});

describe("relativeHeatLevels", () => {
  it("scales to the largest value", () => {
    const h = relativeHeatLevels({ chest: 8, triceps: 4, front_delts: 1 });
    expect(h.chest).toBe(4);
    expect(h.triceps).toBe(2);
    expect(h.front_delts).toBe(1);
  });

  it("returns nothing for an empty or zero load", () => {
    expect(relativeHeatLevels({})).toEqual({});
    expect(relativeHeatLevels({ chest: 0 })).toEqual({});
  });
});

describe("getMuscleLastTrained", () => {
  it("uses the latest completed workout that trained the muscle", () => {
    const last = getMuscleLastTrained([
      makeWorkout({ id: "w1", startedAt: new Date("2026-02-10T10:00:00") }),
      makeWorkout({
        id: "w2",
        startedAt: new Date("2026-02-12T10:00:00"),
        completedAt: new Date("2026-02-12T11:00:00"),
      }),
    ]);
    expect(last.quads?.toISOString()).toBe(
      new Date("2026-02-12T10:00:00").toISOString()
    );
  });

  it("ignores stabiliser-only work, warm-ups and unfinished workouts", () => {
    const last = getMuscleLastTrained([
      makeWorkout({ id: "w1" }), // squat: abs is a stabiliser
      makeWorkout({ id: "w2", completedAt: null, sets: [makeSet({ exerciseId: "bench" })] }),
      makeWorkout({ id: "w3", sets: [makeSet({ exerciseId: "bicep_curls", tier: "warmup" })] }),
    ]);
    expect(last.abs).toBeUndefined();
    expect(last.chest).toBeUndefined();
    expect(last.biceps).toBeUndefined();
    expect(last.quads).toBeDefined();
  });
});

describe("getMuscleRecovery (R3)", () => {
  const trainedAt = new Date("2026-02-10T10:00:00");
  const workouts = [makeWorkout({ startedAt: trainedAt })];

  it("returns a status for every muscle", () => {
    const r = getMuscleRecovery(workouts, hoursAfter(trainedAt, 1), maintaining);
    for (const id of MUSCLE_IDS) expect(r[id]).toBeTruthy();
  });

  it("follows the existing thresholds", () => {
    expect(getMuscleRecovery(workouts, hoursAfter(trainedAt, 24), maintaining).quads).toBe("recovering");
    expect(getMuscleRecovery(workouts, hoursAfter(trainedAt, 60), maintaining).quads).toBe("ready");
    expect(getMuscleRecovery(workouts, hoursAfter(trainedAt, 96), maintaining).quads).toBe("primed");
    expect(getMuscleRecovery(workouts, hoursAfter(trainedAt, 140), maintaining).quads).toBe("ready");
    expect(getMuscleRecovery(workouts, hoursAfter(trainedAt, 200), maintaining).quads).toBe("detraining");
  });

  it("adds 12 hours when cutting", () => {
    // 54h: ready when maintaining (>=48), still recovering when cutting (<60)
    expect(getMuscleRecovery(workouts, hoursAfter(trainedAt, 54), maintaining).quads).toBe("ready");
    expect(getMuscleRecovery(workouts, hoursAfter(trainedAt, 54), cutting).quads).toBe("recovering");
  });

  it("treats never-trained muscles as detraining", () => {
    const r = getMuscleRecovery(workouts, hoursAfter(trainedAt, 1), maintaining);
    expect(r.biceps).toBe("detraining");
  });
});

describe("exercisesForMuscle (R9)", () => {
  it("lists exercises with the muscle as primary or secondary", () => {
    const ids = exercisesForMuscle("triceps").map((e) => e.exercise.id);
    expect(ids).toContain("tricep_pushdowns"); // primary
    expect(ids).toContain("bench"); // secondary
    expect(ids).not.toContain("ab_rollout"); // stabiliser only
    expect(ids).not.toContain("squat");
  });

  it("puts primary exercises first", () => {
    const list = exercisesForMuscle("triceps");
    const firstSecondary = list.findIndex((e) => e.level === "secondary");
    const lastPrimary = list.map((e) => e.level).lastIndexOf("primary");
    expect(lastPrimary).toBeLessThan(firstSecondary);
  });

  it("every muscle is trained by at least one exercise", () => {
    for (const id of MUSCLE_IDS) {
      expect(exercisesForMuscle(id).length).toBeGreaterThan(0);
    }
  });
});
