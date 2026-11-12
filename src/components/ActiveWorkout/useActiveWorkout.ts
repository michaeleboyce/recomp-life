"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useE1RMs, useLiftStates, useSettings, useWorkout } from "@/hooks";
import {
  appendSet,
  discardWorkout,
  finishWorkout,
  getRecentE1RMSeries,
} from "@/lib/data/workouts";
import { calculateE1RM, isE1RMEligibleSet } from "@/lib/e1rm";
import { getRestSeconds } from "@/lib/restTimes";
import {
  buildWorkoutPlan,
  computeCompletion,
  createSetLog,
  isNextSetAMRAP,
  nextStep,
  overridesFromSession,
  rehydratePlan,
  type WorkoutPlan,
} from "@/lib/workout";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { useWorkoutStore } from "@/stores/workoutStore";
import type { Estimated1RM, TrainingPhase } from "@/types";
import {
  clampReps,
  dropSuggestionFor,
  entryAfter,
  isDropAccepted,
  resolveActiveIndex,
} from "./activeWorkoutLogic";
import { getPrOpportunity } from "./prOpportunity";

const DEFAULT_PHASE: TrainingPhase = { mode: "maintaining" };
const E1RM_FLASH_MS = 3000;

export type ActiveWorkoutStatus =
  /** Records are still being read. */
  | "loading"
  /** No workout with this id (never existed, or was discarded). */
  | "missing"
  /** The workout was already finished; there is nothing left to log. */
  | "finished"
  | "active"
  /** Every set is done, or the user ended early: waiting to be saved. */
  | "complete";

/**
 * Everything the active workout screen does. The workout record is the source of
 * truth: the plan is rebuilt from it and progress is rehydrated from its logged
 * sets on every render, so a reload resumes at the same set.
 */
