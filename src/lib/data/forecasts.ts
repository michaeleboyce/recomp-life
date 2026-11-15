// Data layer: stored forecasts, and the records the forecasts, the decision traces and
// the readiness score are worked out from.
//
// A forecast is WRITE-ONCE: a row is added and never changes. Nothing in the app may
// update, put, modify or bulkPut this table; a test (forecasts.test.ts) scans the
// source for it. The sync engine's "synced" flag is written by src/lib/sync.ts, which
// reaches the table only through a generic lookup by name
// (`database.table(def.name).modify(...)`), not through `db.forecasts`. What became of
// a forecast (open, void, resolved) is worked out on read and never stored.
import type { Table } from "dexie";
import { v4 as uuidv4 } from "uuid";
// The plan the active workout screen runs: the session forecasts and the saved
// decisions must be about exactly that plan.
import { planForSession } from "@/lib/workout/planForSession";
import { db } from "@/db/local";
import {
  indexLog,
  makeHorizonForecasts,
  makeSessionForecasts,
  scoreForecasts,
  sdScales,
  type ForecastLog,
  type ForecastSource,
  type ScoredForecast,
} from "@/lib/forecast";
import { finishedBy } from "@/lib/forecast/log";
import {
  readinessFromRecords,
  readinessLevelShift,
  type ReadinessAnswers,
  type ReadinessToday,
} from "@/lib/readiness";
import { anchorToPrescription, emptyLiftState, rebuildDerived } from "@/lib/rebuild";
import { buildSessionDecisions, type TraceContext, type TraceReadiness } from "@/lib/trace";
import { describeNextWorkout } from "@/lib/workout/buildPlan";
import type { NextWorkoutDescription, WorkoutPlan } from "@/lib/workout/types";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  ActivityLog,
  BodyweightLog,
  Estimated1RM,
  Forecast,
  LiftAdjustment,
  LiftState,
  PainSorenessEntry,
  PrescribedEntry,
  ReadinessLog,
  ReadinessScore,
  RunLog,
  StoredTrace,
  UserSettings,
  WorkoutLocation,
  WorkoutSession,
} from "@/types";
import { readSettings } from "./derived";
import { newRowStamps } from "./stamp";

/** The tables a transaction needs to write or read forecasts. */
export function forecastTables(): Table[] {
  return [db.forecasts];
}

/**
 * Adds forecasts that are not stored yet and returns how many were added. A row whose id
 * already exists is skipped silently and the stored row is left exactly as it was; so is
 * a repeat of an id within `rows`. Sync stamps are set here.
 */
export async function writeForecasts(
  rows: readonly Forecast[],
  now: number = Date.now()
): Promise<number> {
  if (rows.length === 0) return 0;
  return db.transaction("rw", db.forecasts, async () => {
    const seen = new Set(
      (await db.forecasts.bulkGet(rows.map((row) => row.id)))
        .filter((row): row is Forecast => row !== undefined)
        .map((row) => row.id)
    );
    const fresh: Forecast[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      fresh.push({ ...row, ...newRowStamps(now) });
    }
    if (fresh.length > 0) await db.forecasts.bulkAdd(fresh);
    return fresh.length;
  });
}

/** Every stored forecast that is not soft-deleted, oldest made first. */
export async function listForecasts(): Promise<Forecast[]> {
  const rows = await db.forecasts.orderBy("madeAt").toArray();
  return rows.filter((row) => row.deletedAt == null);
}

// ---------------------------------------------------------------------------
// The records everything is worked out from
// ---------------------------------------------------------------------------

/**
 * One consistent read of every row the forecasts, the decision traces and the
 * readiness score depend on. Rows are as stored: deleted ones are included, because a
 * forecast for a deleted workout is void rather than missing. The functions below
 * leave them out where they must not count.
 */
export interface LedgerRecords {
  /** When the rows were read. The read hooks work everything out as of this time. */
  readAt: Date;
  workouts: WorkoutSession[];
  bodyweight: BodyweightLog[];
  liftStates: LiftState[];
  liftAdjustments: LiftAdjustment[];
  forecasts: Forecast[];
  readinessLogs: ReadinessLog[];
  runs: RunLog[];
  activities: ActivityLog[];
  painEntries: PainSorenessEntry[];
  /** The profile's settings, or the defaults before the database has been seeded. */
  settings: UserSettings;
}

