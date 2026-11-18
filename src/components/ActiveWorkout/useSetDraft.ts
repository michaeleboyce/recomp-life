"use client";

import { useCallback, useMemo, useState } from "react";
import { useWorkoutStore } from "@/stores/workoutStore";
import type { RepsInReserve } from "@/types";
import { clampReps } from "./activeWorkoutLogic";
import {
  choiceFor,
  continuedDrop,
  withoutEntrySpotWeights,
  withSpotWeight,
  type DropDraft,
  type SetChoice,
} from "./setDraft";
import type { SpotWeightsByKey } from "./setPlan";
import { loadSpotWeights, saveSpotWeights } from "./spotWeightStorage";

const NO_SPOT_WEIGHTS: SpotWeightsByKey = {};

/**
 * The draft of the next set, the one owner of what is about to be logged beyond the plan:
 * the reps and effort picked, the weights changed on the spot and an accepted T2 drop
 * (and a declined one). Nothing else reads or writes these.
 *
 * They do not share one lifetime, and that is kept as it was (see the map at the top of
 * `useActiveWorkout`):
 * - reps and effort picked: React state for one set (by `spotKey`); lost when the screen
 *   is left, the next set starts at its target.
 * - weights changed on the spot: React state mirrored to sessionStorage per workout, so
 *   a reload keeps them; each is for its own set.
 * - accepted and declined drops: the workout store, so leaving the screen and coming
 *   back keeps them and a reload does not (a logged drop set then says it instead).
 * - drop sets in progress (the next drop's weight and reps): React state for this
 *   session; lost when the screen is left (the drops logged are on the workout row).
 */
export function useSetDraft(sessionId: string | null) {
  const pendingDrop = useWorkoutStore((s) => s.pendingDrop);
  const dismissedDropEntryIndex = useWorkoutStore((s) => s.dismissedDropEntryIndex);

  const [repsChoice, setRepsChoice] = useState<SetChoice<number> | null>(null);
  const [repsInReserveChoice, setRepsInReserveChoice] = useState<SetChoice<RepsInReserve> | null>(null);

  // Weights changed on the spot from the set chips, each for its own set (by `spotKey`).
  // Kept per workout in sessionStorage, so a reload keeps them.
  const [spotChoice, setSpotChoice] = useState<{ sessionId: string; weights: SpotWeightsByKey } | null>(null);
  if (sessionId && spotChoice?.sessionId !== sessionId) {
    setSpotChoice({ sessionId, weights: loadSpotWeights(sessionId) });
  }
  const spotWeights = useMemo<SpotWeightsByKey>(
    () => (sessionId && spotChoice?.sessionId === sessionId ? spotChoice.weights : NO_SPOT_WEIGHTS),
    [sessionId, spotChoice]
  );

  /** Sets the weight of the set `key`; null or the plan's weight puts it back on the plan. */
  const setSpotWeight = useCallback(
    (key: string, value: number | null, planned: number | undefined) => {
      if (!sessionId) return;
      setSpotChoice((was) => {
        const weights = withSpotWeight(was?.sessionId === sessionId ? was.weights : {}, key, value, planned);
        saveSpotWeights(sessionId, weights);
        return { sessionId, weights };
      });
    },
    [sessionId]
  );

  /** Drops every weight changed on the spot for the entry at `index` (it was replaced). */
  const clearEntrySpotWeights = useCallback(
    (index: number) => {
      if (!sessionId) return;
      setSpotChoice((was) => {
        if (!was || was.sessionId !== sessionId) return was;
        const weights = withoutEntrySpotWeights(was.weights, index);
        saveSpotWeights(sessionId, weights);
        return { sessionId, weights };
      });
    },
    [sessionId]
  );

  const pickReps = useCallback((key: string, reps: number) => setRepsChoice({ key, value: clampReps(reps) }), []);
  const pickRepsInReserve = useCallback(
    (key: string, repsInReserve: RepsInReserve | null) =>
      setRepsInReserveChoice(repsInReserve == null ? null : { key, value: repsInReserve }),
    []
  );
  /** Forgets the reps and effort picked: the set starts over from its target. */
  const clearPicks = useCallback(() => {
    setRepsChoice(null);
    setRepsInReserveChoice(null);
  }, []);

  // Drop sets in progress, for this session only.
  const [dropDraft, setDropDraft] = useState<DropDraft | null>(null);
  const drop = dropDraft && sessionId && dropDraft.sessionId === sessionId ? dropDraft : null;
  /** Sets up drops from the set `parentId` (in the chain started by `rootId`). */
  const startDrop = useCallback(
    (rootId: string, parentId: string, weight: number, reps: number) => {
      if (!sessionId) return;
      setDropDraft({ sessionId, rootId, parentId, weight, reps, suggestedReps: reps });
    },
    [sessionId]
  );
  /** The next drop after `from` was logged as `parentId`. */
  const continueDrop = useCallback(
    (from: DropDraft, parentId: string, weight: number, reps: number) =>
      setDropDraft(continuedDrop(from, parentId, weight, reps)),
    []
  );
  /** The next drop's weight, never below `min`. */
  const setDropWeightAtLeast = useCallback(
    (min: number, weight: number) => setDropDraft((d) => (d ? { ...d, weight: Math.max(min, weight) } : d)),
    []
  );
  const setDropReps = useCallback(
    (reps: number) => setDropDraft((d) => (d ? { ...d, reps: clampReps(reps) } : d)),
    []
  );
  const endDrop = useCallback(() => setDropDraft(null), []);

  /** Accepts the T2 drop on the entry at `index`. */
  const acceptDrop = useCallback(
    (index: number, weight: number) => useWorkoutStore.getState().acceptDrop(index, weight),
    []
  );
  /** Declines the T2 drop on the entry at `index`. */
  const dismissDrop = useCallback((index: number) => useWorkoutStore.getState().dismissDrop(index), []);
  /** Forgets an accepted drop on the entry at `index`: a set logged, deleted or swapped there. */
  const clearPendingDropOn = useCallback((index: number) => {
    const store = useWorkoutStore.getState();
    if (store.pendingDrop?.entryIndex === index) store.clearPendingDrop();
  }, []);

  return {
    /** The reps picked for the set `key`, or undefined. */
    repsFor: (key: string) => choiceFor(repsChoice, key),
    /** The effort picked for the set `key`, or null. */
    repsInReserveFor: (key: string) => choiceFor(repsInReserveChoice, key) ?? null,
    pickReps,
    pickRepsInReserve,
    clearPicks,
    spotWeights,
    setSpotWeight,
    clearEntrySpotWeights,
    pendingDrop,
    dismissedDropEntryIndex,
    acceptDrop,
    dismissDrop,
    clearPendingDropOn,
    /** Drop sets in progress; null when none is. */
    drop,
    startDrop,
    continueDrop,
    setDropWeightAtLeast,
    setDropReps,
    endDrop,
  };
}
