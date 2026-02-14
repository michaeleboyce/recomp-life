import type { Exercise } from "@/types";

export const EXERCISES: Record<string, Exercise> = {
  // ─── Main Compound Lifts (T1/T2) ─────────────────────────────────────────────

  squat: {
    id: "squat",
    name: "Barbell Squat",
    type: "barbell",
    muscleGroup: "legs",
    requiresGym: true,
    dumbbellAlternative: "goblet_squat",
    primaryMuscles: ["left_quad", "right_quad"],
    secondaryMuscles: ["left_hamstring", "right_hamstring", "core"],
    painSensitiveRegions: ["lower_back", "left_knee", "right_knee"],
  },

  bench: {
    id: "bench",
    name: "Barbell Bench Press",
    type: "barbell",
    muscleGroup: "push",
    requiresGym: true,
    dumbbellAlternative: "db_bench",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["left_shoulder", "right_shoulder"],
    painSensitiveRegions: [
      "left_shoulder",
      "right_shoulder",
      "left_elbow",
      "right_elbow",
    ],
  },

  deadlift: {
    id: "deadlift",
    name: "Barbell Deadlift",
    type: "barbell",
    muscleGroup: "pull",
    requiresGym: true,
    dumbbellAlternative: "db_rdl",
    primaryMuscles: ["left_hamstring", "right_hamstring", "upper_back"],
    secondaryMuscles: ["left_quad", "right_quad", "core"],
    painSensitiveRegions: ["lower_back"],
  },

  ohp: {
    id: "ohp",
    name: "Barbell OHP",
    type: "barbell",
    muscleGroup: "push",
    requiresGym: true,
    dumbbellAlternative: "db_shoulder_press",
    primaryMuscles: ["left_shoulder", "right_shoulder"],
    secondaryMuscles: ["chest", "core"],
    painSensitiveRegions: ["left_shoulder", "right_shoulder", "lower_back"],
  },

  // ─── T3 Exercises ─────────────────────────────────────────────────────────────

  lat_pulldown: {
    id: "lat_pulldown",
    name: "Lat Pulldown",
    type: "cable",
    muscleGroup: "pull",
    requiresGym: true,
    dumbbellAlternative: "db_row",
    primaryMuscles: ["upper_back"],
    secondaryMuscles: ["left_shoulder", "right_shoulder"],
    painSensitiveRegions: [],
  },

  db_row: {
    id: "db_row",
    name: "Dumbbell Row",
    type: "dumbbell",
    muscleGroup: "pull",
    requiresGym: false,
    barbellEquivalent: "lat_pulldown",
    primaryMuscles: ["upper_back"],
    secondaryMuscles: ["left_shoulder", "right_shoulder"],
    painSensitiveRegions: [],
  },

  // ─── Home Substitutions ───────────────────────────────────────────────────────

  goblet_squat: {
    id: "goblet_squat",
    name: "Goblet Squat",
    type: "dumbbell",
    muscleGroup: "legs",
    requiresGym: false,
    barbellEquivalent: "squat",
    primaryMuscles: ["left_quad", "right_quad"],
    secondaryMuscles: ["left_hamstring", "right_hamstring", "core"],
    painSensitiveRegions: ["lower_back", "left_knee", "right_knee"],
  },

  bulgarian_split_squat: {
    id: "bulgarian_split_squat",
    name: "Bulgarian Split Squat",
    type: "dumbbell",
    muscleGroup: "legs",
    requiresGym: false,
    primaryMuscles: ["left_quad", "right_quad"],
    secondaryMuscles: ["left_hamstring", "right_hamstring", "core"],
    painSensitiveRegions: ["left_knee", "right_knee"],
  },

  db_bench: {
    id: "db_bench",
    name: "DB Bench Press",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    barbellEquivalent: "bench",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["left_shoulder", "right_shoulder"],
    painSensitiveRegions: [
      "left_shoulder",
      "right_shoulder",
      "left_elbow",
      "right_elbow",
    ],
  },

  db_rdl: {
    id: "db_rdl",
    name: "DB Romanian Deadlift",
    type: "dumbbell",
    muscleGroup: "pull",
    requiresGym: false,
    barbellEquivalent: "deadlift",
    primaryMuscles: ["left_hamstring", "right_hamstring"],
    secondaryMuscles: ["upper_back", "core"],
    painSensitiveRegions: ["lower_back"],
  },

  db_shoulder_press: {
    id: "db_shoulder_press",
    name: "DB Shoulder Press",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    barbellEquivalent: "ohp",
    primaryMuscles: ["left_shoulder", "right_shoulder"],
    secondaryMuscles: ["chest", "core"],
    painSensitiveRegions: ["left_shoulder", "right_shoulder", "lower_back"],
  },

  // ─── Accessories ──────────────────────────────────────────────────────────────

  face_pulls: {
    id: "face_pulls",
    name: "Face Pulls",
    type: "cable",
    muscleGroup: "pull",
    requiresGym: true,
    primaryMuscles: ["left_shoulder", "right_shoulder"],
    secondaryMuscles: ["upper_back"],
    painSensitiveRegions: [],
  },

  lateral_raises: {
    id: "lateral_raises",
    name: "Lateral Raises",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    primaryMuscles: ["left_shoulder", "right_shoulder"],
    secondaryMuscles: [],
    painSensitiveRegions: [],
  },

  bicep_curls: {
    id: "bicep_curls",
    name: "Bicep Curls",
    type: "dumbbell",
    muscleGroup: "pull",
    requiresGym: false,
    primaryMuscles: ["left_elbow", "right_elbow"],
    secondaryMuscles: [],
    painSensitiveRegions: [],
  },

  tricep_pushdowns: {
    id: "tricep_pushdowns",
    name: "Tricep Pushdowns",
    type: "cable",
    muscleGroup: "push",
    requiresGym: true,
    primaryMuscles: ["left_elbow", "right_elbow"],
    secondaryMuscles: [],
    painSensitiveRegions: [],
  },

  oh_tricep_ext: {
    id: "oh_tricep_ext",
    name: "OH Tricep Extension",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    primaryMuscles: ["left_elbow", "right_elbow"],
    secondaryMuscles: [],
    painSensitiveRegions: [],
  },

  incline_db_fly: {
    id: "incline_db_fly",
    name: "Incline DB Fly",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    primaryMuscles: ["chest"],
    secondaryMuscles: ["left_shoulder", "right_shoulder"],
    painSensitiveRegions: [],
  },

  leg_curls: {
    id: "leg_curls",
    name: "Leg Curls",
    type: "cable",
    muscleGroup: "legs",
    requiresGym: true,
    primaryMuscles: ["left_hamstring", "right_hamstring"],
    secondaryMuscles: [],
    painSensitiveRegions: [],
  },

  leg_extensions: {
    id: "leg_extensions",
    name: "Leg Extensions",
    type: "cable",
    muscleGroup: "legs",
    requiresGym: true,
    primaryMuscles: ["left_quad", "right_quad"],
    secondaryMuscles: [],
    painSensitiveRegions: [],
  },

  calf_raises: {
    id: "calf_raises",
    name: "Calf Raises",
    type: "dumbbell",
    muscleGroup: "legs",
    requiresGym: false,
    primaryMuscles: ["left_knee", "right_knee"],
    secondaryMuscles: [],
    painSensitiveRegions: [],
  },

  ab_rollout: {
    id: "ab_rollout",
    name: "Ab Rollout",
    type: "bodyweight",
    muscleGroup: "core",
    requiresGym: false,
    primaryMuscles: ["core"],
    secondaryMuscles: [],
    painSensitiveRegions: [],
  },

  back_extensions: {
    id: "back_extensions",
    name: "Back Extensions",
    type: "bodyweight",
    muscleGroup: "core",
    requiresGym: true,
    primaryMuscles: ["lower_back"],
    secondaryMuscles: ["left_hamstring", "right_hamstring"],
    painSensitiveRegions: [],
  },

  hip_thrust: {
    id: "hip_thrust",
    name: "Hip Thrust",
    type: "dumbbell",
    muscleGroup: "legs",
    requiresGym: false,
    primaryMuscles: ["left_hip", "right_hip"],
    secondaryMuscles: ["left_hamstring", "right_hamstring"],
    painSensitiveRegions: [],
  },
};

/**
 * Get an exercise by its ID. Throws if the exercise does not exist.
 */
export function getExercise(id: string): Exercise {
  const exercise = EXERCISES[id];
  if (!exercise) {
    throw new Error(`Exercise not found: ${id}`);
  }
  return exercise;
}
