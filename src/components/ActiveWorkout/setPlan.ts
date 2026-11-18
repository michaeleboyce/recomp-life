// Per-set weights and drop sets on the active workout screen. Pure: no React, no database.
import { roundToStep } from "@/lib/dbConversion";
import { EXERCISES } from "@/lib/exercises";
import { describePlateLoad } from "@/lib/plates";
import { rehydratePlan } from "@/lib/workout/rehydrate";
import { isNextSetAMRAP } from "@/lib/workout/logSet";
import { DROP_SET_LIGHTER_BY, entrySetsFor } from "@/lib/workout/setSelectors";
import type { WorkoutExerciseState, WorkoutPlan } from "@/lib/workout/types";
import type { EquipmentProfile, PlannedSet, RepsInReserve, SetLog, SetRole, WorkoutLocation } from "@/types";

export { DROP_SET_LIGHTER_BY };


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
 * set, exactly as `rehydratePlan` has it, except that a set logged at a weight changed
 * on the spot (`spotWeights`) is for that set alone: the entry resumes at its last set
 * logged at its own weight, or at its planned weight when there is none.
 */
export function screenPlan(
  basePlan: WorkoutPlan,
  sets: SetLog[],
  spotWeights: SpotWeightsByKey = {}
): WorkoutPlan {
  const working = sets.filter((set) => !isDropSet(set));
  const { plan } = rehydratePlan(basePlan, working);
  return plan.map((entry, i) => {
    if (entry.perSet) return { ...entry, weight: basePlan[i].weight };
    if (entry.isWarmUp || entry.completedSets === 0) return entry;
    const rows = entrySetsFor(working, entry.exerciseId, entry.tier);
    const atSpotWeight = (j: number) => rows[j] != null && spotWeights[spotKey(i, j)] === rows[j].weight;
    if (!atSpotWeight(entry.completedSets - 1)) return entry;
    let j = entry.completedSets - 2;
    while (j >= 0 && atSpotWeight(j)) j -= 1;
    const weight = j >= 0 ? rows[j].weight : basePlan[i].weight;
    return weight === entry.weight ? entry : { ...entry, weight };
  });
}

/**
 * Weights changed on the spot during a workout, for one set each, by `spotKey` (the
 * entry's index in the plan and the set's index in the entry).
 */
export type SpotWeightsByKey = Readonly<Record<string, number>>;

/** One entry's weights changed on the spot, by set index. */
export type SpotWeights = Readonly<Record<number, number>>;

/** The key of a set in `SpotWeightsByKey`. */
export function spotKey(entryIndex: number, setIndex: number): string {
  return `${entryIndex}:${setIndex}`;
}

/** The weights changed on the spot for one entry, by set index. */
export function spotWeightsOf(weights: SpotWeightsByKey, entryIndex: number): Record<number, number> {
  const prefix = `${entryIndex}:`;
  const out: Record<number, number> = {};
  for (const [key, weight] of Object.entries(weights)) {
    if (key.startsWith(prefix)) out[Number(key.slice(prefix.length))] = weight;
  }
  return out;
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
 * weight, with a home substitute's program weight (`originalWeight`) scaled by the same
 * ratio, as a weight edit before the workout or in the Log scales it. Credit then does
 * not depend on where the weight was changed. The entry itself without a change.
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
  const originalWeight =
    entry.originalWeight != null && entry.weight > 0
      ? Math.round((entry.originalWeight * weightOverride) / entry.weight)
      : entry.originalWeight;
  return { ...entry, weight: weightOverride, ...(originalWeight !== undefined ? { originalWeight } : {}) };
}

/** One set of an entry as the set chips show it. */
export interface SetChip {
  index: number;
  /** As logged for a done set; as planned (or as changed on the spot) otherwise. */
  weight: number;
  /** The set's planned weight (for a done set, as it was planned). */
  planWeight: number;
  /** A set still to come whose weight was changed on the spot. */
  changed: boolean;
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
 * many drops followed each), each one still to come at its planned weight or at the
 * weight changed on the spot for it (`spotWeights`, by set index).
 */
export function setChipsFor(
  entry: WorkoutExerciseState,
  sets: SetLog[],
  spotWeights: SpotWeights
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
        planWeight: planned.weight,
        changed: false,
        reps: logged.set.actualReps,
        role,
        state: "done",
        isAMRAP,
        drops: logged.drops.length,
      };
    }
    const current = index === entry.completedSets;
    const spot = spotWeights[index];
    const changed = spot != null && spot !== planned.weight;
    return {
      index,
      weight: changed ? spot : planned.weight,
      planWeight: planned.weight,
      changed,
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
  repsInReserve: RepsInReserve | null;
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
  const { parent, weight, actualReps, repsInReserve, now, id, clientId } = input;
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
    ...(repsInReserve != null ? { repsInReserve } : {}),
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
