// Rows for the Strength tab's Recovery and "Waiting for gym" sections. Pure.
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { barbellToBothHands, barbellToDumbbell } from "@/lib/dbConversion";
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
  /**
   * The dumbbell weight the lift's home substitute would need, from the same
   * conversion the Configure screen uses (`barbellToDumbbell` per hand, or
   * `barbellToBothHands` for a substitute held as one dumbbell). For a lift with no
   * home substitute it equals `t1Weight`.
   */
  dbEquivalent: number;
  /** `dbEquivalent` minus the heaviest dumbbell at home. */
  overage: number;
  /** True when `dbEquivalent` is per hand; false for one dumbbell held in both hands. */
  perHand: boolean;
  /** `dbEquivalent` with its unit: "60 lbs/hand" or "180 lbs". */
  dbLabel: string;
}

/**
 * Barbell lifts that are "waiting for gym": their T1 weight cannot be matched at
 * home. A lift is listed exactly when `adaptExerciseForHome`, called the way the
 * Configure screen calls it, gives the status "exceeds" or "no_substitute", so the
 * two screens agree. ("borderline", within 10 lbs of the limit, is still trained at
 * home and is not listed.)
 */
export function gymDebtItems(liftStates: LiftState[], maxDumbbellWeight: number): GymDebtItem[] {
  // Only the dumbbell limit decides the status; the other fields are placeholders.
  const equipment = { ...DEFAULT_USER_PROFILE.settings.equipment, maxDumbbellWeight };
  return liftStates.flatMap((state) => {
    const exercise = EXERCISES[state.exerciseId];
    if (!exercise || exercise.type !== "barbell") return [];
    const substitute = exercise.dumbbellAlternative
      ? EXERCISES[exercise.dumbbellAlternative]
      : undefined;
    const { adaptationStatus } = adaptExerciseForHome(
      exercise,
      state.t1Weight,
      equipment,
      substitute
    );
    if (adaptationStatus !== "exceeds" && adaptationStatus !== "no_substitute") return [];

    const perHand = substitute ? substitute.grip !== "both_hands" : false;
    const dbEquivalent = !substitute
      ? state.t1Weight
      : perHand
        ? barbellToDumbbell(state.t1Weight)
        : barbellToBothHands(state.t1Weight);
    return [
      {
        exerciseId: state.exerciseId,
        name: exercise.name,
        t1Weight: state.t1Weight,
        dbEquivalent,
        overage: dbEquivalent - maxDumbbellWeight,
        perHand,
        dbLabel: `${dbEquivalent} ${perHand ? "lbs/hand" : "lbs"}`,
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
