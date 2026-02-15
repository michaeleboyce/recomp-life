import type { LiftState, UserProfile } from '@/types';

const SEED_LIFT_DEFAULTS = {
  clientId: 'seed', synced: false,
  t1LastResetWeight: null, t2LastResetWeight: null,
  t1LastWorkoutDate: null, t2LastWorkoutDate: null,
  deloadActive: false, deloadSessionsRemaining: 0,
  preDeloadT1Weight: null, preDeloadT2Weight: null,
  t2LoadDropCount: 0, recentE1RMs: [] as number[], recentAvgRPEs: [] as number[], recentAMRAPReps: [] as number[],
} as const;

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

export const DEFAULT_USER_PROFILE: Omit<UserProfile, 'id' | 'createdAt'> = {
  clientId: 'seed',
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
