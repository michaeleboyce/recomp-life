// The rest countdown between sets. The timer owns it: it lives in the workout store
// (`isRestTimerActive`, `restTimeRemaining`, `restTimerDuration`, `restTier`), the
// RestTimer component ticks it and ends it, and the active workout only starts or
// skips it through `restTimer` below. Nothing else stores or derives rest state.
import { getRestSeconds } from "@/lib/restTimes";
import { nextStep, type WorkoutPlan } from "@/lib/workout";
import { useWorkoutStore } from "@/stores/workoutStore";
import type { Tier, TrainingPhase } from "@/types";
import { entryAfter, nextIncompleteIndex } from "./activeWorkoutLogic";

/** Starts and skips the rest countdown. */
export const restTimer = {
  /** Starts the rest that follows a set of `tier`, as long as the phase sets it. */
  start(tier: Tier, phase: TrainingPhase): void {
    useWorkoutStore.getState().startRestTimer(getRestSeconds(tier, phase), tier);
  },
  /** Ends any rest now. */
  skip(): void {
    useWorkoutStore.getState().skipRest();
  },
};

/** What follows a set logged on the entry at `index`. */
export interface AfterSet {
  /** True when the rest starts. */
  rest: boolean;
  /**
   * Where the screen goes: an entry index, or null for plan order. Left out when it
   * stays on the entry (more sets of it to do).
   */
  view?: number | null;
}

/**
 * What follows a set logged on the entry at `index` of `plan` (the plan before the set
 * counts): another set of the entry, after its rest; or, after the entry's last set,
 * on to whatever is next. A working lift's last set is still followed by its rest when
 * anything is left (the rest screen then shows how the set compared with its
 * forecast); a warm-up goes straight on.
 */
export function afterSetLogged(plan: WorkoutPlan, index: number): AfterSet {
  const step = nextStep(plan, index);
  if (step === "rest") return { rest: true };
  const after = plan.map((e, i) => (i === index ? { ...e, completedSets: e.completedSets + 1 } : e));
  const entry = plan[index];
  return {
    rest: step === "next-exercise" && !!entry && !entry.isWarmUp && nextIncompleteIndex(after) !== -1,
    view: entryAfter(after, index),
  };
}

/**
 * True when the rest starts once drop sets end: after drops on a working set, when the
 * workout was not ended early and anything is left to do.
 */
export function restsAfterDrops(rootTier: Tier, endedEarly: boolean, plan: WorkoutPlan): boolean {
  return rootTier !== "warmup" && !endedEarly && nextIncompleteIndex(plan) !== -1;
}
