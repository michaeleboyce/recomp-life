import type { TrainingPhase, VolumeRatioCheck } from "@/types";
import { getAccessoryRepRange } from "./accessories";

// ─── Session Volume Ratio (spec §5.9.1) ───────────────────────────────────────

/**
 * Calculates the session volume ratio and checks whether accessory volume
 * is appropriate for the current training phase.
 *
 * The ratio is expressed as T1:T2:T3-tier where T3-tier includes the core
 * T3 exercise plus all accessories. For example, "1:2:3" means the T2
 * volume is 2x the T1 volume and the T3-tier volume is 3x the T1 volume.
 *
 * Phase-specific maximum T3-tier ratios:
 * - Cutting: 5x  (max 2 accessories)
 * - Maintaining: 7x  (max 3 accessories)
 * - Bulking: 10x (max 4 accessories)
 *
 * When the ratio exceeds the phase maximum, a warning is returned with
 * guidance on how many accessories to drop.
 */
export function calculateSessionVolumeRatio(
  t1Reps: number,
  t2Reps: number,
  t3Reps: number,
  accessoryReps: number,
  phase: TrainingPhase
): VolumeRatioCheck {
  const totalT3Tier = t3Reps + accessoryReps;
  const actualRatio = t1Reps > 0 ? totalT3Tier / t1Reps : 0;

  const maxRatio =
    phase.mode === "cutting" ? 5 : phase.mode === "maintaining" ? 7 : 10;

  const maxAccessories =
    phase.mode === "cutting" ? 2 : phase.mode === "maintaining" ? 3 : 4;

  const ratioString = `1:${Math.round(t2Reps / t1Reps)}:${Math.round(actualRatio)}`;

  if (actualRatio > maxRatio) {
    const excessReps = totalT3Tier - maxRatio * t1Reps;
    const accessoriesToDrop = Math.ceil(excessReps / 45);

    return {
      status: "warning",
      ratio: ratioString,
      message:
        phase.mode === "cutting"
          ? `Your T3-tier volume is ${Math.round(actualRatio)}x your T1 volume (target: \u2264${maxRatio}x). On a cut, this will impair recovery for your heavy lifts. Consider dropping ${accessoriesToDrop} accessor${accessoriesToDrop === 1 ? "y" : "ies"}.`
          : `Volume ratio is high (${Math.round(actualRatio)}x). Monitor recovery.`,
      suggestedMaxAccessories: maxAccessories,
    };
  }

  return { status: "ok", ratio: ratioString };
}

// ─── Estimate Accessory Reps ──────────────────────────────────────────────────

/**
 * Returns estimated total reps for an accessory exercise based on its
 * rep range. Uses the minimum of the rep range times the number of sets
 * as a conservative estimate.
 *
 * Examples:
 * - Face pulls (3x15-20): 3 * 15 = 45
 * - Bicep curls (3x12-15): 3 * 12 = 36
 * - Ab rollout (3x10-12): 3 * 10 = 30
 */
export function estimateAccessoryReps(exerciseId: string): number {
  const range = getAccessoryRepRange(exerciseId);
  return range.sets * range.min;
}
