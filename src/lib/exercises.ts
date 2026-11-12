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
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["adductors", "lower_back"],
    stabilizerMuscles: ["abs", "hamstrings", "calves"],
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
    secondaryMuscles: ["front_delts", "triceps"],
    stabilizerMuscles: ["rotator_cuff"],
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
    primaryMuscles: ["hamstrings", "glutes", "lower_back"],
    secondaryMuscles: ["quads", "upper_traps", "mid_back", "lats", "forearms"],
    stabilizerMuscles: ["abs", "obliques"],
    painSensitiveRegions: ["lower_back"],
  },

  ohp: {
    id: "ohp",
    name: "Barbell OHP",
    type: "barbell",
    muscleGroup: "push",
    requiresGym: true,
    dumbbellAlternative: "db_shoulder_press",
    primaryMuscles: ["front_delts"],
    secondaryMuscles: ["side_delts", "triceps", "upper_traps"],
    stabilizerMuscles: ["abs", "obliques", "lower_back"],
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
    primaryMuscles: ["lats"],
    secondaryMuscles: ["biceps", "mid_back", "rear_delts"],
    stabilizerMuscles: ["forearms"],
    painSensitiveRegions: [],
  },

  db_row: {
    id: "db_row",
    name: "Dumbbell Row",
    type: "dumbbell",
    muscleGroup: "pull",
    requiresGym: false,
    barbellEquivalent: "lat_pulldown",
    grip: "per_hand",
    primaryMuscles: ["lats", "mid_back"],
    secondaryMuscles: ["rear_delts", "biceps"],
    stabilizerMuscles: ["forearms", "lower_back"],
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
    grip: "both_hands",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["adductors"],
    stabilizerMuscles: ["abs", "lower_back"],
    painSensitiveRegions: ["lower_back", "left_knee", "right_knee"],
  },

  bulgarian_split_squat: {
    id: "bulgarian_split_squat",
    name: "Bulgarian Split Squat",
    type: "dumbbell",
    muscleGroup: "legs",
    requiresGym: false,
    grip: "per_hand",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["adductors", "hamstrings"],
    stabilizerMuscles: ["abs", "obliques", "calves"],
    painSensitiveRegions: ["left_knee", "right_knee"],
  },

  db_bench: {
    id: "db_bench",
    name: "DB Bench Press",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    barbellEquivalent: "bench",
    grip: "per_hand",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts", "triceps"],
    stabilizerMuscles: ["rotator_cuff"],
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
    grip: "per_hand",
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["lower_back"],
    stabilizerMuscles: ["forearms", "upper_traps", "lats", "abs"],
    painSensitiveRegions: ["lower_back"],
  },

  db_shoulder_press: {
    id: "db_shoulder_press",
    name: "DB Shoulder Press",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    barbellEquivalent: "ohp",
    grip: "per_hand",
    primaryMuscles: ["front_delts"],
    secondaryMuscles: ["side_delts", "triceps", "upper_traps"],
    stabilizerMuscles: ["abs", "rotator_cuff"],
    painSensitiveRegions: ["left_shoulder", "right_shoulder", "lower_back"],
  },

  db_lunge: {
    id: "db_lunge",
    name: "DB Lunge",
    type: "dumbbell",
    muscleGroup: "legs",
    requiresGym: false,
    barbellEquivalent: "squat",
    grip: "per_hand",
    primaryMuscles: ["quads", "glutes"],
    secondaryMuscles: ["hamstrings", "adductors"],
    stabilizerMuscles: ["abs", "calves", "forearms"],
    painSensitiveRegions: ["left_knee", "right_knee"],
  },

  db_floor_press: {
    id: "db_floor_press",
    name: "DB Floor Press",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    barbellEquivalent: "bench",
    grip: "per_hand",
    primaryMuscles: ["chest", "triceps"],
    secondaryMuscles: ["front_delts"],
    stabilizerMuscles: ["rotator_cuff"],
    painSensitiveRegions: ["left_shoulder", "right_shoulder"],
  },

  single_leg_db_rdl: {
    id: "single_leg_db_rdl",
    name: "Single-Leg DB RDL",
    type: "dumbbell",
    muscleGroup: "pull",
    requiresGym: false,
    barbellEquivalent: "deadlift",
    grip: "per_hand",
    primaryMuscles: ["hamstrings", "glutes"],
    secondaryMuscles: ["lower_back"],
    stabilizerMuscles: ["obliques", "abs", "calves", "forearms"],
    painSensitiveRegions: ["lower_back"],
  },

  db_arnold_press: {
    id: "db_arnold_press",
    name: "DB Arnold Press",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    barbellEquivalent: "ohp",
    grip: "per_hand",
    primaryMuscles: ["front_delts"],
    secondaryMuscles: ["side_delts", "triceps", "upper_traps"],
    stabilizerMuscles: ["abs", "rotator_cuff"],
    painSensitiveRegions: ["left_shoulder", "right_shoulder"],
  },

  // ─── Accessories ──────────────────────────────────────────────────────────────

  face_pulls: {
    id: "face_pulls",
    name: "Face Pulls",
    type: "cable",
    muscleGroup: "pull",
    requiresGym: true,
    primaryMuscles: ["rear_delts"],
    secondaryMuscles: ["mid_back", "rotator_cuff", "upper_traps"],
    stabilizerMuscles: ["biceps"],
    painSensitiveRegions: [],
  },

  lateral_raises: {
    id: "lateral_raises",
    name: "Standing Lateral Raises",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    grip: "per_hand",
    primaryMuscles: ["side_delts"],
    secondaryMuscles: ["upper_traps"],
    stabilizerMuscles: ["forearms"],
    painSensitiveRegions: [],
  },

  bicep_curls: {
    id: "bicep_curls",
    name: "Bicep Curls",
    type: "dumbbell",
    muscleGroup: "pull",
    requiresGym: false,
    grip: "per_hand",
    primaryMuscles: ["biceps"],
    secondaryMuscles: ["forearms"],
    stabilizerMuscles: ["front_delts"],
    painSensitiveRegions: [],
  },

  tricep_pushdowns: {
    id: "tricep_pushdowns",
    name: "Tricep Pushdowns",
    type: "cable",
    muscleGroup: "push",
    requiresGym: true,
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    stabilizerMuscles: ["abs", "lats", "forearms"],
    painSensitiveRegions: [],
  },

  oh_tricep_ext: {
    id: "oh_tricep_ext",
    name: "OH Tricep Extension",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    grip: "both_hands",
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    stabilizerMuscles: ["abs", "front_delts"],
    painSensitiveRegions: [],
  },

  incline_db_fly: {
    id: "incline_db_fly",
    name: "Incline DB Fly",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    grip: "per_hand",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts"],
    stabilizerMuscles: ["biceps", "rotator_cuff"],
    painSensitiveRegions: [],
  },

  leg_curls: {
    id: "leg_curls",
    name: "Leg Curls",
    type: "cable",
    muscleGroup: "legs",
    requiresGym: true,
    primaryMuscles: ["hamstrings"],
    secondaryMuscles: ["calves"],
    stabilizerMuscles: [],
    painSensitiveRegions: [],
  },

  leg_extensions: {
    id: "leg_extensions",
    name: "Leg Extensions",
    type: "cable",
    muscleGroup: "legs",
    requiresGym: true,
    primaryMuscles: ["quads"],
    secondaryMuscles: [],
    stabilizerMuscles: [],
    painSensitiveRegions: [],
  },

  calf_raises: {
    id: "calf_raises",
    name: "Calf Raises",
    type: "dumbbell",
    muscleGroup: "legs",
    requiresGym: false,
    grip: "per_hand",
    primaryMuscles: ["calves"],
    secondaryMuscles: [],
    stabilizerMuscles: [],
    painSensitiveRegions: [],
  },

  ab_rollout: {
    id: "ab_rollout",
    name: "Ab Rollout",
    type: "bodyweight",
    muscleGroup: "core",
    requiresGym: false,
    primaryMuscles: ["abs"],
    secondaryMuscles: ["obliques", "lats"],
    stabilizerMuscles: ["triceps"],
    painSensitiveRegions: [],
  },

  back_extensions: {
    id: "back_extensions",
    name: "Back Extensions",
    type: "bodyweight",
    muscleGroup: "core",
    requiresGym: true,
    primaryMuscles: ["lower_back"],
    secondaryMuscles: ["glutes", "hamstrings"],
    stabilizerMuscles: [],
    painSensitiveRegions: [],
  },

  hip_thrust: {
    id: "hip_thrust",
    name: "Hip Thrust",
    type: "dumbbell",
    muscleGroup: "legs",
    requiresGym: false,
    grip: "both_hands",
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings"],
    stabilizerMuscles: ["quads", "abs", "adductors"],
    painSensitiveRegions: [],
  },

  pendulum_squat: {
    id: "pendulum_squat",
    name: "Pendulum Squat",
    type: "machine",
    muscleGroup: "legs",
    requiresGym: true,
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes", "adductors"],
    stabilizerMuscles: ["calves"],
    painSensitiveRegions: ["left_knee", "right_knee"],
  },

  glute_drive: {
    id: "glute_drive",
    name: "Glute Drive",
    type: "machine",
    muscleGroup: "legs",
    requiresGym: true,
    primaryMuscles: ["glutes"],
    secondaryMuscles: ["hamstrings"],
    stabilizerMuscles: ["quads", "adductors"],
    painSensitiveRegions: ["lower_back"],
  },

  db_pullover: {
    id: "db_pullover",
    name: "DB Pullover",
    type: "dumbbell",
    muscleGroup: "pull",
    requiresGym: false,
    grip: "both_hands",
    primaryMuscles: ["lats"],
    secondaryMuscles: ["chest"],
    stabilizerMuscles: ["triceps", "abs"],
    painSensitiveRegions: ["left_shoulder", "right_shoulder"],
  },

  seated_db_shoulder_press: {
    id: "seated_db_shoulder_press",
    name: "Seated DB Shoulder Press",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    grip: "per_hand",
    primaryMuscles: ["front_delts"],
    secondaryMuscles: ["side_delts", "triceps", "upper_traps"],
    stabilizerMuscles: ["rotator_cuff"],
    painSensitiveRegions: ["left_shoulder", "right_shoulder"],
  },

  seated_lateral_raises: {
    id: "seated_lateral_raises",
    name: "Seated Lateral Raises",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    grip: "per_hand",
    primaryMuscles: ["side_delts"],
    secondaryMuscles: ["upper_traps"],
    stabilizerMuscles: ["forearms"],
    painSensitiveRegions: ["left_shoulder", "right_shoulder"],
  },

  incline_db_press: {
    id: "incline_db_press",
    name: "Incline DB Press",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    grip: "per_hand",
    primaryMuscles: ["chest"],
    secondaryMuscles: ["front_delts", "triceps"],
    stabilizerMuscles: ["rotator_cuff"],
    painSensitiveRegions: ["left_shoulder", "right_shoulder", "left_elbow", "right_elbow"],
  },

  hammer_curls: {
    id: "hammer_curls",
    name: "Hammer Curls",
    type: "dumbbell",
    muscleGroup: "pull",
    requiresGym: false,
    grip: "per_hand",
    primaryMuscles: ["biceps", "forearms"],
    secondaryMuscles: [],
    stabilizerMuscles: ["front_delts"],
    painSensitiveRegions: [],
  },

  front_raises: {
    id: "front_raises",
    name: "Front Raises",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    grip: "per_hand",
    primaryMuscles: ["front_delts"],
    secondaryMuscles: ["side_delts"],
    stabilizerMuscles: ["upper_traps", "abs"],
    painSensitiveRegions: ["left_shoulder", "right_shoulder"],
  },

  reverse_fly: {
    id: "reverse_fly",
    name: "Reverse Fly",
    type: "dumbbell",
    muscleGroup: "pull",
    requiresGym: false,
    grip: "per_hand",
    primaryMuscles: ["rear_delts"],
    secondaryMuscles: ["mid_back"],
    stabilizerMuscles: ["rotator_cuff", "lower_back"],
    painSensitiveRegions: [],
  },

  arnold_press: {
    id: "arnold_press",
    name: "Arnold Press",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    grip: "per_hand",
    primaryMuscles: ["front_delts"],
    secondaryMuscles: ["side_delts", "triceps", "upper_traps"],
    stabilizerMuscles: ["abs", "rotator_cuff"],
    painSensitiveRegions: ["left_shoulder", "right_shoulder"],
  },

  db_skull_crushers: {
    id: "db_skull_crushers",
    name: "DB Skull Crushers",
    type: "dumbbell",
    muscleGroup: "push",
    requiresGym: false,
    grip: "per_hand",
    primaryMuscles: ["triceps"],
    secondaryMuscles: [],
    stabilizerMuscles: ["forearms"],
    painSensitiveRegions: ["left_elbow", "right_elbow"],
  },
};

