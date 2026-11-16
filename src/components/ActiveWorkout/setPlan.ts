// Per-set weights and drop sets on the active workout screen. Pure: no React, no database.
import { roundToStep } from "@/lib/dbConversion";
import { EXERCISES } from "@/lib/exercises";
import { describePlateLoad } from "@/lib/plates";
import { rehydratePlan } from "@/lib/workout/rehydrate";
import { isNextSetAMRAP } from "@/lib/workout/logSet";
import { entrySetsFor } from "@/lib/workout/setSelectors";
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout/types";
import type { EquipmentProfile, PlannedSet, SetLog, SetRole, WorkoutLocation } from "@/types";

/**
 * How much lighter a drop set starts than the set it continues, before rounding to the
 * equipment. Only a starting point: the weight is adjusted before the drop is logged.
 * The `drop-set-evidence` rule states it (see `dropSetWeight`).
 */
export const DROP_SET_LIGHTER_BY = 0.2;

/** Weight step for exercises loaded neither with plates nor with dumbbells (cables, machines). */
const OTHER_STEP_LBS = 5;

/** True for a drop set: a lighter set straight after another, with no rest. */
export function isDropSet(set: Pick<SetLog, "role">): boolean {
  return set.role === "drop";
}

/** "Ramp", "Back-off" or "Drop"; null for a working set. */
export function roleLabel(role: SetRole | undefined): string | null {
  switch (role) {
    case "ramp":
      return "Ramp";
    case "backoff":
      return "Back-off";
    case "drop":
      return "Drop";
    default:
      return null;
  }
}

/**
 * The step a weight moves by for an exercise: at the gym a barbell moves by two of the
 * smallest plate (one each side), a dumbbell by the dumbbell step anywhere (at home
 * every weight is a dumbbell's), anything else by 5 lb.
 */
export function weightStepFor(
  exerciseId: string,
  location: WorkoutLocation,
  equipment: EquipmentProfile
): number {
  const type = EXERCISES[exerciseId]?.type;
  if (type === "barbell" && location === "gym") {
    const smallest = Math.min(...equipment.availablePlates.filter((p) => p > 0));
    return Number.isFinite(smallest) ? smallest * 2 : equipment.gymBarbellIncrementLbs;
  }
  if (type === "dumbbell" || location === "home") {
    return equipment.dumbbellIncrementLbs > 0 ? equipment.dumbbellIncrementLbs : OTHER_STEP_LBS;
  }
  return OTHER_STEP_LBS;
}

/** The lightest weight an exercise can be set to: the empty bar at the gym, else nothing. */
export function minWeightFor(
  exerciseId: string,
  location: WorkoutLocation,
  equipment: EquipmentProfile
): number {
  return EXERCISES[exerciseId]?.type === "barbell" && location === "gym" ? equipment.barWeight : 0;
}

/**
 * The weight a drop set starts at after a set at `fromWeight`: `DROP_SET_LIGHTER_BY`
 * lighter, rounded to the equipment step (a load the plates make at the gym, the
 * dumbbell step at home), and always lighter than `fromWeight` while a lighter load
 * exists. Never below the empty bar, or below 0.
 *
 * @evidence drop-set-evidence
 */
export function dropSetWeight(
  fromWeight: number,
  exerciseId: string,
  location: WorkoutLocation,
  equipment: EquipmentProfile
): number {
  if (!(fromWeight > 0)) return 0;
  const step = weightStepFor(exerciseId, location, equipment);
  const min = minWeightFor(exerciseId, location, equipment);
  const barbell = min > 0;

  let weight = roundToStep(fromWeight * (1 - DROP_SET_LIGHTER_BY), step);
  if (weight >= fromWeight) weight = fromWeight - step;
  if (barbell && weight > min) {
    weight = describePlateLoad(weight, equipment.barWeight, equipment.availablePlates).loadableWeight;
  }
  return Math.max(min, weight, 0);
}

/**
 * The plan as the screen works with it: progress rehydrated from the logged sets, with
 * drop sets left out (a drop continues a set, it is not one of the entry's sets), and a
 * per-set entry keeping its working weight (`weight` is its heaviest working set; each
 * set's own weight is in `perSet`). A uniform entry resumes at the weight of its last
 * set, exactly as `rehydratePlan` has it.
 */
export function screenPlan(basePlan: WorkoutPlan, sets: SetLog[]): WorkoutPlan {
  const { plan } = rehydratePlan(
    basePlan,
    sets.filter((set) => !isDropSet(set))
  );
  return plan.map((entry, i) => (entry.perSet ? { ...entry, weight: basePlan[i].weight } : entry));
}

/**
 * The entry as shown for its next set: that set's own weight and rep target with
 * per-set weights, and a weight changed on the spot (`weightOverride`) when there is
 * one. The entry itself when nothing differs.
 */
export function nextSetView(
  entry: WorkoutExerciseState,
  weightOverride: number | null
): WorkoutExerciseState {
  const planned = entry.perSet?.[entry.completedSets];
  const weight = weightOverride ?? planned?.weight ?? entry.weight;
  const targetReps = planned?.reps ?? entry.targetReps;
  if (weight === entry.weight && targetReps === entry.targetReps) return entry;
  return { ...entry, weight, targetReps };
}

/**
 * The entry to log the next set from (`createSetLog`): with a weight changed on the
 * spot, a per-set entry carries it on that set alone (its working weight stays, so a
 * home substitute's program weight scales from it), a uniform entry takes it as its
 * weight. The entry itself without a change.
 */
