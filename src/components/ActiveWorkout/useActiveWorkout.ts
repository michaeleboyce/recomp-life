"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { useE1RMs, useLiftStates, useSettings, useWorkout } from "@/hooks";
import { liftName } from "@/components/LogEdit/format";
import { toast } from "@/components/ui/toast";
import { commitLogChange } from "@/lib/data/logEdits";
import { appendSet, discardWorkout, finishWorkout } from "@/lib/data/workouts";
import { calculateE1RM, isE1RMEligibleSet } from "@/lib/e1rm";
import type { LogChange } from "@/lib/rebuild";
import { getRestSeconds } from "@/lib/restTimes";
import {
  createSetLog,
  isNextSetAMRAP,
  nextStep,
  rehydratePlan,
  type WorkoutPlan,
} from "@/lib/workout";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { useWorkoutStore } from "@/stores/workoutStore";
import type { TrainingPhase } from "@/types";
import {
  clampReps,
  correctedSet,
  dropSuggestionFor,
  entryAfter,
  entryIndexForSet,
  isDropAccepted,
  isLatestSetOfEntry,
  planForSession,
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
/**
 * How long after a set is logged further log taps are ignored. Without it, a double
 * tap on the last set of an entry (every warm-up is one) logs the first set of the
 * next entry at its target, and there is no per-set undo.
 */
export const LOG_TAP_GUARD_MS = 700;

/** The guard in effect when a caller passes none. Tests that tap in quick succession set `ms` to 0. */
export const logTapGuard = { ms: LOG_TAP_GUARD_MS };

export function useActiveWorkout(
  sessionId: string | null,
  options: { tapGuardMs?: number } = {}
) {
  const tapGuardMs = options.tapGuardMs ?? logTapGuard.ms;
  const lastLogAt = useRef(0);
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
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  const template = session ? WORKOUT_TEMPLATES[session.templateId] : undefined;
  const trainingPhase = settings?.trainingPhase ?? DEFAULT_PHASE;

  // The plan as prescribed when the workout started (its stored prescription; the
  // current lift states only for a session that has none). Frozen per session so that
  // saving the workout (which moves the lift states) cannot reshuffle it.
  const [frozen, setFrozen] = useState<{ sessionId: string; plan: WorkoutPlan } | null>(null);
  if (session && settings && liftStates && template && frozen?.sessionId !== session.id) {
    setFrozen({
      sessionId: session.id,
      plan: planForSession({ session, template, liftStates, equipment: settings.equipment }),
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
    (pendingDrop?.entryIndex === activeIndex || isDropAccepted(entry, sets));

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
    if (Date.now() - lastLogAt.current < tapGuardMs) return;
    lastLogAt.current = Date.now();
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
    // The row itself is written by appendSet; this is only the number to flash.
    const e1rm =
      !entry.substituteExerciseId && isE1RMEligibleSet(entry.tier, set.isAMRAP, selectedReps)
        ? calculateE1RM(entry.weight, selectedReps, selectedRPE)
        : null;

    setAwaitingSetId(set.id);
    try {
      await appendSet(session.id, set);
    } catch (err) {
      console.error("Failed to save set:", err);
      setAwaitingSetId(null);
      // A failed save must not block the retry.
      lastLogAt.current = 0;
      setError("That set could not be saved. Try again.");
      return;
    }

    if (e1rm) {
      setE1rmFlash(e1rm);
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
    tapGuardMs,
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

  // What an Undo tapped later has to check against: the sets and plan as they are then.
  const latest = useRef<{ sets: typeof sets; plan: WorkoutPlan }>({ sets, plan });
  useEffect(() => {
    latest.current = { sets, plan };
  }, [sets, plan]);

  /**
   * Corrects a set of this workout before it is finished: an edit to its reps, weight
   * or RPE, or deleting the last set logged for an exercise. Nothing is previewed:
   * an unfinished workout has no progression yet, and finishing reads the corrected
   * sets. Resolves false (with `correctionError` set) when nothing was changed.
   */
  const correctSet = useCallback(
    async (change: LogChange): Promise<boolean> => {
      if (!session || (change.kind !== "editSet" && change.kind !== "deleteSet")) return false;
      const workoutId = session.id;
      const original = sets.find((set) => set.id === change.setId);
      if (!original) {
        setCorrectionError("That set is no longer on this workout.");
        return false;
      }
      setCorrectionError(null);
      // Named as the edit sheet names it ("Squat, set 2").
      const label = `${liftName(original.substituteExerciseId || original.exerciseId)} set ${original.setNumber}`;

      if (change.kind === "editSet") {
        const corrected = correctedSet(session, change);
        if (!corrected) return false;
        try {
          await appendSet(workoutId, corrected);
        } catch (err) {
          console.error("Failed to correct set:", err);
          setCorrectionError("That change could not be saved. Try again.");
          return false;
        }
        setE1rmFlash(null);
        toast({
          message: `${label} corrected`,
          action: {
            label: "Undo",
            onAction: async () => {
              if (!latest.current.sets.some((set) => set.id === original.id)) {
                toast({ message: "That set has since been deleted, so there is nothing to undo." });
                return;
              }
              try {
                await appendSet(workoutId, original);
                toast({ message: "Correction undone" });
              } catch (err) {
                console.error("Failed to undo correction:", err);
                toast({ message: "The correction could not be undone. Try again." });
              }
            },
          },
        });
        return true;
      }

      // Sets are a sequence: taking one out of the middle would leave the AMRAP set
      // and the set numbers describing a workout that did not happen.
      if (!isLatestSetOfEntry(sets, original)) {
        setCorrectionError(
          "Only the last set logged for an exercise can be deleted during a workout. To fix this set, change its reps or weight."
        );
        return false;
      }
      const wasMostRecent = sets.at(-1)?.id === original.id;
      try {
        await commitLogChange(change);
      } catch (err) {
        console.error("Failed to delete set:", err);
        setCorrectionError("That set could not be deleted. Try again.");
        return false;
      }
      // The log button waits for the set it just wrote to show up; that set is gone.
      setAwaitingSetId((id) => (id === original.id ? null : id));
      // Start the set over from its target, not from what was picked for the deleted one.
      setRepsChoice(null);
      setRpeChoice(null);
      const store = useWorkoutStore.getState();
      // The rest that followed the deleted set is over: it is the next set to do.
      if (wasMostRecent) store.skipRest();
      const index = entryIndexForSet(plan, original);
      if (index !== -1) {
        if (store.pendingDrop?.entryIndex === index) store.clearPendingDrop();
        store.viewEntry(index);
      }
      setE1rmFlash(null);
      toast({
        message: `${label} deleted`,
        action: {
          label: "Undo",
          onAction: async () => {
            const now = latest.current;
            const target = now.plan[entryIndexForSet(now.plan, original)];
            if (target && target.completedSets >= target.targetSets) {
              toast({
                message: "That set has been logged again, so the deleted one was not restored.",
              });
              return;
            }
            try {
              await commitLogChange({ kind: "addSet", workoutId, set: original });
              toast({ message: "Set restored" });
            } catch (err) {
              console.error("Failed to restore set:", err);
              toast({ message: "The set could not be restored. Try again." });
            }
          },
        },
      });
      return true;
    },
    [session, sets, plan]
  );

  const clearCorrectionError = useCallback(() => setCorrectionError(null), []);

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
      const completedAt = new Date();
      const startedAt = workoutStartTime ?? new Date(session.startedAt);
      await finishWorkout(session.id, {
        completedAt,
        totalDurationSeconds: Math.floor((completedAt.getTime() - startedAt.getTime()) / 1000),
        endedEarly: (endedAtIndex ?? naturalIndex) < plan.length,
      });
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
    endedAtIndex,
    naturalIndex,
    workoutStartTime,
  ]);

  /** Discards the workout: a soft delete, so its sets and e1RM rows drop out everywhere. */
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
    correctSet,
    correctionError,
    clearCorrectionError,
    jumpTo,
    endEarly,
    finish,
    discard,
    isCompleting,
    error,
  };
}

export type ActiveWorkout = ReturnType<typeof useActiveWorkout>;
