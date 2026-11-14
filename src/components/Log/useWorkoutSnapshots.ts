"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { loadRebuildInput } from "@/lib/data/derived";
import { rebuildDerived } from "@/lib/rebuild";
import type { LiftState } from "@/types";

export interface WorkoutSnapshots {
  /** Lift states right after the workout; undefined when it is not a finished, live workout. */
  after: LiftState[] | undefined;
  /** Lift states right after the finished workout before it; undefined for the first. */
  before: LiftState[] | undefined;
}

/**
 * The lift states as of one workout and as of the workout before it, from a rebuild of
 * the log (so an edit to this or an earlier session shows at once). Live; `undefined`
 * while loading.
 */
export function useWorkoutSnapshots(workoutId: string | null | undefined): WorkoutSnapshots | undefined {
  return useLiveQuery(async () => {
    if (!workoutId) return { after: undefined, before: undefined };
    const { snapshots } = rebuildDerived(await loadRebuildInput());
    // The engine fills `snapshots` in fold order, so the previous key is the session before.
    let before: LiftState[] | undefined;
    for (const [id, states] of snapshots) {
      if (id === workoutId) return { after: states, before };
      before = states;
    }
    return { after: undefined, before: undefined };
  }, [workoutId]);
}
