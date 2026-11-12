import { create } from "zustand";
import type { Tier } from "@/types";
import type { WorkoutExerciseState } from "@/lib/workout/types";

// The type lives with the pure workout domain; re-exported for existing imports.
export type { WorkoutExerciseState };

/**
 * Transient UI state for the active workout. Nothing here is the record of what
 * was done: logged sets live on the workout row (see `useWorkout`) and the plan is
 * rebuilt from it, so losing this store (reload, app eviction) loses no progress.
 */
interface WorkoutStore {
  /** The workout this state belongs to. */
  sessionId: string | null;
  workoutStartTime: Date | null;
  /** Plan entry the user jumped to from the overview; null follows the plan order. */
  viewedEntryIndex: number | null;
  /** A T2 load drop the user accepted that no logged set reflects yet. */
  pendingDrop: { entryIndex: number; weight: number } | null;
  /** Plan entry whose T2 load-drop suggestion the user declined. */
  dismissedDropEntryIndex: number | null;

  isRestTimerActive: boolean;
  restTimeRemaining: number;
  restTimerDuration: number;
  /** Tier of the set the current rest follows. */
  restTier: Tier | null;

  /** Starts tracking a workout; a different id clears everything else first. */
  beginSession: (sessionId: string, startedAt: Date) => void;
  viewEntry: (index: number | null) => void;
  acceptDrop: (entryIndex: number, weight: number) => void;
  clearPendingDrop: () => void;
  dismissDrop: (entryIndex: number) => void;
  startRestTimer: (seconds: number, tier: Tier) => void;
  skipRest: () => void;
  addRestTime: (seconds: number) => void;
  reset: () => void;
}

const initialState = {
  sessionId: null as string | null,
  workoutStartTime: null as Date | null,
  viewedEntryIndex: null as number | null,
  pendingDrop: null as { entryIndex: number; weight: number } | null,
  dismissedDropEntryIndex: null as number | null,
  isRestTimerActive: false,
  restTimeRemaining: 0,
  restTimerDuration: 0,
  restTier: null as Tier | null,
};

const restCleared = {
  isRestTimerActive: false,
  restTimeRemaining: 0,
  restTimerDuration: 0,
  restTier: null,
};

export const useWorkoutStore = create<WorkoutStore>((set, get) => ({
  ...initialState,

  beginSession: (sessionId, startedAt) => {
    if (get().sessionId === sessionId) return;
    set({ ...initialState, sessionId, workoutStartTime: startedAt });
  },

  viewEntry: (index) => set({ viewedEntryIndex: index }),

  acceptDrop: (entryIndex, weight) => set({ pendingDrop: { entryIndex, weight } }),

  clearPendingDrop: () => set({ pendingDrop: null }),

  dismissDrop: (entryIndex) => set({ dismissedDropEntryIndex: entryIndex }),

  startRestTimer: (seconds, tier) =>
    set({
      isRestTimerActive: true,
      restTimeRemaining: seconds,
      restTimerDuration: seconds,
      restTier: tier,
    }),

  skipRest: () => set(restCleared),

  addRestTime: (seconds) =>
    set((state) => ({
      restTimeRemaining: state.restTimeRemaining + seconds,
      restTimerDuration: state.restTimerDuration + seconds,
    })),

  reset: () => set(initialState),
}));
