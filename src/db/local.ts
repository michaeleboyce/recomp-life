import Dexie, { type Table } from 'dexie';
import type {
  WorkoutSession, SetLog, RunLog, BodyweightLog,
  PainSorenessEntry, Estimated1RM, LiftState, UserProfile, ReadinessLog
} from '@/types';

export class RecompDatabase extends Dexie {
  workouts!: Table<WorkoutSession>;
  sets!: Table<SetLog>;
  runs!: Table<RunLog>;
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
  }
}

export const db = new RecompDatabase();
