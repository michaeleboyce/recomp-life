// The accessories of a workout about to start (A6): chosen once inside the planning path
// (`planWorkoutStart`), from the same inputs on every path, each with its prescription,
// and recorded as `add` edits so resume, the rebuild and the Log plan exactly what was
// shown. Accessories never touch the rotation, T1 to T3 progression or pass and fail:
// they are only appended after the program's lifts. Pure: the clock is `now`.
// Spec: docs/plans/2026-11-17-accessories-design.md (A6).
import { getMonday } from "@/lib/dates";
import { EXERCISES } from "@/lib/exercises";
import {
  accessoryModeOf,
  accessoryPinsFor,
  accessoryPrescription,
  chooseAccessories,
  type AccessoryCandidate,
  type AccessoryPrescription,
  type ChooseAccessoriesResult,
} from "@/lib/accessories/index";
import { recoveryFromLastTrained, type MuscleValues } from "@/lib/muscleLoad";
import type { StrengthSet } from "@/lib/strength";
import type { AccessoryMode, MuscleId, PlanEdit, TrainingPhase, UserSettings, WorkoutLocation } from "@/types";
import { estimateSetSeconds } from "./duration";
import type { WorkoutExerciseState, WorkoutPlan } from "./types";

/** The settings the accessories are chosen and prescribed from. */
export type AccessorySettings = Pick<
  UserSettings,
  | "equipment"
  | "trainingPhase"
  | "exercisePreferences"
  | "exercisePreferencesByLocation"
  | "accessories"
  | "accessoryPins"
  | "accessoryWeights"
>;

/** Everything the accessories of a workout are worked out from, besides the day's lifts. */
export interface AccessorySource {
  settings: AccessorySettings;
  /** Every set as strength evidence, app and imported (`useStrengthEvidence` / `strengthSetsFrom`). */
  strengthSets: readonly StrengthSet[];
  /** The moment planned for; only its calendar day matters (see `accessoryDay`). */
  now: Date;
}

/** One accessory in the plan: its prescription and, when the app chose it, why. */
export interface PlannedAccessory {
  exerciseId: string;
  prescription: AccessoryPrescription;
  /** The scored pick behind it, with its reasons; null when it is not on today's list (blocked here, say). */
  pick: AccessoryCandidate | null;
}

export interface AccessoryPlan {
  mode: AccessoryMode;
  /** The scored list, whatever the mode: the sheet's "For today" and the swap alternatives read it. */
  choice: ChooseAccessoriesResult;
  /** The accessories planned before the user's own edits, in order. */
  planned: PlannedAccessory[];
  /** `planned` as `add` edits, saved on the session ahead of every other edit. */
  edits: PlanEdit[];
}

/**
 * The two instants the accessories of a day are worked out at, so every path on the
 * same calendar day gives the same picks and weights whenever it runs: the choice at
 * local noon (habit, this week's sets, recovery), the prescriptions at the end of the
 * day (every session logged that day counts).
 */
export function accessoryDay(now: Date): { choose: Date; prescribe: Date } {
  const choose = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
  const prescribe = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { choose, prescribe };
}

const timeOf = (date: Date | string) => new Date(date).getTime();
const counted = (set: StrengthSet) => set.role !== "warmup" && !set.provisional && Number.isFinite(timeOf(set.date));

/**
 * This week's sets per muscle up to `now` (Monday to Sunday), counted as the Muscles tab
 * counts them: primary 1, secondary 0.5, imported sets included, warm-ups left out.
 */
export function accessoryWeekSets(sets: readonly StrengthSet[], now: Date): MuscleValues {
  const from = getMonday(now).getTime();
  const to = now.getTime();
  const load: MuscleValues = {};
  for (const set of sets) {
    if (!counted(set)) continue;
    const at = timeOf(set.date);
    if (at < from || at > to) continue;
    const exercise = EXERCISES[set.exerciseId];
    if (!exercise) continue;
    for (const m of exercise.primaryMuscles) load[m] = (load[m] ?? 0) + 1;
    for (const m of exercise.secondaryMuscles) load[m] = (load[m] ?? 0) + 0.5;
  }
  return load;
}

/** When each muscle was last worked (primary or secondary) before `now`, app and imported. */
function lastTrained(sets: readonly StrengthSet[], now: Date): Partial<Record<MuscleId, Date>> {
  const last: Partial<Record<MuscleId, Date>> = {};
  for (const set of sets) {
    if (!counted(set)) continue;
    const at = timeOf(set.date);
    if (at > now.getTime()) continue;
    const exercise = EXERCISES[set.exerciseId];
    if (!exercise) continue;
    for (const m of [...exercise.primaryMuscles, ...exercise.secondaryMuscles]) {
      if (!last[m] || last[m]!.getTime() < at) last[m] = new Date(at);
    }
  }
  return last;
}

/** The prescription for one accessory on the day of `source.now` (`accessoryPrescription`). */
export function prescribeAccessory(exerciseId: string, source: AccessorySource): AccessoryPrescription {
  const own = source.strengthSets.filter((set) => set.exerciseId === exerciseId);
  return accessoryPrescription({
    exerciseId,
    sets: own,
    equipment: source.settings.equipment,
    handSetWeight: source.settings.accessoryWeights?.[exerciseId] ?? null,
    now: accessoryDay(source.now).prescribe,
  });
}

