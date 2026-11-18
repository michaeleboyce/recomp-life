"use client";

import { useMemo } from "react";
import {
  useCompletedWorkouts,
  useLiftStates,
  usePainEntries,
  useSettings,
  useStrengthEvidence,
  useVariantStates,
} from "@/hooks";
import { DAY_MS } from "@/lib/dates";
import { getMuscleRecovery } from "@/lib/muscleLoad";
import type { SwapContext, SwapSlot } from "@/lib/swap";
import type { WorkoutLocation } from "@/types";

/** Pain entries this recent count against a candidate (the Ready screen's window). */
const PAIN_WINDOW_MS = 7 * DAY_MS;
const NO_IDS: readonly string[] = [];

/**
 * What the swap sheet ranks from (`SwapContext`): the settings' preferences, equipment
 * and hand-set accessory weights, every set as strength evidence, recent pain and each
 * muscle's recovery, for the entry being replaced (`slot`) at `location`. Undefined while
 * any of it is still loading. Before a workout at home it also carries the lift's state
 * and the home exercises' states (`liftId`), so a home version of the lift is planned as
 * the home-substitute path plans it; during one (`inWorkout`) a home version is a swap.
 */
export function useSwapContext(input: {
  location: WorkoutLocation;
  exclude?: readonly string[];
  slot?: SwapSlot;
  /** The program lift being replaced (the entry's own id). */
  liftId?: string;
  inWorkout?: boolean;
  now: Date;
}): SwapContext | undefined {
  const settings = useSettings();
  const strengthSets = useStrengthEvidence();
  const painEntries = usePainEntries();
  const workouts = useCompletedWorkouts();
  const liftStates = useLiftStates();
  const variantStates = useVariantStates();
  const { location, slot, now, liftId, inWorkout = false } = input;
  const liftState = liftId ? liftStates?.find((s) => s.exerciseId === liftId) : undefined;
  const exclude = input.exclude ?? NO_IDS;

  const recovery = useMemo(
    () => (workouts && settings ? getMuscleRecovery(workouts, now, settings.trainingPhase) : undefined),
    [workouts, settings, now]
  );
  const pain = useMemo(
    () => (painEntries ?? []).filter((e) => now.getTime() - new Date(e.date).getTime() < PAIN_WINDOW_MS),
    [painEntries, now]
  );

  return useMemo(() => {
    if (!settings || !strengthSets || !recovery || !variantStates) return undefined;
    return {
      location,
      ...(settings.exercisePreferences ? { preferences: settings.exercisePreferences } : {}),
      ...(settings.exercisePreferencesByLocation ? { preferencesByLocation: settings.exercisePreferencesByLocation } : {}),
      exclude,
      ...(slot ? { slot } : {}),
      equipment: settings.equipment,
      strengthSets,
      ...(settings.accessoryWeights ? { accessoryWeights: settings.accessoryWeights } : {}),
      recovery,
      painEntries: pain,
      phase: settings.trainingPhase,
      inWorkout,
      ...(liftState ? { liftState } : {}),
      variantStates,
      now,
    };
  }, [settings, strengthSets, recovery, variantStates, liftState, inWorkout, pain, location, exclude, slot, now]);
}
