// Contracts for the forecast package. Pure types: no React, no database, no clock.
// The stored row (`Forecast`) and its derived status live in src/types/glass.ts.
import type { RuleId } from "@/lib/evidence/rules";
import type {
  BodyweightLog,
  Estimated1RM,
  Forecast,
  ForecastKind,
  ForecastStatus,
  LiftState,
  UserSettings,
  WorkoutSession,
} from "@/types";

/** Everything a forecast model may see. Arrays may be in any order. */
export interface ForecastSource {
  /**
   * Finished workouts only. A model reads those finished by `now`; anything later, not
   * finished or deleted is ignored.
   */
  workouts: WorkoutSession[];
  bodyweight: BodyweightLog[];
  liftStates: LiftState[];
  /** Best estimated max per lift, in lbs, by exercise id. A lift with none is absent. */
  bestE1RMs: Record<string, number>;
  settings: UserSettings | null;
  /**
   * Readiness shift of the strength level as a fraction (-0.01 lowers it by 1%). It
   * moves forecasts only, never a weight.
   */
  readinessShift?: number;
  /**
   * Widening factor per kind from the track record (`sdScales`). A kind left out is
   * not widened. The three reps kinds are one model and all read `amrapReps`.
   */
  sdScale?: Partial<Record<ForecastKind, number>>;
  now: Date;
}

/** The log a stored forecast is checked against. Arrays may be in any order. */
export interface ForecastLog {
  /** Every workout row: finished or not, deleted or not. */
  workouts: WorkoutSession[];
  /** Every weigh-in row, deleted or not. */
  bodyweight: BodyweightLog[];
}

/** One measurement: when it was taken (epoch milliseconds) and its value. */
export interface Measurement {
  t: number;
  v: number;
}

/**
 * A log prepared for scoring many forecasts (`indexLog`): workouts are found by id and
 * each workout's estimated-max results are worked out once, however many forecasts
 * read them. It is still a log, so it can be passed wherever one is taken.
 */
export interface IndexedLog extends ForecastLog {
  /** The workout row with this id, deleted or not. */
  workoutById(id: string): WorkoutSession | undefined;
  /** The estimated-max rows the app keeps for a workout of this log (`e1rmsForWorkout`). */
  e1rmsOf(workout: WorkoutSession): Estimated1RM[];
  /** A lift's estimated-max results from live workouts, oldest first. */
  e1rmResultsOf(exerciseId: string): readonly Measurement[];
  /** Live weigh-ins, oldest first. */
  weighIns(): readonly Measurement[];
  /**
   * The live, finished workouts holding T1 sets of a lift (the lift itself or its
   * substitute), by finish time, oldest first (ties by id).
   */
  t1SessionsOf(exerciseId: string): readonly WorkoutSession[];
}

/**
 * Works out a forecast's status from the log. Pure: the same log gives the same
 * answer. Pass an `IndexedLog` when resolving many forecasts against one log.
 */
export type ForecastResolver = (forecast: Forecast, log: ForecastLog, now: Date) => ForecastStatus;

export interface ForecastKindDef {
  kind: ForecastKind;
  /** Plain name for screens. */
  label: string;
  /** The evidence rule that owns the model's numbers. */
  ruleId: RuleId;
  /** The quantity the forecast is about, in raw log terms: what the resolver measures. */
  estimand: string;
  /** "session": made when a workout starts. "horizon": made for a date some weeks ahead. */
  scope: "session" | "horizon";
  /** Written on every row, so a change of model can be told apart in the record. */
  modelVersion: string;
  resolve: ForecastResolver;
}

/** A stored forecast with the status the log gives it. */
export interface ScoredForecast {
  forecast: Forecast;
  status: ForecastStatus;
}
