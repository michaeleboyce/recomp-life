/**
 * The reviewed table from exercise names other apps use to the app's library.
 * Pure data plus a lookup. Names are matched by `nameKey`, so each entry covers
 * its case, punctuation, word-order and plural variants ("Bench Press (Dumbbell)"
 * is "Dumbbell Bench Press").
 *
 * Rules the table follows (checked in table.test.ts):
 * - A name maps to a program lift, or to one of its home substitutes, only when it is
 *   that exact lift, and then with high confidence. "Dumbbell Bench Press" is the
 *   dumbbell bench press, never the barbell bench press; "Pause Squat", "Front Squat",
 *   "Romanian Deadlift" and "Close-Grip Bench Press" are not program lifts and are left
 *   to the muscle guess.
 * - Medium confidence is for accessories only: the same movement and equipment with a
 *   small change of stance, seat, bench angle or grip.
 * - Every library exercise's own display name maps to itself, except the few in
 *   `AMBIGUOUS_OWN_NAMES`, which other apps also use for a version with other equipment.
 */
import { EXERCISES, HOME_SUBSTITUTE_CHAINS } from "@/lib/exercises";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { nameKey } from "./normalise";

export interface TableEntry {
  exerciseId: string;
  confidence: "high" | "medium";
  names: readonly string[];
}

