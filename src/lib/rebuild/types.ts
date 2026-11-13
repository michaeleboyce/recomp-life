// Contracts for the rebuild engine: lift states and e1RM rows are projections of the
// log. Pure types, no React, no database. Rules: docs/plans/2026-11-12-edit-rebuild-plan.md.
import type {
  Estimated1RM,
  LiftAdjustment,
  LiftState,
  SetLog,
  T1Stage,
  T2Stage,
  Tier,
  UserSettings,
  WorkoutLocation,
  WorkoutSession,
} from "@/types";

export interface RebuildInput {
  /** Every workout row, finished or not, deleted or not. The engine filters and orders. */
  workouts: WorkoutSession[];
  /** Every adjustment row, deleted or not. */
  adjustments: LiftAdjustment[];
  /** Current settings: used for a workout that has no stored `completionContext`. */
  settings: UserSettings;
}

export interface RebuildResult {
  /** One row per lift, sorted by exerciseId. */
  liftStates: LiftState[];
  /** One row per eligible set of every non-deleted workout, oldest first. */
  e1rms: Estimated1RM[];
  /** Lift states as they stood right after each completed workout, by workout id. */
  snapshots: Map<string, LiftState[]>;
}

export type EditableSetFields = Partial<Pick<SetLog, "actualReps" | "weight" | "rpe">>;

export type LogChange =
  | { kind: "editSet"; workoutId: string; setId: string; patch: EditableSetFields }
  | { kind: "addSet"; workoutId: string; set: SetLog }
  | { kind: "deleteSet"; workoutId: string; setId: string }
  | {
      kind: "editWorkout";
      workoutId: string;
      /** A new `completedAt` shifts `startedAt` and every set time by the same amount. */
      patch: { completedAt?: Date; location?: WorkoutLocation };
    }
  | { kind: "deleteWorkout"; workoutId: string }
  | { kind: "restoreWorkout"; workoutId: string }
  | { kind: "adjustLift"; adjustment: LiftAdjustment };

/** The log a change is applied to. */
export interface LogState {
  workouts: WorkoutSession[];
  adjustments: LiftAdjustment[];
}

export interface TierPrescription {
  weight: number;
  stage?: T1Stage | T2Stage;
  sets: number;
  reps: number;
}

export interface NextWorkoutChange {
  exerciseId: string;
  tier: Extract<Tier, "T1" | "T2" | "T3">;
  before: TierPrescription;
  after: TierPrescription;
}

export interface PrChange {
  exerciseId: string;
  /** Best estimated 1RM before and after the change; null when there is none. */
  before: number | null;
  after: number | null;
}

export interface ChangePreview {
  /** Lifts whose next prescription differs after the change. */
  nextWorkout: NextWorkoutChange[];
  /** Lifts whose best estimated 1RM differs after the change. */
  prChanges: PrChange[];
  /** How many e1RM rows are added, removed or changed in value. */
  e1rmChanges: number;
  /** True when nothing derived changes: no next-workout, PR or e1RM difference. */
  unaffected: boolean;
}

export interface DerivedDiff {
  liftStatesToPut: LiftState[];
  /**
   * Stored lift-state rows (by exerciseId) the rebuild no longer produces, e.g. a
   * non-program lift whose only adjustment was deleted. Usually empty.
   */
  liftStateIdsToDelete: string[];
  e1rmsToPut: Estimated1RM[];
  e1rmIdsToDelete: string[];
  /** True when the stored derived rows already equal the rebuilt ones. */
  consistent: boolean;
}
