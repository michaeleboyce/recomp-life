import { describe, it, expect } from "vitest";
import { EXERCISES, getExercise } from "./exercises";
import {
  WORKOUT_TEMPLATES,
  WORKOUT_ROTATION,
  getNextWorkoutId,
  ACCESSORY_RECOMMENDATIONS,
} from "./workoutTemplates";
import type { Exercise } from "@/types";

describe("Exercise Registry", () => {
  it("every exercise has required fields", () => {
    for (const [id, exercise] of Object.entries(EXERCISES)) {
      expect(exercise.id).toBe(id);
      expect(exercise.name).toBeTruthy();
      expect(exercise.type).toBeTruthy();
      expect(exercise.muscleGroup).toBeTruthy();
      expect(typeof exercise.requiresGym).toBe("boolean");
      expect(Array.isArray(exercise.primaryMuscles)).toBe(true);
      expect(exercise.primaryMuscles.length).toBeGreaterThan(0);
      expect(Array.isArray(exercise.secondaryMuscles)).toBe(true);
      expect(Array.isArray(exercise.painSensitiveRegions)).toBe(true);
    }
  });

  it("substitution links are bidirectional", () => {
    for (const [id, exercise] of Object.entries(EXERCISES)) {
      if (exercise.dumbbellAlternative) {
        const alt = EXERCISES[exercise.dumbbellAlternative];
        expect(alt).toBeDefined();
        expect(alt.barbellEquivalent).toBe(id);
      }
      if (exercise.barbellEquivalent) {
        const equiv = EXERCISES[exercise.barbellEquivalent];
        expect(equiv).toBeDefined();
        expect(equiv.dumbbellAlternative).toBe(id);
      }
    }
  });

  it("getExercise returns the correct exercise", () => {
    const squat = getExercise("squat");
    expect(squat.id).toBe("squat");
    expect(squat.name).toBe("Barbell Squat");
  });

  it("getExercise throws for unknown exercise ID", () => {
    expect(() => getExercise("nonexistent")).toThrow();
  });

  it("main compound lifts are present", () => {
    expect(EXERCISES.squat).toBeDefined();
    expect(EXERCISES.bench).toBeDefined();
    expect(EXERCISES.deadlift).toBeDefined();
    expect(EXERCISES.ohp).toBeDefined();
  });

  it("compound lifts require gym", () => {
    expect(EXERCISES.squat.requiresGym).toBe(true);
    expect(EXERCISES.bench.requiresGym).toBe(true);
    expect(EXERCISES.deadlift.requiresGym).toBe(true);
    expect(EXERCISES.ohp.requiresGym).toBe(true);
  });

  it("home substitutions do not require gym", () => {
    expect(EXERCISES.goblet_squat.requiresGym).toBe(false);
    expect(EXERCISES.db_bench.requiresGym).toBe(false);
    expect(EXERCISES.db_rdl.requiresGym).toBe(false);
    expect(EXERCISES.db_shoulder_press.requiresGym).toBe(false);
  });

  it("compound lifts have correct dumbbell alternatives", () => {
    expect(EXERCISES.squat.dumbbellAlternative).toBe("goblet_squat");
    expect(EXERCISES.bench.dumbbellAlternative).toBe("db_bench");
    expect(EXERCISES.deadlift.dumbbellAlternative).toBe("db_rdl");
    expect(EXERCISES.ohp.dumbbellAlternative).toBe("db_shoulder_press");
  });

  it("home substitutions have correct barbell equivalents", () => {
    expect(EXERCISES.goblet_squat.barbellEquivalent).toBe("squat");
    expect(EXERCISES.db_bench.barbellEquivalent).toBe("bench");
    expect(EXERCISES.db_rdl.barbellEquivalent).toBe("deadlift");
    expect(EXERCISES.db_shoulder_press.barbellEquivalent).toBe("ohp");
  });

  it("all exercises have valid muscle group values", () => {
    const validGroups = ["push", "pull", "legs", "core", "full_body"];
    for (const exercise of Object.values(EXERCISES)) {
      expect(validGroups).toContain(exercise.muscleGroup);
    }
  });

  it("all exercises have valid type values", () => {
    const validTypes = ["barbell", "dumbbell", "cable", "bodyweight"];
    for (const exercise of Object.values(EXERCISES)) {
      expect(validTypes).toContain(exercise.type);
    }
  });
});

