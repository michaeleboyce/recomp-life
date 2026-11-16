// The made-up lifter of the demo log (generateDemoData) and of the tests: the weights and
// stages its program starts at. Mid-range loads of a lifter with some training behind
// them, so warm-ups, plate maths, home conversions and reductions all have room to work.
// Not the app's default for a new account, which starts at the empty bar
// (INITIAL_LIFT_STATES in src/db/seed.ts). Pure.
import type { LiftState } from "@/types";

const DEMO_LIFT_DEFAULTS = {
  clientId: "seed", synced: false,
  t1LastResetWeight: null, t2LastResetWeight: null,
  t1LastWorkoutDate: null, t2LastWorkoutDate: null,
  deloadActive: false, deloadSessionsRemaining: 0,
  preDeloadT1Weight: null, preDeloadT2Weight: null,
  t2LoadDropCount: 0, recentE1RMs: [] as number[], recentAvgRPEs: [] as number[], recentAMRAPReps: [] as number[],
} as const;

/** The demo lifter's starting weights and stages, one state per program lift. */
export const DEMO_LIFT_STATES: Readonly<Record<string, LiftState>> = {
  squat: {
    exerciseId: "squat", ...DEMO_LIFT_DEFAULTS,
    t1Weight: 190, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 135, t2Stage: "3x10", t2FailCount: 0, t3Weight: 0,
  },
  bench: {
    exerciseId: "bench", ...DEMO_LIFT_DEFAULTS,
    t1Weight: 145, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 100, t2Stage: "3x10", t2FailCount: 0, t3Weight: 0,
  },
  deadlift: {
    exerciseId: "deadlift", ...DEMO_LIFT_DEFAULTS,
    t1Weight: 220, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 155, t2Stage: "3x10", t2FailCount: 0, t3Weight: 0,
  },
  ohp: {
    exerciseId: "ohp", ...DEMO_LIFT_DEFAULTS,
    t1Weight: 85, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 60, t2Stage: "3x10", t2FailCount: 0, t3Weight: 0,
  },
  lat_pulldown: {
    exerciseId: "lat_pulldown", ...DEMO_LIFT_DEFAULTS,
    t1Weight: 0, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 0, t2Stage: "3x10", t2FailCount: 0, t3Weight: 90,
  },
  db_row: {
    exerciseId: "db_row", ...DEMO_LIFT_DEFAULTS,
    t1Weight: 0, t1Stage: "5x3", t1FailCount: 0,
    t2Weight: 0, t2Stage: "3x10", t2FailCount: 0, t3Weight: 35,
  },
};
