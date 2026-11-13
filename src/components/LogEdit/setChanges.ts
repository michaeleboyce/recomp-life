// Builds the LogChange a set edit sheet saves. Pure.
import { v4 as uuidv4 } from "uuid";
import type { EditableSetFields, LogChange } from "@/lib/rebuild";
import type { SetLog } from "@/types";

export interface SetValues {
  actualReps: number;
  weight: number;
  /** null when no RPE is recorded. */
  rpe: number | null;
}

export const REPS_MAX = 100;
export const WEIGHT_MAX = 2000;
export const RPE_MIN = 1;
export const RPE_MAX = 10;

/** Parses the sheet's text fields; returns an error message instead when one is invalid. */
export function parseSetValues(
  reps: string,
  weight: string,
  rpe: string
): SetValues | { error: string } {
  const r = Number(reps);
  if (reps.trim() === "" || !Number.isInteger(r) || r < 0 || r > REPS_MAX) {
    return { error: `Enter reps as a whole number from 0 to ${REPS_MAX}.` };
  }
  const w = Number(weight);
  if (weight.trim() === "" || !Number.isFinite(w) || w < 0 || w > WEIGHT_MAX) {
    return { error: `Enter a weight from 0 to ${WEIGHT_MAX} lbs.` };
  }
  if (rpe.trim() === "") return { actualReps: r, weight: w, rpe: null };
  const e = Number(rpe);
  if (!Number.isFinite(e) || e < RPE_MIN || e > RPE_MAX) {
    return { error: `Enter an RPE from ${RPE_MIN} to ${RPE_MAX}, or clear it.` };
  }
  return { actualReps: r, weight: w, rpe: e };
}

/** An `editSet` change with only the fields that differ; null when nothing changed. */
export function buildSetEdit(workoutId: string, set: SetLog, values: SetValues): LogChange | null {
  const patch: EditableSetFields = {};
  if (values.actualReps !== set.actualReps) patch.actualReps = values.actualReps;
  if (values.weight !== set.weight) patch.weight = values.weight;
  const rpe = values.rpe ?? undefined;
  // An explicit `rpe: undefined` clears it.
  if (rpe !== set.rpe) patch.rpe = rpe;
  if (Object.keys(patch).length === 0) return null;
  return { kind: "editSet", workoutId, setId: set.id, patch };
}

/**
 * An `addSet` change: a new set of the same exercise and tier as `like`, numbered after
 * the last one and timed just after it.
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
  if (values.rpe !== null) set.rpe = values.rpe;
  return { kind: "addSet", workoutId, set };
}
