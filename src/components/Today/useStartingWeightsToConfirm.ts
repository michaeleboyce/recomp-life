"use client";

import { useMemo } from "react";
import { useLiftAdjustments, useStrengthEvidence } from "@/hooks";
import { useStartingWeights } from "@/hooks/useStartingWeights";
import {
  importedExerciseIds,
  startingWeightsAttention,
  unconfirmedStartingWeights,
  type StartingWeightsAttention,
  type StartingWeightsToConfirm,
} from "./startingWeightsModel";

/** The starting weights still to confirm, and what the imported history holds; `undefined` while loading. */
export function useStartingWeightsToConfirm(): StartingWeightsToConfirm | undefined {
  const suggestions = useStartingWeights();
  const adjustments = useLiftAdjustments();
  const sets = useStrengthEvidence();
  return useMemo(() => {
    if (suggestions === undefined || adjustments === undefined || sets === undefined) return undefined;
    return { unconfirmed: unconfirmedStartingWeights(suggestions, adjustments), imported: importedExerciseIds(sets) };
  }, [suggestions, adjustments, sets]);
}

/** Today's "Confirm your starting weights" item while any waits; null otherwise or while loading. */
export function useStartingWeightsAttention(): StartingWeightsAttention | null {
  const toConfirm = useStartingWeightsToConfirm();
  return useMemo(() => (toConfirm ? startingWeightsAttention(toConfirm.unconfirmed) : null), [toConfirm]);
}