export const NAME_TABLE: readonly TableEntry[] = [
  // ─── Program lifts: only the lift itself ─────────────────────────────────────
  { exerciseId: "squat", confidence: "high", names: ["Back Squat", "Barbell Back Squat", "Barbell Squat"] },
  {
    exerciseId: "bench",
    confidence: "high",
    names: ["Barbell Bench Press", "Bench Press", "Flat Barbell Bench Press", "Flat Bench Press"],
  },
  { exerciseId: "deadlift", confidence: "high", names: ["Deadlift", "Barbell Deadlift", "Conventional Deadlift"] },
  {
    exerciseId: "ohp",
    confidence: "high",
    names: [
      "Overhead Press",
      "Barbell Overhead Press",
      "Barbell Shoulder Press",
      "Standing Barbell Shoulder Press",
      "Standing Overhead Press",
      "Military Press",
    ],
  },
  {
    exerciseId: "lat_pulldown",
    confidence: "high",
    names: ["Lat Pulldown", "Cable Lat Pulldown", "Wide Grip Lat Pulldown"],
  },
  {
    exerciseId: "db_row",
    confidence: "high",
    names: ["Dumbbell Row", "One Arm Dumbbell Row", "Single Arm Dumbbell Row"],
  },

  // ─── Home substitutes: only the substitute itself ────────────────────────────
  { exerciseId: "goblet_squat", confidence: "high", names: ["Goblet Squat", "Dumbbell Goblet Squat"] },
  { exerciseId: "bulgarian_split_squat", confidence: "high", names: ["Dumbbell Bulgarian Split Squat"] },
  { exerciseId: "db_bench", confidence: "high", names: ["Dumbbell Bench Press", "Flat Dumbbell Bench Press"] },
  { exerciseId: "db_rdl", confidence: "high", names: ["Dumbbell Romanian Deadlift"] },
  {
    exerciseId: "db_shoulder_press",
    confidence: "high",
    names: ["Dumbbell Shoulder Press", "Standing Dumbbell Shoulder Press", "Dumbbell Overhead Press"],
  },
  { exerciseId: "db_lunge", confidence: "high", names: ["Dumbbell Lunge", "Dumbbell Reverse Lunge"] },
  { exerciseId: "db_floor_press", confidence: "high", names: ["Dumbbell Floor Press"] },
  {
    exerciseId: "single_leg_db_rdl",
    confidence: "high",
    names: ["Single Leg Dumbbell Romanian Deadlift"],
  },
  // The library's own name for this one is "DB Arnold Press".
  { exerciseId: "db_arnold_press", confidence: "high", names: ["Dumbbell Arnold Press"] },

  // ─── Accessories ─────────────────────────────────────────────────────────────
  { exerciseId: "arnold_press", confidence: "high", names: ["Arnold Press", "Standing Arnold Press"] },
  {
    exerciseId: "seated_db_shoulder_press",
    confidence: "high",
    names: ["Seated Dumbbell Shoulder Press", "Seated Dumbbell Press"],
  },
  { exerciseId: "face_pulls", confidence: "high", names: ["Face Pull", "Cable Face Pull", "Rope Face Pull"] },
  {
    exerciseId: "lateral_raises",
    confidence: "high",
    names: [
      "Lateral Raise",
      "Dumbbell Lateral Raise",
      "Side Lateral Raise",
      "Dumbbell Side Lateral Raise",
      "Standing Dumbbell Lateral Raise",
    ],
  },
  { exerciseId: "seated_lateral_raises", confidence: "high", names: ["Seated Dumbbell Lateral Raise"] },
  {
    exerciseId: "bicep_curls",
    confidence: "high",
    names: ["Bicep Curl", "Dumbbell Bicep Curl", "Dumbbell Curl", "Standing Dumbbell Curl"],
  },
  {
    exerciseId: "bicep_curls",
    confidence: "medium",
    names: [
      "Seated Dumbbell Curl",
      "Seated Dumbbell Bicep Curl",
      "Incline Dumbbell Curl",
      "Alternating Dumbbell Curl",
      "Concentration Curl",
    ],
  },
  {
    exerciseId: "hammer_curls",
    confidence: "high",
    names: ["Hammer Curl", "Dumbbell Hammer Curl", "Standing Hammer Curl"],
  },
  {
    exerciseId: "hammer_curls",
    confidence: "medium",
    names: ["Incline Hammer Curl", "Seated Hammer Curl", "Cross Body Hammer Curl"],
  },
  {
    exerciseId: "tricep_pushdowns",
    confidence: "high",
    names: ["Tricep Pushdown", "Cable Tricep Pushdown", "Cable Straight Bar Tricep Pushdown"],
  },
  {
    exerciseId: "tricep_pushdowns",
    confidence: "medium",
    names: ["Rope Tricep Pushdown", "Cable Rope Tricep Extension"],
  },
  {
    exerciseId: "oh_tricep_ext",
    confidence: "high",
    names: [
      "Overhead Tricep Extension",
      "Dumbbell Tricep Extension",
      "Overhead Dumbbell Tricep Extension",
      "Standing Dumbbell Tricep Extension",
    ],
  },
  { exerciseId: "incline_db_fly", confidence: "high", names: ["Incline Dumbbell Fly"] },
  { exerciseId: "db_fly", confidence: "high", names: ["Dumbbell Fly", "Flat Dumbbell Fly", "Dumbbell Chest Fly"] },
  {
    exerciseId: "leg_curls",
    confidence: "high",
    names: ["Leg Curl", "Lying Leg Curl", "Lying Machine Leg Curl", "Lying Hamstring Curl"],
  },
  {
    exerciseId: "leg_curls",
    confidence: "medium",
    names: ["Seated Leg Curl", "Seated Machine Leg Curl", "Machine Leg Curl"],
  },
  { exerciseId: "leg_extensions", confidence: "high", names: ["Leg Extension", "Machine Leg Extension"] },
  { exerciseId: "calf_raises", confidence: "high", names: ["Dumbbell Calf Raise", "Standing Dumbbell Calf Raise"] },
  { exerciseId: "ab_rollout", confidence: "high", names: ["Ab Wheel Rollout", "Ab Wheel"] },
  { exerciseId: "back_extensions", confidence: "high", names: ["Back Extension", "Hyperextension"] },
  { exerciseId: "hip_thrust", confidence: "high", names: ["Hip Thrust", "Dumbbell Hip Thrust"] },
  { exerciseId: "hip_thrust", confidence: "medium", names: ["Barbell Hip Thrust"] },
  { exerciseId: "glute_drive", confidence: "high", names: ["Glute Drive", "Glute Drive Machine"] },
  { exerciseId: "glute_drive", confidence: "medium", names: ["Plate-Loaded Hip Thrust", "Machine Hip Thrust"] },
  { exerciseId: "db_pullover", confidence: "high", names: ["Dumbbell Pullover"] },
  {
    exerciseId: "incline_db_press",
    confidence: "high",
    names: ["Incline Dumbbell Press", "Incline Dumbbell Bench Press"],
  },
  { exerciseId: "front_raises", confidence: "high", names: ["Front Raise", "Dumbbell Front Raise"] },
  { exerciseId: "front_raises", confidence: "medium", names: ["Dumbbell Underhand Front Raise"] },
  {
    exerciseId: "reverse_fly",
    confidence: "high",
    names: [
      "Dumbbell Reverse Fly",
      "Bent Over Reverse Fly",
      "Dumbbell Bent Over Reverse Fly",
      "Rear Delt Fly",
      "Dumbbell Rear Delt Fly",
      "Dumbbell Rear Delt Raise",
    ],
  },
  {
    exerciseId: "reverse_fly",
    confidence: "medium",
    names: ["Dumbbell Back Fly", "Seated Dumbbell Rear Delt Raise", "Seated Rear Delt Fly"],
  },
  { exerciseId: "db_skull_crushers", confidence: "high", names: ["Dumbbell Skullcrusher"] },

  // ─── Added to the library for imported history ───────────────────────────────
  { exerciseId: "db_bent_over_row", confidence: "high", names: ["Dumbbell Bent Over Row"] },
  {
    exerciseId: "incline_db_row",
    confidence: "high",
    names: ["Incline Dumbbell Row", "Chest Supported Dumbbell Row"],
  },
  { exerciseId: "cable_row", confidence: "high", names: ["Cable Row", "Seated Row (Cable)"] },
  { exerciseId: "db_squat", confidence: "high", names: ["Dumbbell Squat"] },
  { exerciseId: "leg_press", confidence: "high", names: ["Leg Press", "Machine Leg Press", "Sled Leg Press"] },
  { exerciseId: "lunge", confidence: "high", names: ["Lunge", "Reverse Lunge", "Bodyweight Reverse Lunge"] },
  {
    exerciseId: "barbell_curl",
    confidence: "high",
    names: ["Barbell Curl", "Barbell Bicep Curl", "Standing Barbell Curl"],
  },
  { exerciseId: "barbell_curl", confidence: "medium", names: ["EZ Bar Curl"] },
  { exerciseId: "push_up", confidence: "high", names: ["Push Up"] },
  { exerciseId: "bench_dip", confidence: "high", names: ["Bench Dip", "Tricep Bench Dip"] },
  { exerciseId: "sit_up", confidence: "high", names: ["Sit Up"] },
  { exerciseId: "crunch", confidence: "high", names: ["Crunch", "Abdominal Crunch"] },
];

