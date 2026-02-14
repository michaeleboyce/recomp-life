import type {
  PainSorenessEntry,
  Exercise,
  WorkoutModification,
  BodyRegion,
} from "@/types";

/**
 * Extended modification with optional substitution suggestions for lower back pain.
 */
export interface ExtendedWorkoutModification extends WorkoutModification {
  substitutionSuggestions?: string[];
}

/**
 * Round a number to the nearest 5.
 */
export function roundToNearest5(value: number): number {
  return Math.round(value / 5) * 5;
}

/**
 * Convert a BodyRegion slug to a human-readable label.
 * e.g. "lower_back" -> "Lower Back", "left_shoulder" -> "Left Shoulder"
 */
export function formatRegion(region: BodyRegion): string {
  return region
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Lower back substitution suggestions per spec section 6.4.
 */
const LOWER_BACK_SUBSTITUTIONS: Record<string, string[]> = {
  squat: ["goblet_squat", "box_squat"],
  deadlift: ["db_rdl"],
  ohp: ["db_shoulder_press"],
};

/**
 * Generate workout modifications based on active pain entries and planned exercises.
 *
 * Rules (spec section 6.3):
 * - Only "pain" entries generate modifications; "soreness" entries generate ZERO.
 * - Severity 1: informational only, no modification.
 * - Severity 2: reduce weight by 10%.
 * - Severity 3: reduce weight by 20%. Lower back pain also suggests substitutions.
 * - Severity 4: skip T1 exercises, reduce others by 50%.
 * - Severity 5: skip all affected exercises, suggest rest day.
 */
export function generateModifications(
  painEntries: PainSorenessEntry[],
  exercises: Array<{ exercise: Exercise; weight: number; tier: string }>
): ExtendedWorkoutModification[] {
  const modifications: ExtendedWorkoutModification[] = [];

  // Only pain entries generate modifications -- soreness entries generate ZERO
  const activePain = painEntries.filter((e) => e.sensation === "pain");

  for (const entry of activePain) {
    for (const { exercise, weight, tier } of exercises) {
      // Check if this exercise is sensitive to this pain region
      if (!exercise.painSensitiveRegions.includes(entry.region)) continue;

      let action: "reduce_weight" | "substitute" | "skip";
      let modifiedWeight: number;
      let reason: string;

      switch (entry.severity) {
        case 1:
          // Informational only -- no modification
          continue;
        case 2:
          action = "reduce_weight";
          modifiedWeight = roundToNearest5(weight * 0.9); // -10%
          reason = `${formatRegion(entry.region)} pain (${entry.severity}/5) — reduced load 10%`;
          break;
        case 3:
          action = "reduce_weight";
          modifiedWeight = roundToNearest5(weight * 0.8); // -20%
          reason = `${formatRegion(entry.region)} pain (${entry.severity}/5) — reduced load 20%`;
          break;
        case 4:
          action = tier === "T1" ? "skip" : "reduce_weight";
          modifiedWeight =
            tier === "T1" ? 0 : roundToNearest5(weight * 0.5);
          reason = `${formatRegion(entry.region)} pain (${entry.severity}/5) — ${tier === "T1" ? "skip recommended" : "reduced load 50%"}`;
          break;
        case 5:
          action = "skip";
          modifiedWeight = 0;
          reason = `${formatRegion(entry.region)} pain (${entry.severity}/5) — skip recommended, consider rest day`;
          break;
        default:
          continue;
      }

      const mod: ExtendedWorkoutModification = {
        exerciseId: exercise.id,
        originalWeight: weight,
        modifiedWeight,
        reason,
        action,
        source: "pain",
        userAccepted: false, // user must accept
      };

      // Lower back specific substitution suggestions (spec section 6.4)
      if (
        entry.region === "lower_back" &&
        entry.severity >= 3 &&
        LOWER_BACK_SUBSTITUTIONS[exercise.id]
      ) {
        mod.substitutionSuggestions = LOWER_BACK_SUBSTITUTIONS[exercise.id];
      }

      modifications.push(mod);
    }
  }

  return modifications;
}

/**
 * Represents a dismissed red flag record.
 */
export interface RedFlagDismissal {
  region: BodyRegion;
  dismissedAt: Date;
}

/**
 * Determine whether to show a red flag safety warning.
 *
 * Per spec section 6.3.1:
 * - Severity 5: always show red flag screen.
 * - Severity 4 first time for this region: show red flag.
 * - Don't show again for same region within 30 days if dismissed.
 */
export function shouldShowRedFlag(
  severity: number,
  region: BodyRegion,
  recentFlags: RedFlagDismissal[]
): boolean {
  // Severity 5 always shows red flag
  if (severity === 5) return true;

  // Only severity 4+ triggers red flag
  if (severity < 4) return false;

  // Severity 4: check if dismissed within 30 days for this region
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const recentDismissalForRegion = recentFlags.find(
    (flag) =>
      flag.region === region &&
      now - flag.dismissedAt.getTime() < THIRTY_DAYS_MS
  );

  // Show if no recent dismissal for this region
  return !recentDismissalForRegion;
}
