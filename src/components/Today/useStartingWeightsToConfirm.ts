"use client";

import { useMemo } from "react";
import { useLiftAdjustments, useStrengthEvidence } from "@/hooks";
import { useStartingWeights } from "@/hooks/useStartingWeights";
import type { StartingWeightSuggestion } from "@/lib/import/startingWeights";
import {
  importedExerciseIds,
  startingWeightsAttention,
  unconfirmedStartingWeights,
  type StartingWeightsAttention,
} from "./startingWeightsModel";

export interface StartingWeightsToConfirm {
  /** Suggestions from the imported history the lifter has not confirmed (`unconfirmedStartingWeights`). */
  unconfirmed: StartingWeightSuggestion[];
  /** The exercises the imported history contains. */
  imported: ReadonlySet<string>;
}

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
