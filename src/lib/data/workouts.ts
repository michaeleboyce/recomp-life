// Data layer: workout writes. With src/lib/data/* and src/hooks/*, the only code
// outside src/db and src/lib/sync.ts that may import the Dexie database.
//
// The workout row (with its sets) is the log. Lift states and e1RM rows are projections
// of it: nothing here writes a lift state, finishing a workout just runs the rebuild.
//
// Starting and finishing also feed the glass-box ledger: decision traces on the workout
// row, forecasts in their own table. Nothing the ledger needs is read or written inside
// the workout's own transaction, and a failure there never fails the workout: see
// `attemptLedgerWrite` and `sessionStartLedger`.
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/local";
import { e1rmsForWorkout } from "@/lib/rebuild";
import { overridesFromSession } from "@/lib/workout/buildPlan";
import { getPrescription } from "@/lib/workout/prescription";
import { excludeWarmUps } from "@/lib/workout/setSelectors";
import { planWorkoutStart } from "@/lib/workout/startPlan";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  Forecast,
  LiftState,
  PlanEdit,
  PrescribedEntry,
  RecordSource,
  SetLog,
  SleepHours,
  StressLevel,
  WorkoutLocation,
  WorkoutModification,
  WorkoutSession,
} from "@/types";
import { applyRebuild, readSettings, rebuildTables } from "./derived";
import {
  attemptLedgerWrite,
  readLedgerRecords,
  recordLiftForecasts,
  sessionStartLedger,
  strengthSetsFrom,
  writeSessionForecasts,
} from "./forecasts";
import { softDelete } from "./logEdits";
import { spendNextSetPlans } from "./nextSetPlans";
import { editStamps, newRowStamps } from "./stamp";