export function exerciseForLog(
  entry: WorkoutExerciseState,
  weightOverride: number | null
): WorkoutExerciseState {
  if (weightOverride == null) return entry;
  if (entry.perSet) {
    const perSet = entry.perSet.map((set, i) =>
      i === entry.completedSets ? { ...set, weight: weightOverride } : set
    );
    return { ...entry, perSet };
  }
  return { ...entry, weight: weightOverride };
}

/** One set of an entry as the set chips show it. */
export interface SetChip {
  index: number;
  /** As logged for a done set; as planned (or as changed on the spot) otherwise. */
  weight: number;
  reps: number;
  role: SetRole;
  state: "done" | "current" | "todo";
  /** The set that carries the program's AMRAP (its last working set). */
  isAMRAP: boolean;
  /** Drops logged after this set. */
  drops: number;
}

/** The sets an entry plans, one per set: its per-set list, or `targetSets` of its weight. */
export function plannedSetsOf(
  entry: Pick<WorkoutExerciseState, "targetSets" | "targetReps" | "weight" | "perSet">
): PlannedSet[] {
  return (
    entry.perSet ??
    Array.from({ length: entry.targetSets }, () => ({ weight: entry.weight, reps: entry.targetReps }))
  );
}

/**
 * Every set of an entry for the set chips: the done ones as they were logged (with how
 * many drops followed each), the next one at its planned weight or the one changed on
 * the spot, the rest as planned.
 */
export function setChipsFor(
  entry: WorkoutExerciseState,
  sets: SetLog[],
  weightOverride: number | null
): SetChip[] {
  const rows = attachDrops(entrySetsFor(sets, entry.exerciseId, entry.tier)).filter(
    (row) => !isDropSet(row.set)
  );
  return plannedSetsOf(entry).map((planned, index) => {
    const role = planned.role ?? "work";
    const isAMRAP = isNextSetAMRAP({ ...entry, completedSets: index });
    const logged = index < entry.completedSets ? rows[index] : undefined;
    if (logged) {
      return {
        index,
        weight: logged.set.weight,
        reps: logged.set.actualReps,
        role,
        state: "done",
        isAMRAP,
        drops: logged.drops.length,
      };
    }
    const current = index === entry.completedSets;
    return {
      index,
      weight: current && weightOverride != null ? weightOverride : planned.weight,
      reps: planned.reps,
      role,
      state: current ? "current" : "todo",
      isAMRAP,
      drops: 0,
    };
  });
}

export interface BuildDropSetInput {
  /** The set the drop continues: a set of the entry, or the drop before this one. */
  parent: SetLog;
  weight: number;
  actualReps: number;
  rpe: number | null;
  now: Date;
  id: string;
  clientId: string;
}

/**
 * The row for a drop set: the same exercise, tier, location and set number as the set
 * it continues, role "drop" and `dropOf` that set's id. A drop has no target of its own
 * (it goes as far as it goes), so its target is the reps done and it is completed with
 * any reps at all; never the AMRAP set, never part of a pass or a fail. A home
 * substitute's program weight is scaled to the drop's weight.
 */
export function buildDropSet(input: BuildDropSetInput): SetLog {
  const { parent, weight, actualReps, rpe, now, id, clientId } = input;
  const originalWeight =
    parent.originalWeight != null && parent.weight > 0
      ? Math.round((parent.originalWeight * weight) / parent.weight)
      : undefined;
  return {
    id,
    clientId,
    exerciseId: parent.exerciseId,
    tier: parent.tier,
    setNumber: parent.setNumber,
    targetReps: actualReps,
    actualReps,
    weight,
    isAMRAP: false,
    completedAt: now,
    restAfterSeconds: 0,
    status: actualReps > 0 ? "completed" : "failed",
    ...(originalWeight != null ? { originalWeight } : {}),
    isSubstituted: parent.isSubstituted,
    ...(parent.substituteExerciseId ? { substituteExerciseId: parent.substituteExerciseId } : {}),
    ...(rpe != null ? { rpe } : {}),
    location: parent.location,
    role: "drop",
    dropOf: parent.id,
    synced: false,
  };
}

/** A set with the drops that continued it, in logging order. */
export interface SetWithDrops {
  set: SetLog;
  drops: SetLog[];
}

/**
 * The sets in their order, each with the drops that continued it (following `dropOf`
 * through earlier drops). A drop whose set is not in the list is a row of its own.
 */
export function attachDrops(sets: readonly SetLog[]): SetWithDrops[] {
  const byId = new Map(sets.map((set) => [set.id, set]));
  const rootOf = (drop: SetLog): SetLog | null => {
    const seen = new Set<string>();
    let current: SetLog | undefined = drop;
    while (current && isDropSet(current)) {
      if (!current.dropOf || seen.has(current.id)) return null;
      seen.add(current.id);
      current = byId.get(current.dropOf);
    }
    return current ?? null;
  };

  const rows: SetWithDrops[] = [];
  const rowOf = new Map<string, SetWithDrops>();
  for (const set of sets) {
    if (isDropSet(set)) {
      const root = rootOf(set);
      const row = root ? rowOf.get(root.id) : undefined;
      if (row) {
        row.drops.push(set);
        continue;
      }
    }
    const row = { set, drops: [] };
    rows.push(row);
    rowOf.set(set.id, row);
  }
  return rows;
}

/** The set (and its drops) that the set with `setId` belongs to; null when it is not logged. */
export function dropChainOf(sets: readonly SetLog[], setId: string): SetWithDrops | null {
  return (
    attachDrops(sets).find((row) => row.set.id === setId || row.drops.some((d) => d.id === setId)) ??
    null
  );
}