/** Single source of truth for which exercises are accessories. */
export const ACCESSORY_IDS: string[] = [
  "face_pulls", "lateral_raises", "bicep_curls", "tricep_pushdowns",
  "oh_tricep_ext", "incline_db_fly", "leg_curls", "leg_extensions",
  "calf_raises", "ab_rollout", "back_extensions", "hip_thrust",
  "hammer_curls", "front_raises", "reverse_fly", "arnold_press", "db_skull_crushers",
  "pendulum_squat", "glute_drive", "db_pullover",
  "seated_db_shoulder_press", "seated_lateral_raises", "incline_db_press",
];

/**
 * Reasonable starting default weights (lbs) for accessories.
 * Bodyweight exercises default to 0. Dumbbell "per_hand" values are per hand.
 */
export const DEFAULT_ACCESSORY_WEIGHTS: Record<string, number> = {
  face_pulls: 30,
  lateral_raises: 15,
  bicep_curls: 25,
  tricep_pushdowns: 40,
  oh_tricep_ext: 30,
  incline_db_fly: 25,
  leg_curls: 70,
  leg_extensions: 80,
  calf_raises: 40,
  ab_rollout: 0,
  back_extensions: 0,
  hip_thrust: 50,
  hammer_curls: 25,
  front_raises: 15,
  reverse_fly: 12,
  arnold_press: 25,
  db_skull_crushers: 15,
  // Plate-loaded machines: weight added to the machine, not counting its arm.
  pendulum_squat: 90,
  glute_drive: 90,
  db_pullover: 30,
  seated_db_shoulder_press: 30,
  seated_lateral_raises: 12,
  incline_db_press: 35,
};

/**
 * Ordered fallback chains for home dumbbell substitutes.
 * When the primary substitute (index 0) exceeds maxDumbbellWeight,
 * the system tries each fallback in order.
 */
export const HOME_SUBSTITUTE_CHAINS: Record<string, string[]> = {
  squat: ["goblet_squat", "bulgarian_split_squat", "db_lunge"],
  bench: ["db_bench", "db_floor_press"],
  deadlift: ["db_rdl", "single_leg_db_rdl"],
  ohp: ["db_shoulder_press", "db_arnold_press"],
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
