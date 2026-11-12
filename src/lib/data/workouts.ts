// Data layer: workout writes. With src/lib/data/* and src/hooks/*, the only code
// outside src/db and src/lib/sync.ts that may import the Dexie database.
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/local";
import { toRecentE1RMSeries } from "@/lib/e1rm";
import type {
  Estimated1RM,
  LiftState,
  SetLog,
  SleepHours,
  StressLevel,
  WorkoutLocation,
  WorkoutModification,
  WorkoutSession,
} from "@/types";
import type { CompletionResult } from "@/lib/workout/types";

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
  const sessionId = uuidv4();
  const session: WorkoutSession = {
    id: sessionId,
    clientId: uuidv4(),
    templateId: input.templateId,
    location: input.location,
    startedAt: new Date(),
    completedAt: null,
    totalDurationSeconds: 0,
    includeWarmUps: input.includeWarmUps,
    selectedAccessories: input.selectedAccessories,
    sets: [],
    preWorkoutPainEntries: [],
    modifications: input.modifications ?? [],
    synced: false,
  };

  await db.transaction("rw", db.workouts, db.readinessLogs, async () => {
    await db.workouts.add(session);
    const readiness = input.readiness;
    if (readiness?.sleepHours && readiness.stressLevel) {
      await db.readinessLogs.add({
        id: uuidv4(),
        clientId: uuidv4(),
        sessionId,
        sleepHours: readiness.sleepHours,
        stressLevel: readiness.stressLevel,
        date: new Date(),
        synced: false,
      });
    }
  });

  return sessionId;
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
  const tables = e1rm
    ? [db.sets, db.workouts, db.estimated1RMs]
    : [db.sets, db.workouts];

  await db.transaction("rw", tables, async () => {
    const workout = await db.workouts.get(workoutId);
    if (!workout) {
      throw new Error(`appendSet: workout ${workoutId} does not exist`);
    }

    await db.sets.put(set);
    if (e1rm) await db.estimated1RMs.put(e1rm);

    const existing = workout.sets ?? [];
    const index = existing.findIndex((s) => s.id === set.id);
    const sets =
      index === -1
        ? [...existing, set]
        : existing.map((s, i) => (i === index ? set : s));

    await db.workouts.update(workoutId, { sets, synced: false });
  });
}

/**
 * Deletes a workout together with every set logged on it (by the ids in its `sets`
 * array) and every estimated-1RM row recorded for it. Safe to call for an id that
 * no longer exists.
 */
export async function discardWorkout(workoutId: string): Promise<void> {
  await db.transaction("rw", db.workouts, db.sets, db.estimated1RMs, async () => {
    const workout = await db.workouts.get(workoutId);
    const setIds = (workout?.sets ?? []).map((s) => s.id);
    if (setIds.length > 0) await db.sets.bulkDelete(setIds);

    // workoutSessionId is not indexed, so filter in memory.
    const e1rmIds = (await db.estimated1RMs.toArray())
      .filter((e) => e.workoutSessionId === workoutId)
      .map((e) => e.id);
    if (e1rmIds.length > 0) await db.estimated1RMs.bulkDelete(e1rmIds);

    await db.workouts.delete(workoutId);
  });
}

/** Applies a computed completion: lift state rows and the session patch, in one transaction. */
export async function finishWorkout(
  workoutId: string,
  result: CompletionResult
): Promise<void> {
  await db.transaction("rw", db.liftStates, db.workouts, async () => {
    for (const state of result.liftStateUpdates) {
      await db.liftStates.put(state);
    }
    await db.workouts.update(workoutId, { ...result.sessionPatch, synced: false });
  });
}

/** Replaces one lift state row and marks it unsynced (manual weight edits). */
export async function saveLiftState(state: LiftState): Promise<void> {
  await db.liftStates.put({ ...state, synced: false });
}

/**
 * The recent e1RM series for one exercise (oldest first), ready to pass to
 * `computeCompletion` as `recentE1RMsByExercise[exerciseId]`.
 */
export async function getRecentE1RMSeries(exerciseId: string): Promise<number[]> {
  const entries = await db.estimated1RMs.where("exerciseId").equals(exerciseId).toArray();
  return toRecentE1RMSeries(entries);
}