/**
 * The `add` edit that puts an accessory in a plan at its prescription: its sets, the top
 * of its rep range (every set is taken toward it, so the sets are as-many-as-possible),
 * and its weight (0 when there is none yet, to be entered).
 */
export function accessoryAddEdit(prescription: AccessoryPrescription): Extract<PlanEdit, { kind: "add" }> {
  return {
    kind: "add",
    exerciseId: prescription.exerciseId,
    sets: prescription.sets,
    reps: prescription.reps.max,
    weight: prescription.weight ?? 0,
    isAMRAP: true,
  };
}

export interface PlanAccessoriesInput {
  templateId: string;
  /** The day's T1 to T3 as resolved: the exercise performed and its sets. */
  mainLifts: readonly { exerciseId: string; sets: number }[];
  location: WorkoutLocation;
  source: AccessorySource;
  /**
   * Accessories named outright (a favourite's): planned in this order instead of the
   * app's choice, whatever the mode. Empty or absent: the mode decides.
   */
  selected?: readonly string[];
}

/**
 * The accessories of a workout, chosen once (`chooseAccessories`) and prescribed
 * (`accessoryPrescription`): with mode "auto" (the default) the picks, with "ask" or
 * "none" nothing, and accessories named outright always those. The choice is made at
 * `accessoryDay(now).choose`, so the same day gives the same picks.
 *
 * @evidence accessory-selection
 * @evidence accessory-progression
 */
export function planAccessories(input: PlanAccessoriesInput): AccessoryPlan {
  const { source, location } = input;
  const { settings } = source;
  const mode = accessoryModeOf(settings);
  const { choose } = accessoryDay(source.now);
  const phase = settings.trainingPhase ?? { mode: "maintaining" };
  const choice = chooseAccessories({
    templateId: input.templateId,
    mainLifts: input.mainLifts,
    location,
    equipment: settings.equipment,
    phase,
    ...(settings.exercisePreferences ? { preferences: settings.exercisePreferences } : {}),
    ...(settings.exercisePreferencesByLocation ? { preferencesByLocation: settings.exercisePreferencesByLocation } : {}),
    pins: accessoryPinsFor(settings, input.templateId),
    history: source.strengthSets,
    weekSetsSoFar: accessoryWeekSets(source.strengthSets, choose),
    recovery: recoveryFromLastTrained(lastTrained(source.strengthSets, choose), choose, phase),
    now: choose,
  });

  const selected = (input.selected ?? []).filter((id, i, all) => EXERCISES[id] && all.indexOf(id) === i);
  const candidates = [...choice.picks, ...choice.others];
  const ids =
    selected.length > 0 ? selected : mode === "auto" ? choice.picks.map((pick) => pick.exerciseId) : [];
  const planned = ids.map((exerciseId) => ({
    exerciseId,
    prescription: prescribeAccessory(exerciseId, source),
    pick: candidates.find((c) => c.exerciseId === exerciseId) ?? null,
  }));
  return { mode, choice, planned, edits: planned.map((p) => accessoryAddEdit(p.prescription)) };
}

/** One accessory of a plan as the screens show it: the entry, its prescription and why. */
export interface AccessoryRow {
  exerciseId: string;
  /** The plan entry (its weight and scheme are what will be done, edits included). */
  entry: WorkoutExerciseState;
  /** What the app prescribes for it today: the weight's basis, last time, the verdict. */
  prescription: AccessoryPrescription;
  /** Its place on today's scored list, with the reasons; null when it is not on it. */
  pick: AccessoryCandidate | null;
  /** True when the app chose it (not added or swapped in by the user). */
  chosen: boolean;
}

/**
 * The accessory entries of a plan, in order, each with its prescription (the planned
 * one, else worked out now for an accessory the user added) and its reasons.
 */
export function accessoryRowsOf(
  plan: WorkoutPlan,
  accessories: AccessoryPlan | null,
  source: AccessorySource
): AccessoryRow[] {
  const candidates = accessories ? [...accessories.choice.picks, ...accessories.choice.others] : [];
  return plan
    .filter((entry) => !entry.isWarmUp && entry.tier === "accessory")
    .map((entry) => {
      const planned = accessories?.planned.find((p) => p.exerciseId === entry.exerciseId);
      return {
        exerciseId: entry.exerciseId,
        entry,
        prescription: planned?.prescription ?? prescribeAccessory(entry.exerciseId, source),
        pick: planned?.pick ?? candidates.find((c) => c.exerciseId === entry.exerciseId) ?? null,
        chosen: planned != null,
      };
    });
}

/** Minutes an accessory adds to the session: its sets, each with the rest after it. */
export function accessoryMinutes(sets: number, phase?: TrainingPhase): number {
  return Math.max(1, Math.round((Math.max(0, sets) * estimateSetSeconds("accessory", phase)) / 60));
}
