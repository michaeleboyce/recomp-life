import { useMemo } from "react";
import { muscleStrengthIndex, type MuscleStrengthIndex } from "@/lib/strength";
import { useStrengthSets } from "./useStrengthSets";

/**
 * Each muscle's strength trend from every exercise that works it, barbell and home
 * (`muscleStrengthIndex`). `undefined` while loading.
 */
export function useMuscleStrength(): MuscleStrengthIndex | undefined {
  const sets = useStrengthSets();
  return useMemo(() => (sets === undefined ? undefined : muscleStrengthIndex(sets)), [sets]);
}
