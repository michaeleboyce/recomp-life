// Builds the LogChange a set edit sheet saves. Pure.
import { v4 as uuidv4 } from "uuid";
import type { EditableSetFields, LogChange } from "@/lib/rebuild";
import type { RepsInReserve, SetLog } from "@/types";

export interface SetValues {
  actualReps: number;
  weight: number;
  /** null when no answer is recorded. */
  repsInReserve: RepsInReserve | null;
}

export const REPS_MAX = 100;
export const WEIGHT_MAX = 2000;

/** Parses the sheet's text fields (the answer is already one of the three); returns an error message instead when one is invalid. */
export function parseSetValues(
  reps: string,
  weight: string,
  repsInReserve: RepsInReserve | null
): SetValues | { error: string } {
  const r = Number(reps);
  if (reps.trim() === "" || !Number.isInteger(r) || r < 0 || r > REPS_MAX) {
    return { error: `Enter reps as a whole number from 0 to ${REPS_MAX}.` };
  }
  const w = Number(weight);
  if (weight.trim() === "" || !Number.isFinite(w) || w < 0 || w > WEIGHT_MAX) {
    return { error: `Enter a weight from 0 to ${WEIGHT_MAX} lbs.` };
  }
  return { actualReps: r, weight: w, repsInReserve };
}

/**
 * For a home set (a substitute standing in for a program lift), the barbell weight it
 * stands for at `weight`: its `originalWeight` scaled by the same ratio as the weight,
 * as a plan `weight` edit scales it (`applyPlanEdits`). Rotation credit reads the set's
 * `originalWeight` and the home exercise's credit reads its weight, so moving both
 * keeps an edit from changing one and not the other. Undefined for any other set.
 */
export function homeOriginalWeight(
  set: Pick<SetLog, "isSubstituted" | "substituteExerciseId" | "weight" | "originalWeight">,
  weight: number
): number | undefined {
  if (!set.isSubstituted || !set.substituteExerciseId || set.originalWeight == null || !(set.weight > 0)) {
    return undefined;
  }
  return weight === set.weight ? set.originalWeight : Math.round((set.originalWeight * weight) / set.weight);
}

/**
 * An `editSet` change with only the fields that differ; null when nothing changed. A
 * home set's new weight carries its scaled `originalWeight` (`homeOriginalWeight`).
 */
export function buildSetEdit(workoutId: string, set: SetLog, values: SetValues): LogChange | null {
  const patch: EditableSetFields = {};
  if (values.actualReps !== set.actualReps) patch.actualReps = values.actualReps;
  if (values.weight !== set.weight) {
    patch.weight = values.weight;
    const original = homeOriginalWeight(set, values.weight);
    if (original !== undefined) patch.originalWeight = original;
  }
  const repsInReserve = values.repsInReserve ?? undefined;
  // An explicit `repsInReserve: undefined` clears it.
  if (repsInReserve !== set.repsInReserve) patch.repsInReserve = repsInReserve;
  if (Object.keys(patch).length === 0) return null;
  return { kind: "editSet", workoutId, setId: set.id, patch };
}

/**
 * An `addSet` change: a new set of the same exercise and tier as `like`, numbered after
 * the last one and timed just after it. A home set also gets the barbell weight it
 * stands for, scaled to its weight (`homeOriginalWeight`).
 */
export function buildAddSet(
  workoutId: string,
  like: SetLog,
  setNumber: number,
  values: SetValues,
  newId: () => string = uuidv4
): LogChange {
  const id = newId();
  const set: SetLog = {
    id,
    clientId: id,
    exerciseId: like.exerciseId,
    tier: like.tier,
    setNumber,
    targetReps: like.targetReps,
    actualReps: values.actualReps,
    weight: values.weight,
    isAMRAP: false,
    completedAt: new Date(new Date(like.completedAt).getTime() + 1000),
    restAfterSeconds: 0,
    status: values.actualReps >= like.targetReps ? "completed" : "failed",
    isSubstituted: like.isSubstituted,
    location: like.location,
    synced: false,
  };
  if (like.substituteExerciseId) set.substituteExerciseId = like.substituteExerciseId;
  const original = homeOriginalWeight(like, values.weight);
  if (original !== undefined) set.originalWeight = original;
  if (values.repsInReserve !== null) set.repsInReserve = values.repsInReserve;
  return { kind: "addSet", workoutId, set };
}