export function useActiveWorkout(sessionId: string | null) {
  const session = useWorkout(sessionId);
  const settings = useSettings();
  const liftStates = useLiftStates();

  const viewedEntryIndex = useWorkoutStore((s) => s.viewedEntryIndex);
  const pendingDrop = useWorkoutStore((s) => s.pendingDrop);
  const dismissedDropEntryIndex = useWorkoutStore((s) => s.dismissedDropEntryIndex);
  const workoutStartTime = useWorkoutStore((s) => s.workoutStartTime);
  const storeSessionId = useWorkoutStore((s) => s.sessionId);

  // Index of the entry that was on screen when the user chose to end early.
  const [endedAtIndex, setEndedAtIndex] = useState<number | null>(null);
  const [repsChoice, setRepsChoice] = useState<{ key: string; reps: number } | null>(null);
  const [rpeChoice, setRpeChoice] = useState<{ key: string; rpe: number } | null>(null);
  const [e1rmFlash, setE1rmFlash] = useState<number | null>(null);
  // Id of a set that has been written but is not yet visible on the live record.
  const [awaitingSetId, setAwaitingSetId] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = session ? WORKOUT_TEMPLATES[session.templateId] : undefined;
  const trainingPhase = settings?.trainingPhase ?? DEFAULT_PHASE;

  // The plan as prescribed when the workout was opened. Frozen per session so that
  // saving the workout (which moves the lift states) cannot reshuffle it.
  const [frozen, setFrozen] = useState<{ sessionId: string; plan: WorkoutPlan } | null>(null);
  if (session && settings && liftStates && template && frozen?.sessionId !== session.id) {
    setFrozen({
      sessionId: session.id,
      plan: buildWorkoutPlan({
        template,
        liftStates,
        location: session.location,
        equipment: settings.equipment,
        includeWarmUps: session.includeWarmUps,
        selectedAccessories: session.selectedAccessories ?? [],
        overrides: overridesFromSession(session),
      }),
    });
  }
  const basePlan = session && frozen?.sessionId === session.id ? frozen.plan : null;

  useEffect(() => {
    if (session) {
      useWorkoutStore.getState().beginSession(session.id, new Date(session.startedAt));
    }
  }, [session]);
  const storeReady = !!session && storeSessionId === session.id;

  const sets = useMemo(() => session?.sets ?? [], [session]);

  const plan = useMemo<WorkoutPlan>(() => {
    if (!basePlan) return [];
    const rehydrated = rehydratePlan(basePlan, sets).plan;
    if (!storeReady || !pendingDrop) return rehydrated;
    return rehydrated.map((entry, i) =>
      i === pendingDrop.entryIndex && entry.completedSets < entry.targetSets
        ? { ...entry, weight: pendingDrop.weight }
        : entry
    );
  }, [basePlan, sets, pendingDrop, storeReady]);

  const naturalIndex = resolveActiveIndex(plan, storeReady ? viewedEntryIndex : null);
  const activeIndex = endedAtIndex != null ? plan.length : naturalIndex;
  const entry = plan[activeIndex];
  const baseEntry = basePlan?.[activeIndex];
  const isAMRAPSet = entry ? isNextSetAMRAP(entry) : false;

  const setKey = entry ? `${activeIndex}:${entry.completedSets}` : "";
  const selectedReps =
    entry && repsChoice?.key === setKey ? repsChoice.reps : (entry?.targetReps ?? 0);
  const selectedRPE = rpeChoice?.key === setKey ? rpeChoice.rpe : null;

  const dropAccepted =
    !!entry &&
    !!baseEntry &&
    entry.tier === "T2" &&
    (pendingDrop?.entryIndex === activeIndex || isDropAccepted(entry, baseEntry.weight, sets));

  const dropSuggestion = useMemo(() => {
    if (!entry || dropAccepted || dismissedDropEntryIndex === activeIndex) return null;
    return dropSuggestionFor(entry, sets, trainingPhase);
  }, [entry, dropAccepted, dismissedDropEntryIndex, activeIndex, sets, trainingPhase]);

  // PR opportunity: only for the lift itself, never for a home substitute.
  const e1rmRows = useE1RMs(entry?.exerciseId ?? "none");
  const recentAMRAPReps = useMemo(
    () => liftStates?.find((ls) => ls.exerciseId === entry?.exerciseId)?.recentAMRAPReps ?? [],
    [liftStates, entry?.exerciseId]
  );
  const prOpportunity = useMemo(() => {
    if (!entry || entry.isWarmUp || entry.substituteExerciseId || !e1rmRows) return null;
    const bestE1RM = e1rmRows.length
      ? Math.max(...e1rmRows.map((row) => row.estimated1RM))
      : null;
    return getPrOpportunity({
      tier: entry.tier,
      isAMRAP: isAMRAPSet,
      weight: entry.weight,
      bestE1RM,
      recentAMRAPReps,
    });
  }, [entry, isAMRAPSet, e1rmRows, recentAMRAPReps]);

  const isSaving = awaitingSetId != null && !sets.some((set) => set.id === awaitingSetId);

  const logSet = useCallback(async () => {
    if (!session || !entry || !baseEntry || isSaving) return;
    setError(null);

    // An accepted drop records what the weight was dropped from.
    const exercise = dropAccepted
      ? { ...entry, originalWeight: entry.originalWeight ?? baseEntry.weight }
      : entry;
    const now = new Date();
    const set = createSetLog({
      exercise,
      actualReps: selectedReps,
      rpe: selectedRPE,
      location: session.location,
      autoRegulated: dropAccepted,
      now,
      id: uuidv4(),
      clientId: uuidv4(),
    });

    // e1RM only for heavy T1 AMRAP sets of the lift itself: a home substitute's
    // dumbbell weight says nothing about the barbell lift.
    let e1rmRow: Estimated1RM | undefined;
    if (!entry.substituteExerciseId && isE1RMEligibleSet(entry.tier, set.isAMRAP, selectedReps)) {
      const e1rm = calculateE1RM(entry.weight, selectedReps, selectedRPE);
      if (e1rm) {
        e1rmRow = {
          id: uuidv4(),
          clientId: uuidv4(),
          date: now,
          exerciseId: entry.exerciseId,
          workingWeight: entry.weight,
          repsCompleted: selectedReps,
          estimated1RM: e1rm,
          workoutSessionId: session.id,
          synced: false,
        };
      }
    }

    setAwaitingSetId(set.id);
    try {
      await appendSet(session.id, set, e1rmRow);
    } catch (err) {
      console.error("Failed to save set:", err);
      setAwaitingSetId(null);
      setError("That set could not be saved. Try again.");
      return;
    }

    if (e1rmRow) {
      setE1rmFlash(e1rmRow.estimated1RM);
      setTimeout(() => setE1rmFlash(null), E1RM_FLASH_MS);
    }

    const store = useWorkoutStore.getState();
    if (store.pendingDrop?.entryIndex === activeIndex) store.clearPendingDrop();

    if (nextStep(plan, activeIndex) === "rest") {
      store.startRestTimer(getRestSeconds(entry.tier, trainingPhase), entry.tier);
    } else {
      // Last set of the entry: no rest, straight on to whatever is next.
      const after = plan.map((e, i) =>
        i === activeIndex ? { ...e, completedSets: e.completedSets + 1 } : e
      );
      store.viewEntry(entryAfter(after, activeIndex));
    }
  }, [
    session,
    entry,
    baseEntry,
    isSaving,
    dropAccepted,
    selectedReps,
    selectedRPE,
    activeIndex,
    plan,
    trainingPhase,
  ]);

  const setSelectedReps = useCallback(
    (reps: number) => setRepsChoice({ key: setKey, reps: clampReps(reps) }),
    [setKey]
  );
  const setSelectedRPE = useCallback(
    (rpe: number | null) => setRpeChoice(rpe == null ? null : { key: setKey, rpe }),
    [setKey]
  );

  const acceptDrop = useCallback(() => {
    if (dropSuggestion) {
      useWorkoutStore.getState().acceptDrop(activeIndex, dropSuggestion.reducedWeight);
    }
  }, [dropSuggestion, activeIndex]);

  const keepWeight = useCallback(() => {
    useWorkoutStore.getState().dismissDrop(activeIndex);
  }, [activeIndex]);

  const jumpTo = useCallback((index: number) => {
    const store = useWorkoutStore.getState();
    store.skipRest();
    store.viewEntry(index);
    setE1rmFlash(null);
  }, []);

  const endEarly = useCallback(() => {
    useWorkoutStore.getState().skipRest();
    setEndedAtIndex(naturalIndex);
  }, [naturalIndex]);

  /** Applies progression and marks the workout finished. Resolves true on success. */
  const finish = useCallback(async (): Promise<boolean> => {
    if (!session || !settings || !liftStates || !template || isCompleting) return false;
    setIsCompleting(true);
    try {
      const recentE1RMsByExercise: Record<string, number[]> = {};
      for (const templateEx of template.exercises) {
        if (templateEx.tier !== "T1" && templateEx.tier !== "T2") continue;
        recentE1RMsByExercise[templateEx.exerciseId] = await getRecentE1RMSeries(
          templateEx.exerciseId
        );
      }
      const result = computeCompletion({
        session,
        plan,
        sets,
        liftStates,
        settings,
        recentE1RMsByExercise,
        currentExerciseIndex: endedAtIndex ?? naturalIndex,
        workoutStartTime: workoutStartTime ?? new Date(session.startedAt),
        now: new Date(),
      });
      await finishWorkout(session.id, result);
      return true;
    } catch (err) {
      console.error("Failed to complete workout:", err);
      setError("The workout could not be saved. Try again.");
      setIsCompleting(false);
      return false;
    }
  }, [
    session,
    settings,
    liftStates,
    template,
    isCompleting,
    plan,
    sets,
    endedAtIndex,
    naturalIndex,
    workoutStartTime,
  ]);

  /** Deletes the workout with its sets and e1RM rows. */
  const discard = useCallback(async () => {
    if (!sessionId) return;
    await discardWorkout(sessionId);
    useWorkoutStore.getState().reset();
  }, [sessionId]);

  let status: ActiveWorkoutStatus;
  if (session === undefined || settings === undefined || liftStates === undefined) {
    status = "loading";
  } else if (session === null || !template) {
    status = "missing";
  } else if (!settings || !basePlan || !storeReady) {
    status = "loading";
  } else if (session.completedAt != null && !isCompleting) {
    status = "finished";
  } else if (activeIndex >= plan.length) {
    status = "complete";
  } else {
    status = "active";
  }

  return {
    status,
    session: session ?? null,
    settings: settings ?? null,
    trainingPhase,
    templateName: template?.name ?? session?.templateId ?? "",
    workoutStartTime,
    plan,
    sets,
    activeIndex,
    entry,
    isAMRAPSet,
    selectedReps,
    setSelectedReps,
    selectedRPE,
    setSelectedRPE,
    isSaving,
    logSet,
    e1rmFlash,
    dropSuggestion,
    acceptDrop,
    keepWeight,
    prOpportunity,
    recentAMRAPReps,
    jumpTo,
    endEarly,
    finish,
    discard,
    isCompleting,
    error,
  };
}

export type ActiveWorkout = ReturnType<typeof useActiveWorkout>;