describe("Workout Templates", () => {
  it("templates reference valid exercise IDs", () => {
    for (const template of Object.values(WORKOUT_TEMPLATES)) {
      for (const ex of template.exercises) {
        expect(EXERCISES[ex.exerciseId]).toBeDefined();
      }
    }
  });

  it("each template has exactly 3 exercises (T1, T2, T3)", () => {
    for (const [id, template] of Object.entries(WORKOUT_TEMPLATES)) {
      expect(template.exercises).toHaveLength(3);
      expect(template.exercises[0].tier).toBe("T1");
      expect(template.exercises[1].tier).toBe("T2");
      expect(template.exercises[2].tier).toBe("T3");
    }
  });

  it("T1 last set is AMRAP", () => {
    for (const template of Object.values(WORKOUT_TEMPLATES)) {
      const t1 = template.exercises[0];
      expect(t1.tier).toBe("T1");
      expect(t1.isAMRAP).toBe(true);
    }
  });

  it("T3 last set is AMRAP", () => {
    for (const template of Object.values(WORKOUT_TEMPLATES)) {
      const t3 = template.exercises[2];
      expect(t3.tier).toBe("T3");
      expect(t3.isAMRAP).toBe(true);
    }
  });

  it("T2 is not AMRAP", () => {
    for (const template of Object.values(WORKOUT_TEMPLATES)) {
      const t2 = template.exercises[1];
      expect(t2.tier).toBe("T2");
      expect(t2.isAMRAP).toBe(false);
    }
  });

  it("all four workout templates exist", () => {
    expect(WORKOUT_TEMPLATES.A1).toBeDefined();
    expect(WORKOUT_TEMPLATES.B1).toBeDefined();
    expect(WORKOUT_TEMPLATES.A2).toBeDefined();
    expect(WORKOUT_TEMPLATES.B2).toBeDefined();
  });

  it("A1 template has correct exercises", () => {
    const a1 = WORKOUT_TEMPLATES.A1;
    expect(a1.exercises[0].exerciseId).toBe("squat");
    expect(a1.exercises[0].sets).toBe(5);
    expect(a1.exercises[0].reps).toBe(3);
    expect(a1.exercises[1].exerciseId).toBe("bench");
    expect(a1.exercises[1].sets).toBe(3);
    expect(a1.exercises[1].reps).toBe(10);
    expect(a1.exercises[2].exerciseId).toBe("lat_pulldown");
    expect(a1.exercises[2].sets).toBe(3);
    expect(a1.exercises[2].reps).toBe(15);
  });

  it("B1 template has correct exercises", () => {
    const b1 = WORKOUT_TEMPLATES.B1;
    expect(b1.exercises[0].exerciseId).toBe("ohp");
    expect(b1.exercises[1].exerciseId).toBe("deadlift");
    expect(b1.exercises[2].exerciseId).toBe("db_row");
  });

  it("A2 template has correct exercises", () => {
    const a2 = WORKOUT_TEMPLATES.A2;
    expect(a2.exercises[0].exerciseId).toBe("bench");
    expect(a2.exercises[1].exerciseId).toBe("squat");
    expect(a2.exercises[2].exerciseId).toBe("lat_pulldown");
  });

  it("B2 template has correct exercises", () => {
    const b2 = WORKOUT_TEMPLATES.B2;
    expect(b2.exercises[0].exerciseId).toBe("deadlift");
    expect(b2.exercises[1].exerciseId).toBe("ohp");
    expect(b2.exercises[2].exerciseId).toBe("db_row");
  });
});

describe("Workout Rotation", () => {
  it("rotation has 4 entries", () => {
    expect(WORKOUT_ROTATION).toHaveLength(4);
  });

  it("rotation order is A1, B1, A2, B2", () => {
    expect(WORKOUT_ROTATION).toEqual(["A1", "B1", "A2", "B2"]);
  });

  it("getNextWorkoutId cycles correctly", () => {
    expect(getNextWorkoutId("A1")).toBe("B1");
    expect(getNextWorkoutId("B1")).toBe("A2");
    expect(getNextWorkoutId("A2")).toBe("B2");
    expect(getNextWorkoutId("B2")).toBe("A1");
  });

  it("getNextWorkoutId wraps around from B2 to A1", () => {
    expect(getNextWorkoutId("B2")).toBe("A1");
  });

  it("getNextWorkoutId returns A1 for unknown ID", () => {
    expect(getNextWorkoutId("unknown")).toBe("A1");
  });
});

describe("Accessory Recommendations", () => {
  it("recommendations exist for all 4 workout days", () => {
    expect(ACCESSORY_RECOMMENDATIONS.A1).toBeDefined();
    expect(ACCESSORY_RECOMMENDATIONS.B1).toBeDefined();
    expect(ACCESSORY_RECOMMENDATIONS.A2).toBeDefined();
    expect(ACCESSORY_RECOMMENDATIONS.B2).toBeDefined();
  });

  it("all recommended accessory IDs reference valid exercises", () => {
    for (const [day, accessories] of Object.entries(
      ACCESSORY_RECOMMENDATIONS
    )) {
      for (const accId of accessories) {
        expect(
          EXERCISES[accId],
          `${accId} in ${day} should be a valid exercise`
        ).toBeDefined();
      }
    }
  });

  it("each day has 4 accessory recommendations", () => {
    for (const accessories of Object.values(ACCESSORY_RECOMMENDATIONS)) {
      expect(accessories).toHaveLength(4);
    }
  });

  it("A1 accessories are correct", () => {
    expect(ACCESSORY_RECOMMENDATIONS.A1).toEqual([
      "face_pulls",
      "lateral_raises",
      "leg_curls",
      "ab_rollout",
    ]);
  });

  it("B1 accessories are correct", () => {
    expect(ACCESSORY_RECOMMENDATIONS.B1).toEqual([
      "bicep_curls",
      "oh_tricep_ext",
      "hip_thrust",
      "calf_raises",
    ]);
  });

  it("A2 accessories are correct", () => {
    expect(ACCESSORY_RECOMMENDATIONS.A2).toEqual([
      "face_pulls",
      "incline_db_fly",
      "leg_extensions",
      "ab_rollout",
    ]);
  });

  it("B2 accessories are correct", () => {
    expect(ACCESSORY_RECOMMENDATIONS.B2).toEqual([
      "bicep_curls",
      "lateral_raises",
      "back_extensions",
      "calf_raises",
    ]);
  });
});
