// Rows for the Strength tab's Recovery and "Waiting for gym" sections. Pure.
import { displayLiftName } from "@/components/Today/todayModel";
import { DAY_MS } from "@/lib/dates";
import { EXERCISES } from "@/lib/exercises";
import type { ImportedLiftIndex } from "@/lib/import/history";
import { calculateRecoveryStatus, getMostRecent, lastTrainedDates } from "@/lib/recovery";
import type { StrengthSet } from "@/lib/strength";
import { reentryKey, resolveReentry } from "@/lib/workout/reentry";
import { chooseHomeVariant } from "@/lib/workout/variant";
import type { EquipmentProfile, LiftState, RecoveryStatus, TrainingPhase, VariantState } from "@/types";
import { LIFT_NAMES, MAIN_LIFTS } from "./lifts";


/** The old Program page's fallback when no dumbbell limit is set. */
export const DEFAULT_MAX_DUMBBELL = 50;

export interface GymDebtItem {
  exerciseId: string;
  name: string;
  /** The barbell T1 weight as it stands. */
  t1Weight: number;
  /**
   * The home exercise the lift is trained as at T1, at its own weight as lifted (the
   * heaviest dumbbell, or it would not be listed). Null when the lift has no home version.
   */
  home: { exerciseId: string; weight: number; perHand: boolean } | null;
  /**
   * The T1 weight of the next gym session: the re-entry weight after home sessions
   * (`resolveReentry`, the steps the home passes earned and the strength estimate),
   * else the barbell weight as it stands.
   */
  gymWeight: number;
  /** "Trained at home: Bulgarian split squat, 80 lbs a hand", or "No home version". */
  homeLabel: string;
  /** "255 lbs". */
  gymLabel: string;
}

export interface GymDebtInput {
  liftStates: LiftState[];
  variantStates: VariantState[];
  /** Every logged set as strength evidence, for the re-entry estimate. */
  strengthSets?: readonly StrengthSet[];
  equipment: EquipmentProfile;
}

/**
 * Barbell lifts that are "waiting for gym": at home their T1 is done as a home exercise
 * at the heaviest dumbbell (the plan's choice and weight, `chooseHomeVariant` after
 * re-entry), or they have no home version. Each says what it is trained as at home and
 * the weight the barbell starts at back at the gym, from the same re-entry rule the gym
 * plan uses. A home exercise still below the heaviest dumbbell keeps progressing at home
 * and is not listed.
 */
export function gymDebtItems(input: GymDebtInput): GymDebtItem[] {
  const { liftStates, variantStates, strengthSets, equipment } = input;
  const shared = { liftStates, variantStates, equipment, ...(strengthSets ? { strengthSets } : {}) };
  const home = resolveReentry({ ...shared, location: "home" });
  const gym = resolveReentry({ ...shared, location: "gym" });
  const max = equipment.maxDumbbellWeight;

  return liftStates.flatMap((state): GymDebtItem[] => {
    const exercise = EXERCISES[state.exerciseId];
    if (!exercise || exercise.type !== "barbell" || !exercise.requiresGym) return [];
    const choice = chooseHomeVariant({
      liftId: state.exerciseId,
      tier: "T1",
      liftState: home.liftStates.find((s) => s.exerciseId === state.exerciseId),
      variantStates: home.variantStates,
      equipment,
      ...(strengthSets ? { strengthSets } : {}),
    });
    if (choice && choice.weight < max) return [];

    const gymWeight = gym.reentries.get(reentryKey(state.exerciseId, "T1"))?.weight ?? state.t1Weight;
    const trainedAs = choice
      ? { exerciseId: choice.state.exerciseId, weight: choice.weight, perHand: choice.state.perHand }
      : null;
    return [
      {
        exerciseId: state.exerciseId,
        name: exercise.name,
        t1Weight: state.t1Weight,
        home: trainedAs,
        gymWeight,
        homeLabel: trainedAs
          ? `Trained at home: ${displayLiftName(trainedAs.exerciseId)}, ${trainedAs.weight} lbs${trainedAs.perHand ? " a hand" : ""}`
          : "No home version",
        gymLabel: `${gymWeight} lbs`,
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
 * When each exercise was last trained in a session imported from another app: the time
 * of its first set in the latest imported session with a set of it that is not a
 * warm-up, from the imported lift history (`importedLiftIndex`).
 */
export function importedLastTrained(index: ImportedLiftIndex): Partial<Record<string, Date>> {
  const out: Partial<Record<string, Date>> = {};
  for (const [exerciseId, history] of index) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      if (history[i].sets > 0) {
        out[exerciseId] = new Date(history[i].t);
        break;
      }
    }
  }
  return out;
}

/**
 * One row per main lift with a lift state, using the same status as the Dashboard's
 * recovery bars. A lift was last trained at the latest of its barbell sessions, the
 * sessions of the home exercises done for it (`lastTrainedDates`: home training is
 * training) and the imported sessions of the lift or of those home exercises
 * (`importedLast`, from `importedLastTrained`; counted as heavy sessions). Empty when
 * none of them has been trained yet.
 */
export function recoveryRows(
  liftStates: LiftState[],
  now: Date,
  phase: TrainingPhase,
  variantStates: readonly VariantState[] = [],
  importedLast: Partial<Record<string, Date>> = {}
): RecoveryRow[] {
  const rows = MAIN_LIFTS.flatMap((id): RecoveryRow[] => {
    const state = liftStates.find((s) => s.exerciseId === id);
    if (!state) return [];
    const dates = lastTrainedDates(state, variantStates);
    const homeIds = variantStates.filter((v) => v.liftId === id).map((v) => v.exerciseId);
    let t1 = dates.t1;
    for (const exerciseId of [id, ...homeIds]) t1 = getMostRecent(t1, importedLast[exerciseId] ?? null);
    const t2 = dates.t2;
    const status = calculateRecoveryStatus(t1, t2, now, phase);
    const last = getMostRecent(t1, t2);
    const detail = last
      ? `${STATUS_LABELS[status]}, ${daysAgoText(Math.floor((now.getTime() - last.getTime()) / DAY_MS))}`
      : "Not trained yet";
    return [{ exerciseId: id, label: LIFT_NAMES[id].label, status, trained: last !== null, detail }];
  });
  return rows.some((r) => r.trained) ? rows : [];
}
