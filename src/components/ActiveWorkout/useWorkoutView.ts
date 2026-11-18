"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkoutPlan } from "@/lib/workout";
import { useWorkoutStore } from "@/stores/workoutStore";
import type { WorkoutSession } from "@/types";
import { resolveActiveIndex } from "./activeWorkoutLogic";

const E1RM_FLASH_MS = 3000;

/**
 * The entry on screen: the one viewed while it has sets left, else the first unfinished
 * one (`naturalIndex`); past the end (`plan.length`) once the workout was ended early.
 */
export function screenIndexes(
  plan: WorkoutPlan,
  viewedEntryIndex: number | null,
  endedAtIndex: number | null
): { naturalIndex: number; activeIndex: number } {
  const naturalIndex = resolveActiveIndex(plan, viewedEntryIndex);
  return { naturalIndex, activeIndex: endedAtIndex != null ? plan.length : naturalIndex };
}

/**
 * View state of the active workout: which entry is shown, that the user ended early,
 * and the e1RM flash. None of it is a record of what was done, so none of it is saved.
 *
 * - viewed entry: the workout store (`viewedEntryIndex`), so leaving the screen and
 *   coming back keeps it; a reload does not, and the screen resumes at the first
 *   unfinished entry. Read only once the store is tracking this session (`storeReady`),
 *   so another workout's index is never used.
 * - ended early: React state, the index of the entry on screen when it was chosen.
 * - e1RM flash: React state, cleared after a few seconds.
 */
export function useWorkoutView(session: WorkoutSession | null | undefined) {
  const viewedEntryIndex = useWorkoutStore((s) => s.viewedEntryIndex);
  const storeSessionId = useWorkoutStore((s) => s.sessionId);
  const [endedAtIndex, setEndedAtIndex] = useState<number | null>(null);
  const [e1rmFlash, setE1rmFlash] = useState<number | null>(null);

  // The store tracks one workout at a time; another id clears what it held.
  useEffect(() => {
    if (session) {
      useWorkoutStore.getState().beginSession(session.id);
    }
  }, [session]);
  const storeReady = !!session && storeSessionId === session.id;

  const viewEntry = useCallback((index: number | null) => useWorkoutStore.getState().viewEntry(index), []);
  const flashE1rm = useCallback((value: number) => {
    setE1rmFlash(value);
    setTimeout(() => setE1rmFlash(null), E1RM_FLASH_MS);
  }, []);
  const clearFlash = useCallback(() => setE1rmFlash(null), []);

  return {
    /** True once the store is tracking this session (what it holds is this workout's). */
    storeReady,
    /** The entry the user went to, or null to follow the plan (always null until `storeReady`). */
    viewedEntryIndex: storeReady ? viewedEntryIndex : null,
    viewEntry,
    endedAtIndex,
    /** Ends the workout early at the entry at `index`. */
    endAt: setEndedAtIndex,
    e1rmFlash,
    flashE1rm,
    clearFlash,
  };
}