/** The tables `readLedgerRecords` reads. */
export function ledgerTables(): Table[] {
  return [
    db.workouts,
    db.bodyweight,
    db.liftStates,
    db.liftAdjustments,
    db.forecasts,
    db.readinessLogs,
    db.runs,
    db.activities,
    db.painEntries,
    db.userProfile,
  ];
}

/** Reads the records in one transaction. An empty database gives empty lists. */
export async function readLedgerRecords(readAt: Date = new Date()): Promise<LedgerRecords> {
  return db.transaction("r", ledgerTables(), async () => ({
    readAt,
    workouts: await db.workouts.toArray(),
    bodyweight: await db.bodyweight.toArray(),
    liftStates: await db.liftStates.toArray(),
    liftAdjustments: await db.liftAdjustments.toArray(),
    forecasts: await db.forecasts.toArray(),
    readinessLogs: await db.readinessLogs.toArray(),
    runs: await db.runs.toArray(),
    activities: await db.activities.toArray(),
    painEntries: await db.painEntries.toArray(),
    settings: await readSettings(),
  }));
}

function live<T extends { deletedAt?: number | null }>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.deletedAt == null);
}

const timeOf = (date: Date | string | number) => new Date(date).getTime();

// ---------------------------------------------------------------------------
// Pure: records in, the inputs of the forecast, trace and readiness code out
// ---------------------------------------------------------------------------

/** The log stored forecasts are checked against. */
export function forecastLogFrom(records: LedgerRecords): ForecastLog {
  return { workouts: records.workouts, bodyweight: records.bodyweight };
}

/** Every forecast to score (the earliest row per slot) with its status at `now`, oldest first. */
export function scoredForecastsFrom(
  records: LedgerRecords,
  now: Date = records.readAt
): ScoredForecast[] {
  return scoreForecasts(records.forecasts, forecastLogFrom(records), now);
}

/**
 * The readiness score for a workout, measured against the user's own earlier
 * check-ins. Null when nothing is known that could move it (no answers, no earlier
 * training of today's muscles, no run, activity, soreness or pain): a bare starting
 * value would be a made-up number.
 */
export function readinessFrom(
  records: LedgerRecords,
  today: ReadinessToday,
  now: Date
): ReadinessScore | null {
  const score = readinessFromRecords(
    {
      readinessLogs: live(records.readinessLogs),
      workouts: live(records.workouts),
      runs: live(records.runs),
      activities: live(records.activities),
      painEntries: live(records.painEntries),
      phase: records.settings.trainingPhase,
    },
    today,
    now
  );
  return score.contributions.length > 0 ? score : null;
}

/**
 * Best estimated max per lift among the given workouts, by exercise id, from each
 * workout's rows as `e1rmsOf` gives them (a result with no usable time is left out,
 * as in `e1rmResults`).
 */
function bestE1RMs(
  workouts: WorkoutSession[],
  e1rmsOf: (workout: WorkoutSession) => Estimated1RM[]
): Record<string, number> {
  const best: Record<string, number> = {};
  for (const workout of workouts) {
    for (const row of e1rmsOf(workout)) {
      if (!Number.isFinite(timeOf(row.date))) continue;
      best[row.exerciseId] = Math.max(best[row.exerciseId] ?? -Infinity, row.estimated1RM);
    }
  }
  return best;
}

/**
 * What the forecast models may see at `now`: finished workouts, weigh-ins, the best
 * estimated max per lift among the workouts finished by then, and the widening factor
 * each kind's record calls for (`sdScales` over the stored forecasts, scored as of
 * `now`). `readiness` is the score for the workout being forecast; its shift moves
 * forecasts only.
 *
 * This runs when a workout starts and whenever Today reads its forecast, over the
 * whole history. The log is indexed once and shared by the scoring and the bests, so
 * each workout's estimated-max results are worked out once.
 */
