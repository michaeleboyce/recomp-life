// The change that undoes another, built from the log as it stands before the change is
// committed. Pure: the caller supplies the log and an id generator.
import { v4 as uuidv4 } from "uuid";
import { rebuildDerived, type EditableSetFields, type LogChange, type RebuildInput } from "@/lib/rebuild";
import type { AdjustableField, LiftAdjustment, LiftState } from "@/types";

function findWorkout(input: RebuildInput, workoutId: string) {
  const workout = input.workouts.find((w) => w.id === workoutId);
  if (!workout) throw new Error(`Workout not found: ${workoutId}`);
  return workout;
}

function findSet(input: RebuildInput, workoutId: string, setId: string) {
  const set = findWorkout(input, workoutId).sets.find((s) => s.id === setId);
  if (!set) throw new Error(`Set not found: ${setId}`);
  return set;
}

/**
 * Undoing a manual adjustment: there is no change that removes an adjustment, so the
 * undo is a second dated adjustment that sets the listed fields back to their values
 * just before the first one.
 */
function undoAdjustment(
  input: RebuildInput,
  adjustment: LiftAdjustment,
  newId: () => string
): LiftAdjustment {
  const state: LiftState | undefined = rebuildDerived(input).liftStates.find(
    (s) => s.exerciseId === adjustment.exerciseId
  );
  const set: LiftAdjustment["set"] = {};
  for (const field of Object.keys(adjustment.set) as AdjustableField[]) {
    const value = state?.[field];
    if (value !== undefined) Object.assign(set, { [field]: value });
  }
  const id = newId();
  return {
    id,
    clientId: id,
    exerciseId: adjustment.exerciseId,
    at: new Date(new Date(adjustment.at).getTime() + 1),
    source: "manual",
    set,
    note: "Undo of a manual change",
    synced: false,
  };
}

/** The change that restores the log to how it is now after `change` is applied. */
export function inverseChange(
  input: RebuildInput,
  change: LogChange,
  newId: () => string = uuidv4
): LogChange {
  switch (change.kind) {
    case "editSet": {
      const set = findSet(input, change.workoutId, change.setId);
      const patch: EditableSetFields = {};
      if ("actualReps" in change.patch) patch.actualReps = set.actualReps;
      if ("weight" in change.patch) patch.weight = set.weight;
      // Present with `undefined` clears an RPE the set did not have.
      if ("rpe" in change.patch) patch.rpe = set.rpe;
      return { kind: "editSet", workoutId: change.workoutId, setId: change.setId, patch };
    }
    case "addSet":
      return { kind: "deleteSet", workoutId: change.workoutId, setId: change.set.id };
    case "deleteSet":
      return {
        kind: "addSet",
        workoutId: change.workoutId,
        set: findSet(input, change.workoutId, change.setId),
      };
    case "editWorkout": {
      const workout = findWorkout(input, change.workoutId);
      const patch: { completedAt?: Date; location?: typeof workout.location } = {};
      if (change.patch.completedAt !== undefined && workout.completedAt != null) {
        patch.completedAt = new Date(workout.completedAt);
      }
      if (change.patch.location !== undefined) patch.location = workout.location;
      return { kind: "editWorkout", workoutId: change.workoutId, patch };
    }
    case "deleteWorkout":
      return { kind: "restoreWorkout", workoutId: change.workoutId };
    case "restoreWorkout":
      return { kind: "deleteWorkout", workoutId: change.workoutId };
    case "adjustLift":
      return { kind: "adjustLift", adjustment: undoAdjustment(input, change.adjustment, newId) };
  }
}