export interface StartWorkoutInput {
  templateId: string;
  location: WorkoutLocation;
  includeWarmUps: boolean;
  selectedAccessories: string[];
  modifications?: WorkoutModification[];
  /** Saved as a readiness log linked to the new session when both values are given. */
  readiness?: {
    sleepHours: SleepHours;
    stressLevel: StressLevel;
    /** Set when the sleep answer was filled in from a health source and left as it was. */
    sleepMinutes?: number;
    sleepSource?: RecordSource;
  };
  /**
   * What the program prescribes for this session. Left out, it is read from the
   * current lift states.
   */
  prescribed?: PrescribedEntry[];
  /** Changes the user made to the day before starting (swap, remove, add, scheme, weight). */
  planEdits?: PlanEdit[];
  /** The favourite the workout was started from; its "last used" time is updated. */
  favoriteId?: string;
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
 *
 * The workout also carries what the app decided and predicted for it, made from the
 * data as it stood before the workout existed, in one read, and built before the
 * write transaction opens: the decision traces for the plan it will run are saved on
 * the row (`decisions`), and its forecasts are written to the ledger once the row is
 * in, before any set can be logged. A failure in either is logged and the workout
 * starts all the same.
 */
export async function startWorkout(input: StartWorkoutInput): Promise<string> {
  const sessionId = uuidv4();
  const startedAt = new Date();
  const readiness =
    input.readiness?.sleepHours && input.readiness.stressLevel ? input.readiness : undefined;

  // Read before the workout exists; without it the workout simply has no ledger entries.
  const records = await attemptLedgerWrite("Reading the records a workout starts from", () =>
    readLedgerRecords(startedAt)
  );

  const template = WORKOUT_TEMPLATES[input.templateId];
  // Left out, the prescription the Ready screen would store: re-entry applied and, at
  // home, each lift's home exercise at its own (or seeded) weight. Without the records,
  // the plain prescription from the stored lift states.
  const prescribed =
    input.prescribed ??
    (records && template
      ? planWorkoutStart({
          template,
          liftStates: records.liftStates,
          location: input.location,
          equipment: records.settings.equipment,
          includeWarmUps: input.includeWarmUps,
          selectedAccessories: input.selectedAccessories,
          overrides: overridesFromSession({ modifications: input.modifications ?? [] }),
          variantStates: records.variantStates ?? [],
          strengthSets: strengthSetsFrom(records),
        }).prescribed
      : prescribedFor(input.templateId, records?.liftStates ?? (await db.liftStates.toArray())));
  const session: WorkoutSession = {
    id: sessionId,
    clientId: uuidv4(),
    templateId: input.templateId,
    location: input.location,
    startedAt,
    completedAt: null,
    totalDurationSeconds: 0,
    includeWarmUps: input.includeWarmUps,
    selectedAccessories: input.selectedAccessories,
    sets: [],
    preWorkoutPainEntries: [],
    modifications: input.modifications ?? [],
    prescribed,
    ...(input.planEdits?.length ? { planEdits: input.planEdits } : {}),
    ...(input.favoriteId ? { favoriteId: input.favoriteId } : {}),
    ...newRowStamps(),
  };
  // Built here, before the write transaction opens: it reads the whole history, and
  // a transaction must not be held open for that. Pure and guarded, it cannot throw.
  const ledger = records ? sessionStartLedger(records, session, readiness) : undefined;
  const forecasts: Forecast[] = ledger?.forecasts ?? [];

  const tables = [db.workouts, db.readinessLogs, db.favoriteWorkouts];
  await db.transaction("rw", tables, async () => {
    await db.workouts.add(ledger?.decisions ? { ...session, decisions: ledger.decisions } : session);

    const favorite = input.favoriteId
      ? await db.favoriteWorkouts.get(input.favoriteId)
      : undefined;
    if (favorite) {
      await db.favoriteWorkouts.update(favorite.id, {
        lastUsedAt: session.startedAt,
        ...editStamps(favorite),
      });
    }

    if (readiness) {
      await db.readinessLogs.add({
        id: uuidv4(),
        clientId: uuidv4(),
        sessionId,
        sleepHours: readiness.sleepHours,
        stressLevel: readiness.stressLevel,
        ...(readiness.sleepMinutes !== undefined && readiness.sleepSource
          ? { sleepMinutes: readiness.sleepMinutes, sleepSource: readiness.sleepSource }
          : {}),
        date: new Date(),
        ...newRowStamps(),
      });
    }
  });

  await attemptLedgerWrite("Saving the forecasts of a workout", () =>
    writeSessionForecasts(sessionId, forecasts)
  );

  return sessionId;
}

/**
 * Persists one logged set immediately: adds it to the workout's `sets` (or replaces
 * the set with the same id) and, in the same transaction, brings that workout's e1RM
 * rows in line with its sets, so the e1RM readers are live during a workout. A set
 * added to a workout that is already finished also re-runs progression.
 */
/**
 * Appends one edit to an unfinished workout's `planEdits` (an accessory added during
 * the workout, A9), so resume, the rebuild and the Log plan it as the screen did.
 * Rejects when the workout is gone or already finished.
 */
export async function appendPlanEdit(workoutId: string, edit: PlanEdit): Promise<void> {
  await db.transaction("rw", db.workouts, async () => {
    const workout = await db.workouts.get(workoutId);
    if (!workout || workout.deletedAt != null) throw new Error("That workout no longer exists.");
    if (workout.completedAt != null) throw new Error("That workout is already finished.");
    await db.workouts.update(workoutId, {
      planEdits: [...(workout.planEdits ?? []), edit],
      ...editStamps(workout),
    });
  });
}

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
 * (`completionContext`), runs the rebuild and uses up the next-session set plans it
 * logged (`spendNextSetPlans`), all in one transaction. Returns every
 * lift state as it stands afterwards. Finishing a workout that is already finished
 * changes nothing and returns the lift states as they are; a discarded or missing
 * workout rejects.
 *
 * After the rebuild, the estimated-max forecast for each lift just trained is written
 * to the ledger, at most one per lift per week. A failure there is logged and the
 * workout is finished all the same.
 */
export async function finishWorkout(
  workoutId: string,
  finish: FinishWorkoutInput
): Promise<LiftState[]> {
  const { liftStates, trained } = await db.transaction("rw", rebuildTables(), async () => {
    const workout = await db.workouts.get(workoutId);
    if (!workout) {
      throw new Error(`finishWorkout: workout ${workoutId} does not exist`);
    }
    // Discarded meanwhile (another tab, or the user): finishing it would count a
    // workout that is gone and spend its set plans.
    if (workout.deletedAt != null) {
      throw new Error(`finishWorkout: workout ${workoutId} was discarded`);
    }
    // Already finished (a double tap, a retry after a lost reply): nothing changes. A
    // second write would move its finish time, restamp its settings and spend set
    // plans saved since.
    if (workout.completedAt != null) {
      return { liftStates: await db.liftStates.toArray(), trained: [] };
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
        // Home exercises are capped by it: a rebuild of this session uses this one.
        maxDumbbellWeight: settings.equipment.maxDumbbellWeight,
      },
      ...editStamps(workout),
    });

    await applyRebuild();
    // The next-session set plans this workout logged are used up (E6); a discarded
    // workout never gets here, so its plans stay.
    await spendNextSetPlans(workout);
    return {
      liftStates: await db.liftStates.toArray(),
      trained: [...new Set(excludeWarmUps(workout.sets ?? []).map((set) => set.exerciseId))],
    };
  });

  if (trained.length > 0) {
    await attemptLedgerWrite("Forecasting the lifts of a finished workout", () =>
      recordLiftForecasts(trained, new Date(finish.completedAt))
    );
  }

  return liftStates;
}

/**
 * Soft-deletes a workout (with its readiness log) and rebuilds, so its e1RM rows go
 * and the delete can sync. Safe to call for an id that does not exist.
 */
export async function discardWorkout(workoutId: string): Promise<void> {
  await softDelete("workouts", workoutId);
}
