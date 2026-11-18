"use client";

import { useMemo } from "react";
import { useStrengthEvidence } from "@/hooks";
import { getAccessoryRepRange } from "@/lib/accessories";
import {
  accessoryAddEdit,
  accessoryNextTime,
  nextTimeText,
  planAccessories,
  prescribeAccessory,
  type AccessorySource,
} from "@/lib/workout/accessoryPlan";
import type { WorkoutPlan } from "@/lib/workout/types";
import type { SetLog, UserSettings, WorkoutSession } from "@/types";

const NO_SETS: never[] = [];

/**
 * The accessories side of a workout in progress (A9): today's scored list for the
 * sheet's Add list (chosen for the session's day, location and lifts, as at start),
 * an accessory's prescription when it is added, its rep range, and what it does next
 * time once its sets are done.
 */
export function useWorkoutAccessories(
  session: WorkoutSession | null,
  plan: WorkoutPlan,
  settings: UserSettings | null
) {
  const strengthSets = useStrengthEvidence() ?? NO_SETS;
  const source = useMemo<AccessorySource | null>(
    () => (session && settings ? { settings, strengthSets, now: new Date(session.startedAt) } : null),
    [session, settings, strengthSets]
  );
  const mainLifts = useMemo(
    () =>
      plan
        .filter((e) => !e.isWarmUp && (e.tier === "T1" || e.tier === "T2" || e.tier === "T3"))
        .map((e) => ({ exerciseId: e.substituteExerciseId || e.exerciseId, sets: e.targetSets })),
    [plan]
  );
  const choice = useMemo(
    () =>
      session && source
        ? planAccessories({ templateId: session.templateId, mainLifts, location: session.location, source }).choice
        : null,
    [session, source, mainLifts]
  );
  const inPlan = useMemo(
    () => plan.flatMap((e) => (e.isWarmUp ? [] : [e.exerciseId, ...(e.substituteExerciseId ? [e.substituteExerciseId] : [])])),
    [plan]
  );

  /** The scheme and weight an accessory is added at: its prescription for today. */
  const prescriptionFor = (exerciseId: string) => {
    if (!source) return null;
    const { sets, reps, weight, isAMRAP } = accessoryAddEdit(prescribeAccessory(exerciseId, source));
    return { sets, reps, weight, isAMRAP };
  };

  /** "12–15": the range an accessory entry is taken toward (its target is the top). */
  const repRange = (exerciseId: string, targetReps: number) => {
    const range = getAccessoryRepRange(exerciseId);
    return { min: Math.min(range.min, targetReps), max: targetReps };
  };

  /** What an accessory does next time, after this session's sets of it; null before any. */
  const nextTime = (exerciseId: string, sets: readonly SetLog[]) => {
    if (!session || !settings) return null;
    const next = accessoryNextTime(exerciseId, { id: session.id, sets: [...sets] }, strengthSets, settings, new Date());
    return next ? nextTimeText(next) : null;
  };

  return { choice, source, inPlan, prescriptionFor, repRange, nextTime };
}
