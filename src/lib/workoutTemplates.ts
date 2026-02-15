import type { WorkoutTemplate, WorkoutTemplateExercise } from "@/types";

export const WORKOUT_TEMPLATES: Record<string, WorkoutTemplate> = {
  A1: {
    id: "A1",
    name: "Workout A1",
    exercises: [
      {
        exerciseId: "squat",
        tier: "T1",
        sets: 5,
        reps: 3,
        isAMRAP: true,
      },
      {
        exerciseId: "bench",
        tier: "T2",
        sets: 3,
        reps: 10,
        isAMRAP: false,
      },
      {
        exerciseId: "lat_pulldown",
        tier: "T3",
        sets: 3,
        reps: 15,
        isAMRAP: true,
      },
    ],
  },

  B1: {
    id: "B1",
    name: "Workout B1",
    exercises: [
      {
        exerciseId: "ohp",
        tier: "T1",
        sets: 5,
        reps: 3,
        isAMRAP: true,
      },
      {
        exerciseId: "deadlift",
        tier: "T2",
        sets: 3,
        reps: 10,
        isAMRAP: false,
      },
      {
        exerciseId: "db_row",
        tier: "T3",
        sets: 3,
        reps: 15,
        isAMRAP: true,
      },
    ],
  },

  A2: {
    id: "A2",
    name: "Workout A2",
    exercises: [
      {
        exerciseId: "bench",
        tier: "T1",
        sets: 5,
        reps: 3,
        isAMRAP: true,
      },
      {
        exerciseId: "squat",
        tier: "T2",
        sets: 3,
        reps: 10,
        isAMRAP: false,
      },
      {
        exerciseId: "lat_pulldown",
        tier: "T3",
        sets: 3,
        reps: 15,
        isAMRAP: true,
      },
    ],
  },

  B2: {
    id: "B2",
    name: "Workout B2",
    exercises: [
      {
        exerciseId: "deadlift",
        tier: "T1",
        sets: 5,
        reps: 3,
        isAMRAP: true,
      },
      {
        exerciseId: "ohp",
        tier: "T2",
        sets: 3,
        reps: 10,
        isAMRAP: false,
      },
      {
        exerciseId: "db_row",
        tier: "T3",
        sets: 3,
        reps: 15,
        isAMRAP: true,
      },
    ],
  },
};

export const WORKOUT_ROTATION = ["A1", "B1", "A2", "B2"] as const;

/**
 * Get the next workout ID in the A1 -> B1 -> A2 -> B2 -> A1 rotation.
 * Returns "A1" if the given ID is not found in the rotation.
 */
export function getNextWorkoutId(currentId: string): string {
  const idx = WORKOUT_ROTATION.indexOf(
    currentId as (typeof WORKOUT_ROTATION)[number]
  );
  if (idx === -1) {
    return "A1";
  }
  return WORKOUT_ROTATION[(idx + 1) % WORKOUT_ROTATION.length];
}

export const ACCESSORY_RECOMMENDATIONS: Record<string, string[]> = {
  A1: ["face_pulls", "lateral_raises", "leg_curls", "ab_rollout"],
  B1: ["bicep_curls", "oh_tricep_ext", "hip_thrust", "calf_raises"],
  A2: ["face_pulls", "incline_db_fly", "leg_extensions", "ab_rollout"],
  B2: ["bicep_curls", "lateral_raises", "back_extensions", "calf_raises"],
};

/** Home-friendly replacements for gym-only accessories */
export const HOME_ACCESSORY_ALTERNATIVES: Record<string, string> = {
  face_pulls: "lateral_raises",
  leg_curls: "hip_thrust",
  leg_extensions: "calf_raises",
  back_extensions: "ab_rollout",
};
