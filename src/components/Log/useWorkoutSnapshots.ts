"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { loadRebuildInput } from "@/lib/data/derived";
import { rebuildDerived } from "@/lib/rebuild";
import type { LiftState, ProgressionOutcome } from "@/types";

export interface WorkoutSnapshots {
  /** Lift states right after the workout; undefined when it is not a finished, live workout. */
  after: LiftState[] | undefined;
  /**
   * Lift states the workout was evaluated against (after the adjustments made up to
   * its start and its stored prescription); undefined when `after` is.
   */
  before: LiftState[] | undefined;
  /**
   * What the program rules did to each T1, T2 and T3 lift of the workout, as the
   * progression code reported it; undefined when `after` is.
   */
  outcomes: ProgressionOutcome[] | undefined;
}

/**
 * The lift states around one workout and what the workout did to each program lift,
 * from a rebuild of the log (so an edit to this or an earlier session shows at once).
 * Live; `undefined` while loading.
 */
export function useWorkoutSnapshots(workoutId: string | null | undefined): WorkoutSnapshots | undefined {
  return useLiveQuery(async () => {
    if (!workoutId) return { after: undefined, before: undefined, outcomes: undefined };
    const rebuilt = rebuildDerived(await loadRebuildInput());
    return {
      after: rebuilt.snapshots.get(workoutId),
      before: rebuilt.before.get(workoutId),
      outcomes: rebuilt.outcomes.get(workoutId),
    };
  }, [workoutId]);
}