/**
 * Program lifts and their home substitutes: the four main lifts, the T3 lifts, each
 * main lift's dumbbell alternative and every exercise in a home substitute chain.
 */
export const PROGRAM_LIFT_IDS: ReadonlySet<string> = new Set([
  ...Object.values(WORKOUT_TEMPLATES).flatMap((t) => t.exercises.map((e) => e.exerciseId)),
  ...Object.values(EXERCISES).flatMap((e) => (e.dumbbellAlternative ? [e.dumbbellAlternative] : [])),
  ...Object.values(HOME_SUBSTITUTE_CHAINS).flat(),
]);

/**
 * Library exercises whose own name, without an equipment word, also names other
 * versions in other apps' exports. Reading those as the dumbbell version would count a
 * barbell or machine load twice (a dumbbell in each hand), so the bare name is left to
 * the muscle guess and the import screen asks. "Dumbbell Bulgarian Split Squat" still maps.
 */
export const AMBIGUOUS_OWN_NAMES: ReadonlySet<string> = new Set([
  "bulgarian_split_squat", // bodyweight and barbell versions share the bare name
  "calf_raises", // usually a machine or bodyweight when no equipment is named
]);

export interface TableMatch {
  exerciseId: string;
  confidence: "high" | "medium";
}

/** Every key the table and the library's own names produce, in the order they are read. */
export function tableKeys(): { key: string; name: string; match: TableMatch }[] {
  const rows: { key: string; name: string; match: TableMatch }[] = [];
  for (const entry of NAME_TABLE) {
    for (const name of entry.names) {
      rows.push({ key: nameKey(name), name, match: { exerciseId: entry.exerciseId, confidence: entry.confidence } });
    }
  }
  for (const exercise of Object.values(EXERCISES)) {
    if (AMBIGUOUS_OWN_NAMES.has(exercise.id)) continue;
    rows.push({ key: nameKey(exercise.name), name: exercise.name, match: { exerciseId: exercise.id, confidence: "high" } });
  }
  return rows;
}

let index: Map<string, TableMatch> | null = null;

/** The table entry for a name, or null. The first entry for a key wins (the tests forbid conflicts). */
export function lookupName(name: string): TableMatch | null {
  if (!index) {
    index = new Map();
    for (const row of tableKeys()) if (!index.has(row.key)) index.set(row.key, row.match);
  }
  const key = nameKey(name);
  return key ? (index.get(key) ?? null) : null;
}
