"use client";

/*
 * State map of the active workout (who owns what). "Reload" is a page reload: React
 * state and the store are gone. "Remount" is leaving the screen and coming back (Today,
 * then Resume): React state is gone, the store (a module singleton) stays.
 *
 * | State                        | Lives in                       | Written by                                                    | Read by                         | Reset by                                         | Reload | Remount |
 * |------------------------------|--------------------------------|---------------------------------------------------------------|---------------------------------|--------------------------------------------------|--------|---------|
 * | logged sets, plan edits      | session row (Dexie)            | appendSet, appendPlanEdit, commitLogChange                     | everything                      | never (soft delete on discard)                   | kept   | kept    |
 * | start time                   | session row (startedAt)        | startWorkout only                                             | header clock, finish            | never                                            | kept   | kept    |
 * | frozen plan                  | React (per session id)         | first load (planForSession), addExercise, applyChange         | everything                      | another session id                               | rebuilt from session | rebuilt |
 * | draft: spot weights          | useSetDraft: React + sessionStorage | setSetWeight / setNextWeight, applyChange (replaced entry)    | plan, chips, logSet             | per set: back to plan; per entry: replaced swap  | kept   | kept    |
 * | draft: reps, effort picked   | useSetDraft: React, by "entry:set" | setSelectedReps, setSelectedRepsInReserve                     | logSet                          | key changes (next set); deleting a set           | lost   | lost    |
 * | draft: pending T2 drop       | useSetDraft: store             | acceptDrop                                                    | plan, dropAccepted              | log on its entry, delete on it, swap of it, reset| lost   | kept    |
 * | draft: declined T2 drop      | useSetDraft: store             | keepWeight                                                    | dropSuggestion                  | another session id, reset                        | lost   | kept    |
 * | draft: drop sets in progress | useSetDraft: React (per session id) | startDropSet, setDropWeight/Reps, logDropSet, endDropSets     | dropSet                         | endDropSets                                      | lost   | lost    |
 * | rest countdown               | store (RestTimer ticks it)     | only through restCountdown.ts: logSet, endDropSets start it; jumpTo, swap, endEarly, startDropSet, delete of the latest set skip it; RestTimer ticks, adds, ends | RestTimer, LogDock | skipRest, reset | lost | kept |
 * | view: viewed entry           | useWorkoutView: store          | logSet (last set of an entry), jumpTo, swap, delete           | activeIndex                     | another session id, reset                        | lost (resumes at first unfinished) | kept |
 * | view: ended-early index      | useWorkoutView: React          | endEarly                                                      | activeIndex, finish             | never                                            | lost   | lost    |
 * | view: e1RM flash             | useWorkoutView: React + timeout| logSet                                                        | screen                          | 3 s, drop start, correction, swap, jump          | lost   | lost    |
 * | saving, errors, log tap guard| React / ref                    | logSet, logDropSet, correctSet, finish                        | screen                          | next attempt                                     | lost   | lost    |
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import {
  useE1RMs,
  useLiftStates,
  useSettings,
  useStrengthEvidence,
  useVariantStates,
  useWorkout,
} from "@/hooks";
import { liftName } from "@/components/LogEdit/format";
import { toast } from "@/components/ui/toast";
import { commitLogChange } from "@/lib/data/logEdits";
import { appendPlanEdit, appendSet, discardWorkout, finishWorkout } from "@/lib/data/workouts";
import { calculateE1RM, isE1RMEligibleSet } from "@/lib/e1rm";
import { EXERCISES } from "@/lib/exercises";
import type { LogChange } from "@/lib/rebuild";
import {
  applyPlanEdits,
  createSetLog,
  isNextSetAMRAP,
  type WorkoutPlan,
} from "@/lib/workout";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { useWorkoutStore } from "@/stores/workoutStore";
import { midWorkoutRemove, midWorkoutSwap, type MidWorkoutChange, type SwapReplacement } from "@/lib/swap";
import type { PlanEdit, RepsInReserve, SetLog, Tier, TrainingPhase } from "@/types";
import {
  correctedSet,
  dropSuggestionFor,
  entryIndexForSet,
  isDropAccepted,
  isLatestSetOfEntry,
} from "./activeWorkoutLogic";
import { planForSession } from "@/lib/workout/planForSession";
import { getPrOpportunity } from "./prOpportunity";
import {
  exerciseForLog,
  minWeightFor,
  nextSetView,
  screenPlan,
  setChipsFor,
  spotKey,
  spotWeightsOf,
  weightStepFor,
} from "./setPlan";
import { clampWeight } from "@/components/SetPlan/setPlanModel";
import { withPendingDrop } from "./setDraft";
import { useSetDraft } from "./useSetDraft";
import { useDropSets } from "./useDropSets";
import { useTapGuard } from "./useTapGuard";
import { screenIndexes, useWorkoutView } from "./useWorkoutView";
import { afterSetLogged, restTimer } from "./restCountdown";

/** The exercise a set was done with: the substitute when there was one. */
const performedId = (set: Pick<SetLog, "exerciseId" | "substituteExerciseId">) =>
  set.substituteExerciseId || set.exerciseId;

