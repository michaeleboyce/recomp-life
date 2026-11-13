import { PROFILE_ID } from '@/lib/sync/registry';
import type { AdjustableField, LiftAdjustment, LiftState, UserProfile } from '@/types';

const SEED_LIFT_DEFAULTS = {
  clientId: 'seed', synced: false,
  t1LastResetWeight: null, t2LastResetWeight: null,
  t1LastWorkoutDate: null, t2LastWorkoutDate: null,
  deloadActive: false, deloadSessionsRemaining: 0,
  preDeloadT1Weight: null, preDeloadT2Weight: null,
  t2LoadDropCount: 0, recentE1RMs: [] as number[], recentAvgRPEs: [] as number[], recentAMRAPReps: [] as number[],
} as const;

/**
 * The starting weights and stages. They reach the database as `start` adjustments (see
 * `startAdjustments`); the lift-state rows themselves are rebuilt from the log.
 */
export const INITIAL_LIFT_STATES: Record<string, LiftState> = {
  squat: {
    exerciseId: "squat", ...SEED_LIFT_DEFAULTS,
    t1Weight: 190, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 135, t2Stage: "3x10", t2FailCount: 0, t3Weight: 0,
  },
  bench: {
    exerciseId: "bench", ...SEED_LIFT_DEFAULTS,
    t1Weight: 145, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 100, t2Stage: "3x10", t2FailCount: 0, t3Weight: 0,
  },
  deadlift: {
    exerciseId: "deadlift", ...SEED_LIFT_DEFAULTS,
    t1Weight: 220, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 155, t2Stage: "3x10", t2FailCount: 0, t3Weight: 0,
  },
  ohp: {
    exerciseId: "ohp", ...SEED_LIFT_DEFAULTS,
    t1Weight: 85, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 60, t2Stage: "3x10", t2FailCount: 0, t3Weight: 0,
  },
  lat_pulldown: {
    exerciseId: "lat_pulldown", ...SEED_LIFT_DEFAULTS,
    t1Weight: 0, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 0, t2Stage: "3x10", t2FailCount: 0, t3Weight: 90,
  },
  db_row: {
    exerciseId: "db_row", ...SEED_LIFT_DEFAULTS,
    t1Weight: 0, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 0, t2Stage: "3x10", t2FailCount: 0, t3Weight: 35,
  },
};

const START_FIELDS: readonly AdjustableField[] = [
  't1Weight', 't1Stage', 't1FailCount', 't1LastResetWeight',
  't2Weight', 't2Stage', 't2FailCount', 't2LastResetWeight',
  't3Weight',
];

/** The id (and clientId) of a lift's `start` adjustment: the same on every device. */
export function startAdjustmentId(exerciseId: string): string {
  return `start:${exerciseId}`;
}

/** The stamp of a seeded row: older than any real write, so a default never wins a sync conflict. */
export const SEED_STAMP = 1;

/** One `start` adjustment per lift, dated before everything, holding its starting weights and stages. */
export function startAdjustments(): LiftAdjustment[] {
  return Object.values(INITIAL_LIFT_STATES).map((state) => {
    const id = startAdjustmentId(state.exerciseId);
    const set: Record<string, unknown> = {};
    for (const field of START_FIELDS) set[field] = state[field];
    return {
      id,
      clientId: id,
      exerciseId: state.exerciseId,
      at: new Date(0),
      source: 'start' as const,
      set: set as LiftAdjustment['set'],
      updatedAt: SEED_STAMP,
      deletedAt: null,
      synced: false,
    };
  });
}

export const DEFAULT_USER_PROFILE: Omit<UserProfile, 'id' | 'createdAt'> = {
  clientId: PROFILE_ID,
  synced: false,
  name: "Michael",
  bodyweight: 226,
  heightInches: 74,
  settings: {
    theme: "dark",
    restTimerAudio: true,
    restTimerVibration: true,
    showWarmUps: true,
    showRPE: true,
    morningWeighInReminder: true,
    weighInReminderTime: "07:00",
    trainingPhase: {
      mode: "cutting",
      dailyDeficit: 750,
      proteinGramsPerDay: 160,
    },
    equipment: {
      maxDumbbellWeight: 80,
      dumbbellIncrementLbs: 5,
      hasBench: true,
      hasResistanceBands: false,
      hasPullUpBar: false,
      gymBarbellIncrementLbs: 5,
      availablePlates: [45, 35, 25, 10, 5, 2.5],
      barWeight: 45,
    },
    exercisePreferences: {},
  },
};
