import type { Exercise, MuscleGroup } from "@/types";
import { EXERCISES, ACCESSORY_IDS } from "./exercises";

export interface ExerciseGroup {
  label: string;
  description: string;
  exercises: Exercise[];
}

const MAIN_LIFT_IDS = ["squat", "bench", "deadlift", "ohp"];
const T3_IDS = ["lat_pulldown", "db_row"];
const HOME_SUB_IDS = [
  "goblet_squat",
  "db_bench",
  "db_rdl",
  "db_shoulder_press",
  "bulgarian_split_squat",
];

const GROUP_DEFS: { ids: string[]; label: string; description: string }[] = [
  {
    ids: MAIN_LIFT_IDS,
    label: "Main Lifts",
    description: "T1/T2 compound barbell movements",
  },
  {
    ids: T3_IDS,
    label: "T3 Lifts",
    description: "Tier 3 pulling movements",
  },
  {
    ids: HOME_SUB_IDS,
    label: "Home Substitutions",
    description: "Dumbbell alternatives for home workouts",
  },
  {
    ids: ACCESSORY_IDS,
    label: "Accessories",
    description: "Optional isolation and assistance work",
  },
];

/**
 * Returns exercises grouped into categories, optionally filtered by muscle group.
 */
export function getGroupedExercises(
  filter?: MuscleGroup
): ExerciseGroup[] {
  return GROUP_DEFS.map(({ ids, label, description }) => {
    let exercises = ids.map((id) => EXERCISES[id]).filter(Boolean);
    if (filter) {
      exercises = exercises.filter((ex) => ex.muscleGroup === filter);
    }
    return { label, description, exercises };
  }).filter((group) => group.exercises.length > 0);
}

/**
 * Returns true if the exercise supports preference editing (accessories only).
 */
export function isPreferenceEditable(id: string): boolean {
  return ACCESSORY_IDS.includes(id);
}
