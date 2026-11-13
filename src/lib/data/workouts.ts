// Data layer: workout writes. With src/lib/data/* and src/hooks/*, the only code
// outside src/db and src/lib/sync.ts that may import the Dexie database.
//
// The workout row (with its sets) is the log. Lift states and e1RM rows are projections
// of it: nothing here writes a lift state, finishing a workout just runs the rebuild.
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/local";
import { e1rmsForWorkout } from "@/lib/rebuild";
import { getPrescription } from "@/lib/workout/prescription";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  LiftState,
  PrescribedEntry,
  SetLog,
  SleepHours,
  StressLevel,
  WorkoutLocation,
  WorkoutModification,
  WorkoutSession,
} from "@/types";
import { applyRebuild, readSettings, rebuildTables } from "./derived";
import { softDelete } from "./logEdits";
import { editStamps, newRowStamps } from "./stamp";

export interface StartWorkoutInput {
  templateId: string;
  location: WorkoutLocation;
  includeWarmUps: boolean;
  selectedAccessories: string[];
  modifications?: WorkoutModification[];
  /** Saved as a readiness log linked to the new session when both values are given. */
  readiness?: { sleepHours: SleepHours; stressLevel: StressLevel };
  /**
   * What the program prescribes for this session. Left out, it is read from the
   * current lift states.
   */
  prescribed?: PrescribedEntry[];
}

/** What a finished workout records besides its sets. */
export interface FinishWorkoutInput {
  completedAt: Date;
  totalDurationSeconds: number;
  endedEarly: boolean;
}

/**
 * The program's prescription for a template, from the given lift states: one entry per
 * T1, T2 and T3 exercise, with the stage for T1 and T2.
 */
export function prescribedFor(templateId: string, liftStates: LiftState[]): PrescribedEntry[] {
  const entries: PrescribedEntry[] = [];
  for (const exercise of WORKOUT_TEMPLATES[templateId]?.exercises ?? []) {
    if (exercise.tier !== "T1" && exercise.tier !== "T2" && exercise.tier !== "T3") continue;
    const state = liftStates.find((ls) => ls.exerciseId === exercise.exerciseId);
    const entry: PrescribedEntry = {
      exerciseId: exercise.exerciseId,
      tier: exercise.tier,
      ...getPrescription(exercise, state),
    };
    if (state && exercise.tier === "T1") entry.stage = state.t1Stage;
    if (state && exercise.tier === "T2") entry.stage = state.t2Stage;
    entries.push(entry);
  }
  return entries;
}

/**
 * Creates an unfinished workout (and its readiness log) and returns the session id.
 * The session always stores what the program prescribed when it started, so a later
 * edit to an earlier session never rewrites this one.
 */
export async function startWorkout(input: StartWorkoutInput): Promise<string> {
  const sessionId = uuidv4();

  await db.transaction("rw", db.workouts, db.readinessLogs, db.liftStates, async () => {
    const prescribed =
      input.prescribed ?? prescribedFor(input.templateId, await db.liftStates.toArray());
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
      prescribed,
      ...newRowStamps(),
    };
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
        ...newRowStamps(),
      });
    }
  });

  return sessionId;
}

/**
 * Persists one logged set immediately: adds it to the workout's `sets` (or replaces
 * the set with the same id) and, in the same transaction, brings that workout's e1RM
 * rows in line with its sets, so the e1RM readers are live during a workout. A set
 * added to a workout that is already finished also re-runs progression.
 */
export async function appendSet(workoutId: string, set: SetLog): Promise<void> {
  await db.transaction("rw", rebuildTables(), async () => {
    const workout = await db.workouts.get(workoutId);
    if (!workout) {
      throw new Error(`appendSet: workout ${workoutId} does not exist`);
    }

    const existing = workout.sets ?? [];
    const index = existing.findIndex((s) => s.id === set.id);
    const sets =
      index === -1 ? [...existing, set] : existing.map((s, i) => (i === index ? set : s));
    await db.workouts.update(workoutId, { sets, ...editStamps(workout) });

    if (workout.completedAt != null) {
      await applyRebuild();
      return;
    }

    // The same rows a rebuild would produce for this workout, without folding the log.
    const rows = workout.deletedAt == null ? e1rmsForWorkout({ ...workout, sets }) : [];
    const keep = new Set(rows.map((row) => row.id));
    const stale = (
      await db.estimated1RMs.where("workoutSessionId").equals(workoutId).primaryKeys()
    ).filter((id) => !keep.has(id as string));
    if (stale.length > 0) await db.estimated1RMs.bulkDelete(stale);
    if (rows.length > 0) await db.estimated1RMs.bulkPut(rows);
  });
}

/**
 * Marks the workout finished, stores the settings progression depends on
 * (`completionContext`) and runs the rebuild, all in one transaction. Returns every
 * lift state as it stands afterwards.
 */
export async function finishWorkout(
  workoutId: string,
  finish: FinishWorkoutInput
): Promise<LiftState[]> {
  return db.transaction("rw", rebuildTables(), async () => {
    const workout = await db.workouts.get(workoutId);
    if (!workout) {
      throw new Error(`finishWorkout: workout ${workoutId} does not exist`);
    }
    const settings = await readSettings();

    await db.workouts.update(workoutId, {
      completedAt: finish.completedAt,
      totalDurationSeconds: finish.totalDurationSeconds,
      // Stored only when true, as before; `undefined` removes a stale flag.
      endedEarly: finish.endedEarly ? true : undefined,
      completionContext: {
        phaseMode: settings.trainingPhase.mode,
        gymBarbellIncrementLbs: settings.equipment.gymBarbellIncrementLbs,
        dumbbellIncrementLbs: settings.equipment.dumbbellIncrementLbs,
      },
      ...editStamps(workout),
    });

    await applyRebuild();
    return db.liftStates.toArray();
  });
}

/**
 * Soft-deletes a workout (with its readiness log) and rebuilds, so its e1RM rows go
 * and the delete can sync. Safe to call for an id that does not exist.
 */
export async function discardWorkout(workoutId: string): Promise<void> {
  await softDelete("workouts", workoutId);
}

/**
 * Discards every unfinished workout started at least `maxAgeMs` ago and returns how
 * many were removed.
 */
export async function discardStaleWorkouts(
  maxAgeMs: number,
  now: number = Date.now()
): Promise<number> {
  const stale = (await db.workouts.toArray()).filter(
    (w) =>
      w.deletedAt == null &&
      w.completedAt == null &&
      now - new Date(w.startedAt).getTime() >= maxAgeMs
  );
  for (const workout of stale) {
    await discardWorkout(workout.id);
  }
  return stale.length;
}