export function forecastSourceFrom(
  records: LedgerRecords,
  now: Date,
  readiness?: Pick<ReadinessScore, "score" | "usual"> | null
): ForecastSource {
  const workouts = live(records.workouts).filter((workout) => workout.completedAt != null);
  const log = indexLog(forecastLogFrom(records));
  return {
    workouts,
    bodyweight: live(records.bodyweight),
    liftStates: records.liftStates,
    bestE1RMs: bestE1RMs(finishedBy(workouts, now.getTime()), log.e1rmsOf),
    settings: records.settings,
    ...(readiness ? { readinessShift: readinessLevelShift(readiness) } : {}),
    sdScale: sdScales(scoreForecasts(records.forecasts, log, now)),
    now,
  };
}

/**
 * What the explain functions read at `now`. `liftStates` must be the ones the plan
 * being explained was built from, and `prescribed` what the program prescribed for
 * that plan's session: it decides what a weight the user set does to a lift. The
 * outcomes of past workouts come from a rebuild of the log, the same one that
 * produces the lift states.
 */
export function traceContextFrom(
  records: LedgerRecords,
  input: {
    now: Date;
    location: WorkoutLocation;
    liftStates: LiftState[];
    prescribed?: PrescribedEntry[];
    readiness?: TraceReadiness;
  }
): TraceContext {
  const { settings } = records;
  const { outcomes } = rebuildDerived({
    workouts: records.workouts,
    adjustments: records.liftAdjustments,
    settings,
  });
  return {
    now: input.now,
    location: input.location,
    equipment: settings.equipment,
    phase: settings.trainingPhase,
    liftStates: input.liftStates,
    ...(input.prescribed ? { prescribed: input.prescribed } : {}),
    history: { workouts: records.workouts, outcomes, adjustments: records.liftAdjustments },
    painEntries: live(records.painEntries),
    ...(input.readiness ? { readiness: input.readiness } : {}),
  };
}

/**
 * The upcoming workout in the rotation with its plan, as `useNextWorkout` describes
 * it: at `location` (else the saved default, else the gym), warm-ups as the settings
 * say, no accessories.
 */
export function nextWorkoutFrom(
  records: LedgerRecords,
  location?: WorkoutLocation
): NextWorkoutDescription {
  const { settings } = records;
  return describeNextWorkout({
    completedWorkouts: live(records.workouts).filter((workout) => workout.completedAt != null),
    templates: WORKOUT_TEMPLATES,
    liftStates: records.liftStates,
    plan: {
      location: location ?? settings.defaultLocation ?? "gym",
      equipment: settings.equipment,
      includeWarmUps: settings.showWarmUps,
      selectedAccessories: [],
    },
  });
}

/**
 * The lifts of a plan for the readiness score, main lift first: the program's lifts,
 * as an earlier check-in is scored from its workout's prescription. A plan with none
 * (every program lift removed) falls back to whatever is in it.
 */
export function readinessExerciseIds(plan: WorkoutPlan): string[] {
  const working = plan.filter((entry) => !entry.isWarmUp);
  const program = working.filter((entry) => entry.tier !== "accessory");
  return [...new Set((program.length > 0 ? program : working).map((entry) => entry.exerciseId))];
}

/** Unfinished workouts started longer ago than this are not "today's workout". */
const IN_PROGRESS_WINDOW_MS = 24 * 60 * 60 * 1000;

function inProgressWorkout(records: LedgerRecords, now: Date): WorkoutSession | undefined {
  const cutoff = now.getTime() - IN_PROGRESS_WINDOW_MS;
  return live(records.workouts)
    .filter((workout) => workout.completedAt == null && timeOf(workout.startedAt) > cutoff)
    .sort((a, b) => timeOf(b.startedAt) - timeOf(a.startedAt))[0];
}

/**
 * Today's readiness score, or null when nothing is known that could move it.
 *
 * "Today's workout" is the workout in progress, with the sleep and energy answers
 * saved when it started; otherwise the next workout in the rotation, with `answers`
 * when the caller has some that are not saved yet (the pre-workout check).
 */
