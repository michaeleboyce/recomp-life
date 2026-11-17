import { useMemo } from "react";
import { muscleStrengthIndex, type MuscleStrengthIndex } from "@/lib/strength";
import { useStrengthEvidence } from "./useStrengthEvidence";

/**
 * Each muscle's strength trend from every exercise that works it, barbell and home,
 * logged here or imported from another app (`muscleStrengthIndex` over
 * `useStrengthEvidence`, the evidence the plans read too). `undefined` while loading.
 */
export function useMuscleStrength(): MuscleStrengthIndex | undefined {
  const sets = useStrengthEvidence();
  return useMemo(() => (sets === undefined ? undefined : muscleStrengthIndex(sets)), [sets]);
}
