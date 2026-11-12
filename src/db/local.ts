import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import type {
  WorkoutSession, SetLog, RunLog, ActivityLog, BodyweightLog,
  PainSorenessEntry, Estimated1RM, LiftState, UserProfile, ReadinessLog
} from '@/types';

export class RecompDatabase extends Dexie {
  workouts!: Table<WorkoutSession>;
  sets!: Table<SetLog>;
  runs!: Table<RunLog>;
  activities!: Table<ActivityLog>;
  bodyweight!: Table<BodyweightLog>;
  painEntries!: Table<PainSorenessEntry>;
  estimated1RMs!: Table<Estimated1RM>;
  liftStates!: Table<LiftState>;
  userProfile!: Table<UserProfile>;
  readinessLogs!: Table<ReadinessLog>;

  constructor() {
    super('recomp-life');
    this.version(1).stores({
      workouts: 'id, clientId, startedAt, templateId, synced',
      sets: 'id, clientId, exerciseId, completedAt, synced',
      runs: 'id, clientId, date, synced',
      bodyweight: 'id, clientId, date, synced',
      painEntries: 'id, date, region',
      estimated1RMs: 'id, exerciseId, date',
      liftStates: 'exerciseId',
      userProfile: 'id',
      readinessLogs: 'id, sessionId, date',
    });

    this.version(2).stores({
      workouts: 'id, clientId, startedAt, templateId, synced',
      sets: 'id, clientId, exerciseId, completedAt, synced',
      runs: 'id, clientId, date, synced',
      bodyweight: 'id, clientId, date, synced',
      painEntries: 'id, date, region',
      estimated1RMs: 'id, exerciseId, date',
      liftStates: 'exerciseId',
      userProfile: 'id',
      readinessLogs: 'id, sessionId, date',
    }).upgrade((tx) => {
      return tx.table('userProfile').toCollection().modify((profile) => {
        if (!profile.settings.exercisePreferences) {
          profile.settings.exercisePreferences = {};
        }
      });
    });

    this.version(3).stores({
      workouts: 'id, clientId, startedAt, templateId, synced',
      sets: 'id, clientId, exerciseId, completedAt, synced',
      runs: 'id, clientId, date, synced',
      bodyweight: 'id, clientId, date, synced',
      painEntries: 'id, date, region',
      estimated1RMs: 'id, exerciseId, date',
      liftStates: 'exerciseId',
      userProfile: 'id',
      readinessLogs: 'id, sessionId, date',
    }).upgrade((tx) => {
      return tx.table('liftStates').toCollection().modify((state) => {
        if (state.t3Weight === undefined) {
          state.t3Weight = 0;
        }
      });
    });

    this.version(4).stores({
      workouts: 'id, clientId, startedAt, templateId, synced',
      sets: 'id, clientId, exerciseId, completedAt, synced',
      runs: 'id, clientId, date, synced',
      bodyweight: 'id, clientId, date, synced',
      painEntries: 'id, clientId, date, region, synced',
      estimated1RMs: 'id, clientId, exerciseId, date, synced',
      liftStates: 'exerciseId, clientId, synced',
      userProfile: 'id, clientId, synced',
      readinessLogs: 'id, clientId, sessionId, date, synced',
    }).upgrade((tx) => {
      const tables = ['painEntries', 'estimated1RMs', 'liftStates', 'userProfile', 'readinessLogs'];
      return Promise.all(tables.map(tableName =>
        tx.table(tableName).toCollection().modify((row) => {
          if (!row.clientId) row.clientId = uuidv4();
          if (row.synced === undefined) row.synced = false;
        })
      )).then(() =>
        tx.table('sets').toCollection().modify((row) => {
          if (row.synced === undefined) row.synced = false;
        })
      );
    });

    // Yoga, cycling, hiking and other non-running sessions. Runs stay in `runs`.
    this.version(5).stores({
      activities: 'id, clientId, date, synced',
    });
  }
}

export const db = new RecompDatabase();