export function readinessTodayFrom(
  records: LedgerRecords,
  input: { now: Date; location?: WorkoutLocation; answers?: ReadinessAnswers | null }
): ReadinessScore | null {
  const { now } = input;
  const session = inProgressWorkout(records, now);
  if (session) {
    const saved = live(records.readinessLogs).find((log) => log.sessionId === session.id);
    return readinessFrom(
      records,
      {
        log: saved ?? input.answers ?? null,
        exerciseIds: readinessExerciseIds(sessionPlan(records, session).plan),
        sessionId: session.id,
      },
      now
    );
  }
  const next = nextWorkoutFrom(records, input.location);
  return readinessFrom(
    records,
    { log: input.answers ?? null, exerciseIds: readinessExerciseIds(next.plan) },
    now
  );
}

// ---------------------------------------------------------------------------
// When a workout starts: its decisions and its forecasts
// ---------------------------------------------------------------------------

/**
 * The plan a session runs and the lift states it is built from: the stored lift
 * states with the session's own prescription laid on top, exactly as `planForSession`
 * does it, so the traces read the same numbers the plan did. An unknown template
 * gives an empty plan.
 */
function sessionPlan(
  records: LedgerRecords,
  session: WorkoutSession
): { plan: WorkoutPlan; liftStates: LiftState[] } {
  const byId = new Map(records.liftStates.map((state) => [state.exerciseId, state]));
  for (const entry of session.prescribed ?? []) {
    const state = byId.get(entry.exerciseId) ?? emptyLiftState(entry.exerciseId);
    byId.set(entry.exerciseId, anchorToPrescription(state, entry));
  }
  const liftStates = [...byId.values()];
  const template = WORKOUT_TEMPLATES[session.templateId];
  const plan = template
    ? planForSession({ session, template, liftStates, equipment: records.settings.equipment })
    : [];
  return { plan, liftStates };
}

/** Everything the start of a session is explained and forecast from. */
export interface SessionStartInputs {
  /** The plan the session will run, home substitutes and the user's edits included. */
  plan: WorkoutPlan;
  context: TraceContext;
  source: ForecastSource;
  readiness: ReadinessScore | null;
}

/**
 * The plan of a session with the trace context and forecast source as they stood when
 * it started (`now` is its start time). `answers` are the sleep and energy answers
 * given with it; left out, the session's saved check-in is used. Null for an unknown
 * template. Pure.
 */
export function sessionStartInputs(
  records: LedgerRecords,
  session: WorkoutSession,
  answers?: ReadinessAnswers | null
): SessionStartInputs | null {
  if (!WORKOUT_TEMPLATES[session.templateId]) return null;
  const now = new Date(session.startedAt);
  const { plan, liftStates } = sessionPlan(records, session);
  answers ??= live(records.readinessLogs).find((log) => log.sessionId === session.id);
  const readiness = readinessFrom(
    records,
    { log: answers ?? null, exerciseIds: readinessExerciseIds(plan), sessionId: session.id },
    now
  );
  const context = traceContextFrom(records, {
    now,
    location: session.location,
    liftStates,
    prescribed: session.prescribed,
    readiness: {
      ...(answers ? { sleepHours: answers.sleepHours, stressLevel: answers.stressLevel } : {}),
      ...(readiness ? { score: readiness.score } : {}),
    },
  });
  return { plan, context, source: forecastSourceFrom(records, now, readiness), readiness };
}

/** A workout nothing has been logged in: the only kind a session forecast may be written for. */
function isUntouched(workout: WorkoutSession | undefined): workout is WorkoutSession {
  return (
    !!workout &&
    workout.deletedAt == null &&
    workout.completedAt == null &&
    (workout.sets ?? []).length === 0
  );
}

const reportFailure = (what: string, error: unknown) =>
  console.error(`${what} failed; carrying on without it`, error);

/**
 * Runs a ledger read or write that must never get in the user's way: a failure is
 * logged to the console and swallowed. Returns what it returned, or undefined when it
 * failed.
 */
export async function attemptLedgerWrite<T>(
  what: string,
  write: () => Promise<T>
): Promise<T | undefined> {
  try {
    return await write();
  } catch (error) {
    reportFailure(what, error);
    return undefined;
  }
}

