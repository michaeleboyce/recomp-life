"use client";

import { useMemo } from "react";
import { useCompletedWorkouts, usePainEntries, useSettings, useStrengthEvidence } from "@/hooks";
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
 * muscle's recovery, for the entry being replaced (`slot`) at `location`. Undefined
 * while any of it is still loading.
 */
export function useSwapContext(input: {
  location: WorkoutLocation;
  exclude?: readonly string[];
  slot?: SwapSlot;
  now: Date;
}): SwapContext | undefined {
  const settings = useSettings();
  const strengthSets = useStrengthEvidence();
  const painEntries = usePainEntries();
  const workouts = useCompletedWorkouts();
  const { location, slot, now } = input;
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
    if (!settings || !strengthSets || !recovery) return undefined;
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
      now,
    };
  }, [settings, strengthSets, recovery, pain, location, exclude, slot, now]);
}
