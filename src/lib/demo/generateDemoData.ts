// A deterministic sample dataset for tests, screenshots and local development.
// Contract stub; the `metrics` package implements it.
import type {
  BodyweightLog,
  Estimated1RM,
  LiftState,
  PainSorenessEntry,
  ReadinessLog,
  RunLog,
  SetLog,
  WorkoutSession,
} from "@/types";

export interface DemoData {
  workouts: WorkoutSession[];
  sets: SetLog[];
  estimated1RMs: Estimated1RM[];
  bodyweight: BodyweightLog[];
  runs: RunLog[];
  readinessLogs: ReadinessLog[];
  painEntries: PainSorenessEntry[];
  /** The seeded lift states advanced to match the generated history. */
  liftStates: LiftState[];
}

/**
 * About eight weeks of plausible training ending at `now`: workouts rotating
 * A1/B1/A2/B2 every two to three days with steady progression and an occasional
 * failed T2, one home session in five, e1RM rows for each T1 AMRAP set, near-daily
 * morning weigh-ins trending down about 1 lb a week, six runs, readiness logs for
 * most workouts and one recent soreness entry. The same `now` always produces the
 * same data (ids included), so tests and screenshots are stable.
 */
export function generateDemoData(now: Date): DemoData {
  void now;
  throw new Error("not implemented: src/lib/demo contract stub");
}