/** The same guard for the pure steps: the explain functions and the models. */
function attempt<T>(what: string, work: () => T): T | undefined {
  try {
    return work();
  } catch (error) {
    reportFailure(what, error);
    return undefined;
  }
}

/** What a starting workout adds to the ledger. */
export interface SessionStartLedger {
  /** The traces to save on the workout row; absent when they could not be built. */
  decisions?: StoredTrace[];
  /** The session's forecast rows (ids `fc:<workoutId>:...`); empty when there are none. */
  forecasts: Forecast[];
}

/**
 * What the app decided and predicted for a workout that is about to start: the
 * decision traces for its plan and its forecast rows, both from `records`, which must
 * have been read before the workout existed. `answers` are the sleep and energy
 * answers given with it.
 *
 * Never throws, so it can run inside the transaction that creates the workout: the
 * traces and the forecasts are built separately, and a failure in either is logged
 * and leaves the other standing. An unknown template gives neither.
 */
export function sessionStartLedger(
  records: LedgerRecords,
  session: WorkoutSession,
  answers?: ReadinessAnswers | null
): SessionStartLedger {
  const ledger: SessionStartLedger = { forecasts: [] };
  const inputs = attempt("Reading what a workout starts from", () =>
    sessionStartInputs(records, session, answers)
  );
  if (!inputs) return ledger;
  const { plan, context, source } = inputs;
  const decisions = attempt("Explaining the plan of a workout", () =>
    buildSessionDecisions(plan, context)
  );
  if (decisions) ledger.decisions = decisions;
  ledger.forecasts =
    attempt("Forecasting a workout", () => makeSessionForecasts(session, plan, source)) ?? [];
  return ledger;
}

/**
 * Adds a workout's session forecasts to the ledger and returns how many were added.
 * Nothing is written for a workout that is missing, deleted, finished or already has
 * a set, so no forecast can be made after the fact (resuming an unfinished workout
 * included); the check and the write share one transaction. Rows already stored are
 * left as they are, so a second call adds nothing.
 */
export async function writeSessionForecasts(
  workoutId: string,
  rows: readonly Forecast[]
): Promise<number> {
  if (rows.length === 0) return 0;
  return db.transaction("rw", [db.workouts, db.forecasts], async () => {
    if (!isUntouched(await db.workouts.get(workoutId))) return 0;
    return writeForecasts(rows.filter((row) => row.workoutId === workoutId));
  });
}

// ---------------------------------------------------------------------------
// Forecasts for a date some weeks ahead
// ---------------------------------------------------------------------------

/**
 * Adds the horizon forecasts `wanted` picks, as things stand at `now`, leaving out
 * every slot (kind, subject, ISO week) that already has a row. Returns how many were
 * added. Another device can still write the same slot before the two sync; readers
 * score the earliest row per slot.
 */
async function recordHorizonForecasts(
  now: Date,
  wanted: (row: Forecast) => boolean
): Promise<number> {
  return db.transaction("rw", ledgerTables(), async () => {
    const records = await readLedgerRecords(now);
    const taken = new Set(records.forecasts.map((row) => row.slot));
    const rows = makeHorizonForecasts(forecastSourceFrom(records, now), uuidv4).filter(
      (row) => wanted(row) && !taken.has(row.slot)
    );
    return writeForecasts(rows);
  });
}

/**
 * The estimated-max forecast for each of the given lifts, at most one per lift per
 * week. A lift with too little history to project gets none.
 */
export function recordLiftForecasts(exerciseIds: readonly string[], now: Date): Promise<number> {
  const lifts = new Set(exerciseIds);
  if (lifts.size === 0) return Promise.resolve(0);
  return recordHorizonForecasts(
    now,
    (row) => row.kind === "e1rm4w" && row.exerciseId !== undefined && lifts.has(row.exerciseId)
  );
}

/** The bodyweight forecast, at most one per week. Too few weigh-ins give none. */
export function recordBodyweightForecast(now: Date): Promise<number> {
  return recordHorizonForecasts(now, (row) => row.kind === "bodyweight4w");
}
