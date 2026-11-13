import Dexie, { type Table } from 'dexie';
import type {
  WorkoutSession, RunLog, ActivityLog, BodyweightLog,
  PainSorenessEntry, Estimated1RM, LiftState, UserProfile, ReadinessLog, LiftAdjustment,
  HealthDailyLog
} from '@/types';

/** The current database. A fresh name: the schema started clean on 12 Nov 2026. */
export const DATABASE_NAME = 'recomp-life-2';
/** The database used before the clean schema. Its data was dropped on purpose. */
export const LEGACY_DATABASE_NAME = 'recomp-life';

export class RecompDatabase extends Dexie {
  // The log: the only truth. A workout holds its own sets.
  workouts!: Table<WorkoutSession>;
  liftAdjustments!: Table<LiftAdjustment>;
  runs!: Table<RunLog>;
  activities!: Table<ActivityLog>;
  bodyweight!: Table<BodyweightLog>;
  painEntries!: Table<PainSorenessEntry>;
  readinessLogs!: Table<ReadinessLog>;
  userProfile!: Table<UserProfile>;
  /** Daily values imported from Apple Health; display only. */
  healthDaily!: Table<HealthDailyLog>;
  // Projections of the log: written only by applyRebuild (src/lib/data/derived.ts).
  liftStates!: Table<LiftState>;
  estimated1RMs!: Table<Estimated1RM>;

  constructor() {
    super(DATABASE_NAME);
    // `synced` is a boolean and booleans cannot be indexed, so no table indexes it.
    this.version(1).stores({
      workouts: 'id, clientId, startedAt, templateId',
      runs: 'id, clientId, date',
      activities: 'id, clientId, date',
      bodyweight: 'id, clientId, date',
      painEntries: 'id, clientId, date',
      readinessLogs: 'id, clientId, sessionId, date',
      userProfile: 'id, clientId',
      healthDaily: 'id, clientId, day',
      liftAdjustments: 'id, clientId, exerciseId, at',
      liftStates: 'exerciseId',
      estimated1RMs: 'id, exerciseId, date, workoutSessionId',
    });
  }
}

export const db = new RecompDatabase();

const LEGACY_DROPPED_KEY = 'recomp-legacy-db-dropped';
let legacyDropStarted = false;

/**
 * Deletes the pre-reset database so its data does not linger on the device. Best
 * effort: it runs at most once per page load, remembers a success so later loads skip
 * it, and never rejects. A failure (private mode, another tab holding the old database
 * open) is retried on a later load.
 */
export async function dropLegacyDatabase(): Promise<void> {
  if (legacyDropStarted) return;
  legacyDropStarted = true;
  try {
    if (typeof indexedDB === 'undefined') return;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(LEGACY_DROPPED_KEY)) return;
    await Dexie.delete(LEGACY_DATABASE_NAME);
    if (typeof localStorage !== 'undefined') localStorage.setItem(LEGACY_DROPPED_KEY, '1');
  } catch {
    // Nothing depends on the old database; leave it and carry on.
  }
}
