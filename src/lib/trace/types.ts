// What the explain functions read. Pure types: no React, no database, no clock.
import type {
  EquipmentProfile,
  LiftAdjustment,
  LiftState,
  PainSorenessEntry,
  PrescribedEntry,
  ProgressionOutcome,
  SleepHours,
  StressLevel,
  TrainingPhase,
  WorkoutLocation,
  WorkoutSession,
} from "@/types";
import type { WorkoutExerciseState } from "@/lib/workout/types";

/** One entry of a workout plan, as `buildWorkoutPlan` returns it. */
export type PlanEntry = WorkoutExerciseState;

/** The log behind "last time": finished workouts and what the program rules did in each. */
export interface TraceHistory {
  /** Workouts in any order; unfinished and deleted ones are ignored. */
  workouts: WorkoutSession[];
  /** `RebuildResult.outcomes`: the outcomes of each completed workout, by workout id. */
  outcomes: ReadonlyMap<string, readonly ProgressionOutcome[]>;
  /** Changes made to a lift outside a workout, to say why a weight moved between sessions. */
  adjustments?: LiftAdjustment[];
}

/** Today's readiness answers. Shown in the trace; they never change a weight. */
export interface TraceReadiness {
  sleepHours?: SleepHours;
  stressLevel?: StressLevel;
  /** The readiness score, 0 to 100, when one was worked out. */
  score?: number;
}

/** Everything an explanation may depend on, as of `now`. */
export interface TraceContext {
  now: Date;
  location: WorkoutLocation;
  equipment: EquipmentProfile;
  phase: TrainingPhase;
  /** The lift states the plan was built from. */
  liftStates: LiftState[];
  /**
   * What the program prescribed for the session the plan belongs to
   * (`WorkoutSession.prescribed`). It decides which planned lifts are the program's and
   * what a weight the user set does to them, exactly as finishing the workout will.
   * Left out, a T1, T2 or T3 lift that has a lift state is taken as the program's, at
   * what that state prescribes.
   */
  prescribed?: PrescribedEntry[];
  history?: TraceHistory;
  /** Pain and soreness entries; only pain that is still active is mentioned. */
  painEntries?: PainSorenessEntry[];
  readiness?: TraceReadiness;
}

/** The last finished session that had a lift at a tier, with what it did to it. */
export interface LastSession {
  workoutId: string;
  completedAt: Date;
  location: WorkoutLocation;
  /** The lift's working sets in that session, in logging order. */
  sets: WorkoutSession["sets"];
  outcome: ProgressionOutcome;
}
