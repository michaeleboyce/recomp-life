import { PROFILE_ID } from '@/lib/sync/registry';
import type { AdjustableField, LiftAdjustment, LiftState, UserProfile } from '@/types';

const SEED_LIFT_DEFAULTS = {
  clientId: 'seed', synced: false,
  t1LastResetWeight: null, t2LastResetWeight: null,
  t1LastWorkoutDate: null, t2LastWorkoutDate: null,
  deloadActive: false, deloadSessionsRemaining: 0,
  preDeloadT1Weight: null, preDeloadT2Weight: null,
  t2LoadDropCount: 0, recentE1RMs: [] as number[], recentAvgRepsInReserve: [] as number[], recentAMRAPReps: [] as number[],
} as const;

/**
 * The starting weights and stages every new account begins with. They reach the
 * database as `start` adjustments (see `startAdjustments`); the lift-state rows
 * themselves are rebuilt from the log. This file is public: these are generic numbers,
 * nobody's own.
 *
 * Conservative novice starts, the convention of beginner barbell programs (StrongLifts
 * 5×5 starts squat, bench press and overhead press with the empty 20 kg bar and the
 * deadlift at 40 kg; here the 45 lb bar and 95 lb). GZCLP's guide starts T1 at about 85%
 * and T2 at about 65% of a five-rep max; with no max known both start at these floors,
 * which the bar sets, and the first weeks' passes and last-set reps raise them quickly.
 * The T3 lifts start light enough for the program's 15 or more reps (lat pulldown 50 lb,
 * dumbbell row 20 lb), the app's choice. A lifter with history gets real suggestions from
 * Settings > Import history, and any weight can be set by hand.
 */
export const INITIAL_LIFT_STATES: Record<string, LiftState> = {
  squat: {
    exerciseId: "squat", ...SEED_LIFT_DEFAULTS,
    t1Weight: 45, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 45, t2Stage: "3x10", t2FailCount: 0, t3Weight: 0,
  },
  bench: {
    exerciseId: "bench", ...SEED_LIFT_DEFAULTS,
    t1Weight: 45, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 45, t2Stage: "3x10", t2FailCount: 0, t3Weight: 0,
  },
  deadlift: {
    exerciseId: "deadlift", ...SEED_LIFT_DEFAULTS,
    t1Weight: 95, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 95, t2Stage: "3x10", t2FailCount: 0, t3Weight: 0,
  },
  ohp: {
    exerciseId: "ohp", ...SEED_LIFT_DEFAULTS,
    t1Weight: 45, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 45, t2Stage: "3x10", t2FailCount: 0, t3Weight: 0,
  },
  lat_pulldown: {
    exerciseId: "lat_pulldown", ...SEED_LIFT_DEFAULTS,
    t1Weight: 0, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 0, t2Stage: "3x10", t2FailCount: 0, t3Weight: 50,
  },
  db_row: {
    exerciseId: "db_row", ...SEED_LIFT_DEFAULTS,
    t1Weight: 0, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 0, t2Stage: "3x10", t2FailCount: 0, t3Weight: 20,
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

/**
 * The stamp of a seeded row: older than any real write, so a default never wins a sync
 * conflict. 0, below the 1 that earlier versions seeded with: a push replaces a server
 * row only at an equal or newer stamp, so at 1 a new device's defaults would have
 * replaced the start adjustments (and with them the lift history) an account had
 * already synced from an earlier version with other starting weights; at 0 the synced
 * ones win, on push and on pull.
 */
export const SEED_STAMP = 0;

/**
 * One `start` adjustment per lift, dated before everything, holding its starting weights
 * and stages (`INITIAL_LIFT_STATES` unless others are given, as tests do).
 */
export function startAdjustments(
  states: Readonly<Record<string, LiftState>> = INITIAL_LIFT_STATES
): LiftAdjustment[] {
  return Object.values(states).map((state) => {
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

/**
 * A new device's starting profile: neutral placeholders, no personal details (this
 * file is public). It is seeded with SEED_STAMP, so it never wins a sync conflict:
 * a synced profile on the server replaces it on the first pull and is never
 * overwritten by it.
 */
export const DEFAULT_USER_PROFILE: Omit<UserProfile, 'id' | 'createdAt'> = {
  clientId: PROFILE_ID,
  synced: false,
  name: "",
  bodyweight: 180,
  heightInches: 70,
  settings: {
    theme: "dark",
    restTimerAudio: true,
    restTimerVibration: true,
    showWarmUps: true,
    showEffort: true,
    morningWeighInReminder: true,
    weighInReminderTime: "07:00",
    trainingPhase: {
      mode: "cutting",
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
