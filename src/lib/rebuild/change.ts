import type { SetLog, SetStatus, WorkoutSession } from "@/types";
import { timeOf } from "./e1rm";
import type { LogChange, LogState } from "./types";

/** Statuses an edit never re-derives: they record a decision, not a rep count. */
const KEPT_STATUSES: ReadonlySet<SetStatus> = new Set<SetStatus>([
  "autoregulated_load_drop",
  "skipped_pain",
  "reduced_run_fatigue",
  "reduced_equipment",
]);

/** The rule `createSetLog` uses: reps at or above target is "completed", else "failed". */
function statusAfterEdit(set: SetLog): SetStatus {
  if (KEPT_STATUSES.has(set.status)) return set.status;
  return set.actualReps >= set.targetReps ? "completed" : "failed";
}

/** `updatedAt` moves forward only when the caller supplied a time. */
function stamp(workout: WorkoutSession, at: number): WorkoutSession {
  if (at <= 0) return { ...workout, synced: false };
  return { ...workout, updatedAt: Math.max(at, (workout.updatedAt ?? 0) + 1), synced: false };
}

function findWorkout(log: LogState, workoutId: string): WorkoutSession {
  const workout = log.workouts.find((w) => w.id === workoutId);
  if (!workout) throw new Error(`Workout not found: ${workoutId}`);
  return workout;
}

function replaceWorkout(log: LogState, next: WorkoutSession): LogState {
  return {
    workouts: log.workouts.map((w) => (w.id === next.id ? next : w)),
    adjustments: [...log.adjustments],
  };
}

/**
 * The log after one change. Never mutates its input. `at` (epoch ms) is the time used
 * for the `deletedAt` and `updatedAt` stamps; with the default 0 `updatedAt` is left
 * alone and a delete is stamped 1, so the function stays pure.
 */
export function applyChange(log: LogState, change: LogChange, at: number = 0): LogState {
  switch (change.kind) {
    case "editSet": {
      const workout = findWorkout(log, change.workoutId);
      if (!workout.sets.some((s) => s.id === change.setId)) {
        throw new Error(`Set not found: ${change.setId} in workout ${change.workoutId}`);
      }
      const sets = workout.sets.map((set) => {
        if (set.id !== change.setId) return set;
        const edited: SetLog = { ...set, synced: false };
        if (change.patch.actualReps !== undefined) edited.actualReps = change.patch.actualReps;
        if (change.patch.weight !== undefined) edited.weight = change.patch.weight;
        // An explicit `rpe: undefined` clears the RPE.
        if ("rpe" in change.patch) {
          if (change.patch.rpe == null) delete edited.rpe;
          else edited.rpe = change.patch.rpe;
        }
        edited.status = statusAfterEdit(edited);
        return edited;
      });
      return replaceWorkout(log, stamp({ ...workout, sets }, at));
    }

    case "addSet": {
      const workout = findWorkout(log, change.workoutId);
      if (workout.sets.some((s) => s.id === change.set.id)) {
        throw new Error(`Set already exists: ${change.set.id} in workout ${change.workoutId}`);
      }
      return replaceWorkout(
        log,
        stamp({ ...workout, sets: [...workout.sets, { ...change.set }] }, at)
      );
    }

    case "deleteSet": {
      const workout = findWorkout(log, change.workoutId);
      if (!workout.sets.some((s) => s.id === change.setId)) {
        throw new Error(`Set not found: ${change.setId} in workout ${change.workoutId}`);
      }
      // Set numbers are facts about what was logged: nothing is renumbered.
      const sets = workout.sets.filter((s) => s.id !== change.setId);
      return replaceWorkout(log, stamp({ ...workout, sets }, at));
    }

    case "editWorkout": {
      const workout = findWorkout(log, change.workoutId);
      let next: WorkoutSession = { ...workout };

      if (change.patch.completedAt !== undefined) {
        if (workout.completedAt == null) {
          throw new Error(`Workout is not finished, its date cannot be moved: ${workout.id}`);
        }
        const delta = timeOf(change.patch.completedAt) - timeOf(workout.completedAt);
        next = {
          ...next,
          completedAt: new Date(timeOf(change.patch.completedAt)),
          startedAt: new Date(timeOf(workout.startedAt) + delta),
          sets: next.sets.map((set) => ({
            ...set,
            completedAt: new Date(timeOf(set.completedAt) + delta),
            synced: false,
          })),
        };
      }

      if (change.patch.location !== undefined) {
        const location = change.patch.location;
        next = {
          ...next,
          location,
          sets: next.sets.map((set) => ({ ...set, location, synced: false })),
        };
      }

      return replaceWorkout(log, stamp(next, at));
    }

    case "deleteWorkout": {
      const workout = findWorkout(log, change.workoutId);
      return replaceWorkout(log, stamp({ ...workout, deletedAt: at > 0 ? at : 1 }, at));
    }

    case "restoreWorkout": {
      const workout = findWorkout(log, change.workoutId);
      return replaceWorkout(log, stamp({ ...workout, deletedAt: null }, at));
    }

    case "adjustLift": {
      if (log.adjustments.some((a) => a.id === change.adjustment.id)) {
        throw new Error(`Adjustment already exists: ${change.adjustment.id}`);
      }
      return {
        workouts: [...log.workouts],
        adjustments: [...log.adjustments, { ...change.adjustment }],
      };
    }

    default: {
      const unknown: never = change;
      throw new Error(`Unknown log change: ${JSON.stringify(unknown)}`);
    }
  }
}
