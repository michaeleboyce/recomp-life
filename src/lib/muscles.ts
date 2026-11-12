import type { MuscleId } from "@/types";

/**
 * Muscle metadata: labels, display groups, and which side of the body a muscle
 * is visible from. Pure data, no React.
 */

export const MUSCLE_IDS: readonly MuscleId[] = [
  "chest",
  "front_delts",
  "side_delts",
  "rear_delts",
  "rotator_cuff",
  "biceps",
  "triceps",
  "forearms",
  "upper_traps",
  "mid_back",
  "lats",
  "lower_back",
  "abs",
  "obliques",
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "calves",
];

export const MUSCLE_LABELS: Record<MuscleId, string> = {
  chest: "Chest",
  front_delts: "Front Delts",
  side_delts: "Side Delts",
  rear_delts: "Rear Delts",
  rotator_cuff: "Rotator Cuff",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Forearms",
  upper_traps: "Upper Traps",
  mid_back: "Mid Back",
  lats: "Lats",
  lower_back: "Lower Back",
  abs: "Abs",
  obliques: "Obliques",
  glutes: "Glutes",
  quads: "Quads",
  hamstrings: "Hamstrings",
  adductors: "Adductors",
  calves: "Calves",
};

/** One-line plain-language description shown in the muscle info sheet. */
export const MUSCLE_DESCRIPTIONS: Record<MuscleId, string> = {
  chest: "Pectorals. Push the arms forward and together.",
  front_delts: "Front of the shoulder. Raises the arm forward and presses overhead.",
  side_delts: "Side of the shoulder. Raises the arm out to the side.",
  rear_delts: "Back of the shoulder. Pulls the arm back and out.",
  rotator_cuff: "Small muscles that keep the shoulder joint centred.",
  biceps: "Front of the upper arm. Bends the elbow.",
  triceps: "Back of the upper arm. Straightens the elbow.",
  forearms: "Grip and wrist muscles.",
  upper_traps: "Top of the shoulders and neck. Shrugs and supports overhead work.",
  mid_back: "Rhomboids and middle/lower traps. Pull the shoulder blades together.",
  lats: "Widest back muscle. Pulls the arm down and back.",
  lower_back: "Spinal erectors. Keep the spine extended under load.",
  abs: "Front of the trunk. Resists arching and flexes the spine.",
  obliques: "Sides of the trunk. Resist twisting and side bending.",
  glutes: "Hip extensors. Drive the hips forward.",
  quads: "Front of the thigh. Straighten the knee.",
  hamstrings: "Back of the thigh. Extend the hip and bend the knee.",
  adductors: "Inner thigh. Pull the leg in and assist hip extension.",
  calves: "Back of the lower leg. Point the foot.",
};

export type DisplayGroup =
  | "Chest"
  | "Back"
  | "Shoulders"
  | "Biceps"
  | "Triceps"
  | "Forearms"
  | "Core"
  | "Lower Back"
  | "Glutes"
  | "Quads"
  | "Hamstrings"
  | "Adductors"
  | "Calves";

/** Every muscle belongs to exactly one display group. */
export const MUSCLE_GROUPS: Record<DisplayGroup, MuscleId[]> = {
  Chest: ["chest"],
  Back: ["lats", "mid_back", "upper_traps"],
  Shoulders: ["front_delts", "side_delts", "rear_delts", "rotator_cuff"],
  Biceps: ["biceps"],
  Triceps: ["triceps"],
  Forearms: ["forearms"],
  Core: ["abs", "obliques"],
  "Lower Back": ["lower_back"],
  Glutes: ["glutes"],
  Quads: ["quads"],
  Hamstrings: ["hamstrings"],
  Adductors: ["adductors"],
  Calves: ["calves"],
};

/** Display order, upper body first. */
export const MUSCLE_GROUP_ORDER: readonly DisplayGroup[] = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Core",
  "Lower Back",
  "Glutes",
  "Quads",
  "Hamstrings",
  "Adductors",
  "Calves",
];

const GROUP_BY_MUSCLE: Record<string, DisplayGroup> = Object.fromEntries(
  (Object.entries(MUSCLE_GROUPS) as [DisplayGroup, MuscleId[]][]).flatMap(
    ([group, members]) => members.map((m) => [m, group])
  )
);

export function groupOf(muscle: MuscleId): DisplayGroup {
  return GROUP_BY_MUSCLE[muscle];
}

export type MuscleView = "front" | "back" | "both";

/** Which side of the body a muscle is best seen from. */
export const MUSCLE_VIEW: Record<MuscleId, MuscleView> = {
  chest: "front",
  front_delts: "front",
  side_delts: "both",
  rear_delts: "back",
  rotator_cuff: "back",
  biceps: "front",
  triceps: "back",
  forearms: "both",
  upper_traps: "back",
  mid_back: "back",
  lats: "back",
  lower_back: "back",
  abs: "front",
  obliques: "front",
  glutes: "back",
  quads: "front",
  hamstrings: "back",
  adductors: "front",
  calves: "back",
};

export function formatMuscle(muscle: MuscleId): string {
  return MUSCLE_LABELS[muscle];
}

const MUSCLE_ID_SET: ReadonlySet<string> = new Set(MUSCLE_IDS);

export function isMuscleId(value: string): value is MuscleId {
  return MUSCLE_ID_SET.has(value);
}