const DEFAULT_PHASE: TrainingPhase = { mode: "maintaining" };

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
  const guard = useTapGuard(tapGuardMs);
  const session = useWorkout(sessionId);
  const settings = useSettings();
  const liftStates = useLiftStates();
  const variantStates = useVariantStates();
  const strengthSets = useStrengthEvidence();

  // View state: the entry shown, ended early, the e1RM flash.
  const { storeReady, viewedEntryIndex, viewEntry, endedAtIndex, endAt, e1rmFlash, flashE1rm, clearFlash } =
    useWorkoutView(session);
  // Id of a set that has been written but is not yet visible on the live record.
  const [awaitingSetId, setAwaitingSetId] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);

  const template = session ? WORKOUT_TEMPLATES[session.templateId] : undefined;
  const trainingPhase = settings?.trainingPhase ?? DEFAULT_PHASE;

  // The plan as prescribed when the workout started (its stored prescription, home
  // exercises' included; the current lift and home-exercise states only for a session
  // that has none). Frozen per session so that saving the workout (which moves the
  // states) cannot reshuffle it, so it waits for every state it reads.
  const [frozen, setFrozen] = useState<{ sessionId: string; plan: WorkoutPlan } | null>(null);
  if (
    session &&
    settings &&
    liftStates &&
    variantStates &&
    strengthSets &&
    template &&
    frozen?.sessionId !== session.id
  ) {
    setFrozen({
      sessionId: session.id,
      plan: planForSession({
        session,
        template,
        liftStates,
        equipment: settings.equipment,
        variantStates,
        strengthSets,
      }),
    });
  }
  const basePlan = session && frozen?.sessionId === session.id ? frozen.plan : null;

  // The saved session owns the start time: it is written once, when the workout starts
  // (`startWorkout`), and never changed. One Date per value, so the clock is not restarted.
  const startedAtMs = session ? new Date(session.startedAt).getTime() : null;
  const workoutStartTime = useMemo(() => (startedAtMs == null ? null : new Date(startedAtMs)), [startedAtMs]);

  const sets = useMemo(() => session?.sets ?? [], [session]);
  // The next set's draft: reps and effort picked, weights changed on the spot, T2 drops.
  const {
    repsFor,
    repsInReserveFor,
    pickReps,
    pickRepsInReserve,
    clearPicks,
    spotWeights,
    setSpotWeight,
    clearEntrySpotWeights,
    pendingDrop,
    dismissedDropEntryIndex,
    acceptDrop: acceptDropOn,
    dismissDrop,
    clearPendingDropOn,
    drop,
    startDrop,
    continueDrop,
    setDropWeightAtLeast,
    setDropReps: setDraftDropReps,
    endDrop,
  } = useSetDraft(session?.id ?? null);

  // Drop sets continue a set and are not sets of their entry; a per-set entry keeps its
  // working weight (each set's own is in `perSet`); a weight changed on the spot is for
  // its own set alone.
  const plan = useMemo<WorkoutPlan>(() => {
    if (!basePlan) return [];
    return withPendingDrop(screenPlan(basePlan, sets, spotWeights), storeReady ? pendingDrop : null);
  }, [basePlan, sets, spotWeights, pendingDrop, storeReady]);

  const { naturalIndex, activeIndex } = screenIndexes(plan, viewedEntryIndex, endedAtIndex);
  const planEntry = plan[activeIndex];
  const baseEntry = basePlan?.[activeIndex];
  const isAMRAPSet = planEntry ? isNextSetAMRAP(planEntry) : false;

  const setKey = planEntry ? spotKey(activeIndex, planEntry.completedSets) : "";
  // The entry on screen's weights changed on the spot, by set index, and the next set's.
  const entrySpotWeights = useMemo(() => spotWeightsOf(spotWeights, activeIndex), [spotWeights, activeIndex]);
  const weightOverride = planEntry ? (entrySpotWeights[planEntry.completedSets] ?? null) : null;
  // The entry as its next set is done: that set's own weight and reps (per-set weights,
  // or a weight changed on the spot).
  const entry = useMemo(
    () => (planEntry ? nextSetView(planEntry, weightOverride) : undefined),
    [planEntry, weightOverride]
  );
  const pickedReps = repsFor(setKey);
  const selectedReps = entry && pickedReps !== undefined ? pickedReps : (entry?.targetReps ?? 0);
  const selectedRepsInReserve = repsInReserveFor(setKey);

  const equipment = settings?.equipment;
  const location = session?.location ?? "gym";
  const weightStep =
    entry && equipment ? weightStepFor(performedId(entry), location, equipment) : 5;
  const minWeight = entry && equipment ? minWeightFor(performedId(entry), location, equipment) : 0;
  // At home every weight is a dumbbell's: none heavier than the heaviest one there is.
  const maxWeight = location === "home" && equipment ? equipment.maxDumbbellWeight : undefined;
  const setChips = useMemo(
    () => (planEntry && !planEntry.isWarmUp ? setChipsFor(planEntry, sets, entrySpotWeights) : []),
    [planEntry, sets, entrySpotWeights]
  );

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
    if (!session || !entry || !planEntry || !baseEntry || isSaving) return;
    if (guard.tooSoon()) return;
    guard.mark();
    setError(null);

    // The set's own weight, reps and role come from the plan entry (per-set weights),
    // with a weight changed on the spot on this set. An accepted drop records what the
    // weight was dropped from.
    const forLog = exerciseForLog(planEntry, weightOverride);
    const exercise = dropAccepted
      ? { ...forLog, originalWeight: forLog.originalWeight ?? baseEntry.weight }
      : forLog;
    const now = new Date();
    const set = createSetLog({
      exercise,
      actualReps: selectedReps,
      repsInReserve: selectedRepsInReserve,
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
        ? calculateE1RM(set.weight, selectedReps, selectedRepsInReserve)
        : null;

    setAwaitingSetId(set.id);
    try {
      await appendSet(session.id, set);
    } catch (err) {
      console.error("Failed to save set:", err);
      setAwaitingSetId(null);
      // A failed save must not block the retry.
      guard.release();
      setError("That set could not be saved. Try again.");
      return;
    }

    if (e1rm) flashE1rm(e1rm);

    clearPendingDropOn(activeIndex);

    // Another set of the entry after its rest, or on to whatever is next.
    const after = afterSetLogged(plan, activeIndex);
    if (after.view !== undefined) viewEntry(after.view);
    if (after.rest) restTimer.start(entry.tier, trainingPhase);
  }, [
    guard,
    session,
    entry,
    planEntry,
    weightOverride,
    baseEntry,
    isSaving,
    dropAccepted,
    selectedReps,
    selectedRepsInReserve,
    activeIndex,
    plan,
    trainingPhase,
    clearPendingDropOn,
    flashE1rm,
    viewEntry,
  ]);

  /**
   * Changes the weight of one set still to come of the entry on screen, for that set
   * alone; null puts it back to the plan. A done set is left alone.
   */
  const setSetWeight = useCallback(
    (setIndex: number, weight: number | null) => {
      if (!session || !planEntry || setIndex < planEntry.completedSets) return;
      const key = spotKey(activeIndex, setIndex);
      const planned = setChips[setIndex]?.planWeight;
      const value = weight != null && Number.isFinite(weight) ? clampWeight(weight, minWeight, maxWeight) : null;
      // Stepping back onto the plan's weight is the plan again.
      setSpotWeight(key, value, planned);
    },
    [session, planEntry, activeIndex, minWeight, maxWeight, setChips, setSpotWeight]
  );

  /** Changes the next set's weight on the spot; null goes back to the planned weight. */
  const setNextWeight = useCallback(
    (weight: number | null) => {
      if (planEntry) setSetWeight(planEntry.completedSets, weight);
    },
    [planEntry, setSetWeight]
  );

  // --- Drop sets -------------------------------------------------------------------
  const { dropPreview, dropSet, startDropSet, setDropWeight, setDropReps, logDropSet, endDropSets } = useDropSets({
    session,
    sets,
    plan,
    equipment,
    isSaving,
    endedEarly: endedAtIndex != null,
    trainingPhase,
    guard,
    draft: { drop, startDrop, continueDrop, setDropWeightAtLeast, setDropReps: setDraftDropReps, endDrop },
    setAwaitingSetId,
    setError,
    clearFlash,
  });

  const setSelectedReps = useCallback(
    (reps: number) => pickReps(setKey, reps),
    [setKey, pickReps]
  );
  const setSelectedRepsInReserve = useCallback(
    (repsInReserve: RepsInReserve | null) =>
      pickRepsInReserve(setKey, repsInReserve),
    [setKey, pickRepsInReserve]
  );

  const acceptDrop = useCallback(() => {
    if (dropSuggestion) {
      acceptDropOn(activeIndex, dropSuggestion.reducedWeight);
    }
  }, [dropSuggestion, activeIndex, acceptDropOn]);

  const keepWeight = useCallback(() => {
    dismissDrop(activeIndex);
  }, [activeIndex, dismissDrop]);

  // What an Undo tapped later has to check against: the sets and plan as they are then.
  const latest = useRef<{ sets: typeof sets; plan: WorkoutPlan }>({ sets, plan });
  useEffect(() => {
    latest.current = { sets, plan };
  }, [sets, plan]);

  /**
   * Corrects a set of this workout before it is finished: an edit to its reps, weight
   * or effort answer, or deleting the last set logged for an exercise. Nothing is previewed:
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
        clearFlash();
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
      clearPicks();
      // The rest that followed the deleted set is over: it is the next set to do.
      if (wasMostRecent) restTimer.skip();
      const index = entryIndexForSet(plan, original);
      if (index !== -1) {
        clearPendingDropOn(index);
        viewEntry(index);
      }
      clearFlash();
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
    [session, sets, plan, clearPicks, clearPendingDropOn, viewEntry, clearFlash]
  );

  const clearCorrectionError = useCallback(() => setCorrectionError(null), []);

  /**
   * Adds an exercise mid-workout (A9): APPENDED after every entry, never inserted, so
   * the weights changed on the spot (keyed by entry index) stay on their sets. Saved in
   * the session's `planEdits` as an `add` edit, so resume, the rebuild and the Log plan
   * it too, and laid on the frozen plan here. Rejects (nothing saved) when the workout
   * is not ready, the exercise is unknown or already in the workout, or the scheme is
   * not a whole number of sets and reps with a weight of at least 0.
   */
  const addExercise = useCallback(
    async (
      exerciseId: string,
      prescription: { sets: number; reps: number; weight: number; isAMRAP: boolean }
    ): Promise<void> => {
      if (!session || !basePlan || frozen?.sessionId !== session.id) throw new Error("The workout is still loading.");
      if (session.completedAt != null) throw new Error("This workout is already saved.");
      const exercise = EXERCISES[exerciseId];
      if (!exercise) throw new Error("That exercise is not in the library.");
      const { sets: count, reps, weight, isAMRAP } = prescription;
      if (!Number.isInteger(count) || count < 1 || !Number.isInteger(reps) || reps < 1) {
        throw new Error("Sets and reps must be whole numbers of at least 1.");
      }
      if (!Number.isFinite(weight) || weight < 0) throw new Error("The weight must be 0 or more.");
      const inPlan = basePlan.some(
        (e) => !e.isWarmUp && (e.exerciseId === exerciseId || e.substituteExerciseId === exerciseId)
      );
      if (inPlan) throw new Error(`${exercise.name} is already in this workout.`);
      const edit: PlanEdit = { kind: "add", exerciseId, sets: count, reps, weight, isAMRAP };
      await appendPlanEdit(session.id, edit);
      // The frozen plan is planned once per session: the new entry goes on its end.
      setFrozen((was) =>
        was && was.sessionId === session.id ? { sessionId: was.sessionId, plan: applyPlanEdits(was.plan, [edit]) } : was
      );
    },
    [session, basePlan, frozen]
  );

  /**
   * Lays a swap or removal during the workout (W11) on the session: each edit appended
   * with `appendPlanEdit` in order, then the frozen plan set to the one the change
   * returns (no entry moves). An entry replaced in place drops the weights changed on
   * the spot for it, which were the original's.
   */
  const applyChange = useCallback(
    async (change: MidWorkoutChange, index: number) => {
      if (!session) return;
      for (const edit of change.edits) await appendPlanEdit(session.id, edit);
      setFrozen((was) => (was && was.sessionId === session.id ? { sessionId: was.sessionId, plan: change.plan } : was));
      if (change.mode === "replaced") clearEntrySpotWeights(index);
      clearPendingDropOn(index);
    },
    [session, clearEntrySpotWeights, clearPendingDropOn]
  );

  const changeFor = useCallback(
    (exerciseId: string, tier: Tier) => {
      if (!session || !basePlan || frozen?.sessionId !== session.id) throw new Error("The workout is still loading.");
      if (session.completedAt != null) throw new Error("This workout is already saved.");
      const index = basePlan.findIndex((e) => !e.isWarmUp && e.exerciseId === exerciseId && e.tier === tier);
      return { plan: basePlan, sets, exerciseId, tier, index };
    },
    [session, basePlan, frozen, sets]
  );

  /**
   * Swaps an exercise not yet finished for one or more others (`midWorkoutSwap`): with
   * no set logged it is replaced in place, otherwise its logged sets stay and the rest is
   * dropped, the replacements appended. Saved as plan edits, so resume, the Log and the
   * rebuild agree; the screen goes to the first replacement. Rejects with an Error to
   * show (nothing saved) when the swap is not possible.
   */
  const swapExercise = useCallback(
    async (exerciseId: string, tier: Tier, replacements: readonly SwapReplacement[]): Promise<void> => {
      const { index, ...input } = changeFor(exerciseId, tier);
      const change = midWorkoutSwap({ ...input, replacements });
      await applyChange(change, index);
      const to = change.replacementIndexes[0];
      if (to != null && to >= 0) {
        restTimer.skip();
        viewEntry(to);
        clearFlash();
      }
    },
    [changeFor, applyChange, viewEntry, clearFlash]
  );

  /** Removes an exercise with no set logged (`midWorkoutRemove`): hidden, its warm-ups skipped. */
  const removeExercise = useCallback(
    async (exerciseId: string, tier: Tier): Promise<void> => {
      const { index, ...input } = changeFor(exerciseId, tier);
      await applyChange(midWorkoutRemove(input), index);
    },
    [changeFor, applyChange]
  );

  const jumpTo = useCallback((index: number) => {
    restTimer.skip();
    viewEntry(index);
    clearFlash();
  }, [viewEntry, clearFlash]);

  const endEarly = useCallback(() => {
    restTimer.skip();
    endAt(naturalIndex);
  }, [naturalIndex, endAt]);

  /** Applies progression and marks the workout finished. Resolves true on success. */
  const finish = useCallback(async (): Promise<boolean> => {
    if (!session || !settings || !liftStates || !template || isCompleting) return false;
    setIsCompleting(true);
    try {
      const completedAt = new Date();
      const startedAt = new Date(session.startedAt);
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
  ]);

  /** Discards the workout: a soft delete, so its sets and e1RM rows drop out everywhere. */
  const discard = useCallback(async () => {
    if (!sessionId) return;
    await discardWorkout(sessionId);
    useWorkoutStore.getState().reset();
  }, [sessionId]);

  let status: ActiveWorkoutStatus;
  if (
    session === undefined ||
    settings === undefined ||
    liftStates === undefined ||
    variantStates === undefined ||
    strengthSets === undefined
  ) {
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
    /** The entry on screen as its next set is done: that set's own weight and reps. */
    entry,
    /** The entry on screen as planned (its working weight; each set's own in `perSet`). */
    planEntry,
    isAMRAPSet,
    /** Every set of the entry on screen, done and to do, for the set chips. */
    setChips,
    /** The next set's weight as changed on the spot; null when it is as planned. */
    weightOverride,
    setNextWeight,
    /** Changes one set still to come of the entry on screen, by set index; null: back to plan. */
    setSetWeight,
    /** What a weight on screen moves by (plate or dumbbell step), and its lightest and heaviest values. */
    weightStep,
    minWeight,
    maxWeight,
    /** The weight a drop after the latest set starts at; null when none can be done. */
    dropPreview,
    /** The drop sets in progress; null when none is. */
    dropSet,
    startDropSet,
    setDropWeight,
    setDropReps,
    logDropSet,
    endDropSets,
    selectedReps,
    setSelectedReps,
    selectedRepsInReserve,
    setSelectedRepsInReserve,
    isSaving,
    logSet,
    e1rmFlash,
    dropSuggestion,
    acceptDrop,
    keepWeight,
    /** The planned weight of the current entry when a T2 drop was accepted on it; else null. */
    droppedFrom: dropAccepted && baseEntry && baseEntry.weight !== entry?.weight ? baseEntry.weight : null,
    prOpportunity,
    recentAMRAPReps,
    correctSet,
    correctionError,
    clearCorrectionError,
    /** Appends an exercise to the workout (never inserts); rejects with an Error to show. */
    addExercise,
    /** Swaps an unfinished exercise for one or more others; rejects with an Error to show. */
    swapExercise,
    /** Removes an exercise with no set logged; rejects with an Error to show. */
    removeExercise,
    jumpTo,
    endEarly,
    /** True once the user chose to end before the plan was done. */
    endedEarly: endedAtIndex != null,
    finish,
    discard,
    isCompleting,
    error,
  };
}

export type ActiveWorkout = ReturnType<typeof useActiveWorkout>;
