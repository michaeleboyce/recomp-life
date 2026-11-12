// Rows for the Strength tab's Recovery and "Waiting for gym" sections. Pure.
import { EXERCISES } from "@/lib/exercises";
import { calculateRecoveryStatus, getMostRecent } from "@/lib/recovery";
import type { LiftState, RecoveryStatus, TrainingPhase } from "@/types";
import { LIFT_NAMES, MAIN_LIFTS } from "./lifts";

const DAY_MS = 86_400_000;

/** The old Program page's fallback when no dumbbell limit is set. */
export const DEFAULT_MAX_DUMBBELL = 50;

export interface GymDebtItem {
  exerciseId: string;
  name: string;
  t1Weight: number;
  /** Per-hand dumbbell equivalent: half the barbell weight, rounded. */
  dbEquivalent: number;
  overage: number;
}

/**
 * Barbell lifts whose T1 weight is beyond the home dumbbells (half the barbell
 * weight per hand, the old Program page's simplified comparison).
 */
export function gymDebtItems(liftStates: LiftState[], maxDumbbellWeight: number): GymDebtItem[] {
  return liftStates.flatMap((state) => {
    const exercise = EXERCISES[state.exerciseId];
    if (!exercise || exercise.type !== "barbell") return [];
    if (state.t1Weight / 2 <= maxDumbbellWeight) return [];
    const dbEquivalent = Math.round(state.t1Weight / 2);
    return [
      {
        exerciseId: state.exerciseId,
        name: exercise.name,
        t1Weight: state.t1Weight,
        dbEquivalent,
        overage: dbEquivalent - maxDumbbellWeight,
      },
    ];
  });
}

const STATUS_LABELS: Record<RecoveryStatus, string> = {
  recovering: "Recovering",
  ready: "Ready",
  primed: "Primed",
  detraining: "Long break",
};

export interface RecoveryRow {
  exerciseId: string;
  label: string;
  status: RecoveryStatus;
  trained: boolean;
  /** "Primed, 3 days ago" or "Not trained yet". */
  detail: string;
}

function daysAgoText(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

/**
 * One row per main lift with a lift state, using the same status as the Dashboard's
 * recovery bars. Empty when none of them has been trained yet.
 */
export function recoveryRows(
  liftStates: LiftState[],
  now: Date,
  phase: TrainingPhase
): RecoveryRow[] {
  const rows = MAIN_LIFTS.flatMap((id): RecoveryRow[] => {
    const state = liftStates.find((s) => s.exerciseId === id);
    if (!state) return [];
    const t1 = state.t1LastWorkoutDate ? new Date(state.t1LastWorkoutDate) : null;
    const t2 = state.t2LastWorkoutDate ? new Date(state.t2LastWorkoutDate) : null;
    const status = calculateRecoveryStatus(t1, t2, now, phase);
    const last = getMostRecent(t1, t2);
    const detail = last
      ? `${STATUS_LABELS[status]}, ${daysAgoText(Math.floor((now.getTime() - last.getTime()) / DAY_MS))}`
      : "Not trained yet";
    return [{ exerciseId: id, label: LIFT_NAMES[id].label, status, trained: last !== null, detail }];
  });
  return rows.some((r) => r.trained) ? rows : [];
}
