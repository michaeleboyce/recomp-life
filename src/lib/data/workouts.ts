// Data layer: workout writes. With src/lib/data/* and src/hooks/*, the only code
// outside src/db and src/lib/sync.ts that may import the Dexie database.
import type {
  Estimated1RM,
  LiftState,
  SetLog,
  SleepHours,
  StressLevel,
  WorkoutLocation,
  WorkoutModification,
} from "@/types";
import type { CompletionResult } from "@/lib/workout/types";

const NOT_IMPLEMENTED = "not implemented: src/lib/data contract stub";

export interface StartWorkoutInput {
  templateId: string;
  location: WorkoutLocation;
  includeWarmUps: boolean;
  selectedAccessories: string[];
  modifications?: WorkoutModification[];
  /** Saved as a readiness log linked to the new session when both values are given. */
  readiness?: { sleepHours: SleepHours; stressLevel: StressLevel };
}

/** Creates an unfinished workout (and its readiness log) and returns the session id. */
export async function startWorkout(input: StartWorkoutInput): Promise<string> {
  void input;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Persists one logged set immediately: writes it to `sets`, appends it to the
 * workout's own `sets` array and marks the workout unsynced, all in one transaction.
 * When `e1rm` is given it is stored in the same transaction.
 */
export async function appendSet(
  workoutId: string,
  set: SetLog,
  e1rm?: Estimated1RM
): Promise<void> {
  void workoutId;
  void set;
  void e1rm;
  throw new Error(NOT_IMPLEMENTED);
}

/**
 * Deletes a workout together with every set logged on it (by the ids in its `sets`
 * array) and every estimated-1RM row recorded for it. Safe to call for an id that
 * no longer exists.
 */
export async function discardWorkout(workoutId: string): Promise<void> {
  void workoutId;
  throw new Error(NOT_IMPLEMENTED);
}

/** Applies a computed completion: lift state rows and the session patch, in one transaction. */
export async function finishWorkout(
  workoutId: string,
  result: CompletionResult
): Promise<void> {
  void workoutId;
  void result;
  throw new Error(NOT_IMPLEMENTED);
}

/** Replaces one lift state row and marks it unsynced (manual weight edits). */
export async function saveLiftState(state: LiftState): Promise<void> {
  void state;
  throw new Error(NOT_IMPLEMENTED);
}

/** Stored e1RM values for one exercise, most recent first, at most `limit`. */
export async function getRecentE1RMs(exerciseId: string, limit: number): Promise<number[]> {
  void exerciseId;
  void limit;
  throw new Error(NOT_IMPLEMENTED);
}
