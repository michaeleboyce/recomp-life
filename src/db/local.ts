import Dexie, { type Table } from 'dexie';
import type {
  WorkoutSession, RunLog, ActivityLog, BodyweightLog,
  FavoriteWorkout, PainSorenessEntry, Estimated1RM, LiftState, UserProfile, ReadinessLog, LiftAdjustment,
  HealthDailyLog, Forecast, CoachEvent, VariantState, ImportedSessionRecord, SyncMetaRow
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
  // Saved workouts. Not part of the log: nothing is rebuilt from them.
  favoriteWorkouts!: Table<FavoriteWorkout>;
  /** Daily values imported from Apple Health; display only. */
  healthDaily!: Table<HealthDailyLog>;
  /** Stored predictions. Write-once: see src/lib/data/forecasts.ts. */
  /** Sessions imported from other apps' exports. History only; add-only. */
  importedSessions!: Table<ImportedSessionRecord>;
  forecasts!: Table<Forecast>;
  /** Changes that cannot be worked out from the rest of the data. */
  coachEvents!: Table<CoachEvent>;
  // Projections of the log: written only by applyRebuild (src/lib/data/derived.ts).
  liftStates!: Table<LiftState>;
  estimated1RMs!: Table<Estimated1RM>;
  /** Home exercises' own weights and progression. Local only: never synced. */
  variantStates!: Table<VariantState>;
  /** This device's sync bookkeeping (the "rebuild needed" marker). Local only: never synced. */
  syncMeta!: Table<SyncMetaRow, string>;

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
    // 13 Nov 2026: favourite workouts. Only the new table is declared.
    this.version(2).stores({
      favoriteWorkouts: 'id, clientId',
    });
    // 14 Nov 2026: stored forecasts and the coach's change log. Only the new tables.
    this.version(3).stores({
      forecasts: 'id, clientId, slot, kind, workoutId, exerciseId, madeAt',
      coachEvents: 'id, clientId, at, kind',
    });
    // 15 Nov 2026: home exercises' own states, derived like liftStates. Only the new table.
    this.version(4).stores({
      variantStates: 'id, liftId',
    });
    // 16 Nov 2026: sessions imported from other apps' exports. Only the new table.
    this.version(5).stores({
      importedSessions: 'id, clientId, startedAt, importBatchId',
    });
    // 17 Nov 2026: the "rebuild needed" marker a pull leaves (src/lib/sync/rebuildMarker.ts).
    this.version(6).stores({
      syncMeta: 'key',
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
