// Shared types for the pure workout domain (src/lib/workout). No React, no database.
import type {
  EquipmentProfile,
  LiftState,
  SetLog,
  Tier,
  UserSettings,
  WorkoutLocation,
  WorkoutSession,
  WorkoutTemplate,
} from "@/types";

/** One entry in a workout plan: a warm-up set, a working exercise or an accessory. */
export interface WorkoutExerciseState {
  exerciseId: string;
  substituteExerciseId?: string;
  tier: Tier;
  targetSets: number;
  targetReps: number;
  weight: number;
  originalWeight?: number;
  isAMRAP: boolean;
  isWarmUp: boolean;
  completedSets: number;
}

export type WorkoutPlan = WorkoutExerciseState[];

export interface Prescription {
  weight: number;
  sets: number;
  reps: number;
}

export interface BuildPlanInput {
  template: WorkoutTemplate;
  liftStates: LiftState[];
  location: WorkoutLocation;
  equipment: EquipmentProfile;
  includeWarmUps: boolean;
  selectedAccessories: string[];
  /**
   * Home substitutes the user picked on Configure: template exerciseId -> chosen
   * substitute exerciseId. Ignored at the gym and for ids that are not a valid
   * alternative for that exercise.
   */
  overrides?: Record<string, string>;
}

export interface RehydratedPlan {
  plan: WorkoutPlan;
  /** Index of the first entry with sets remaining; plan.length when all are done. */
  currentExerciseIndex: number;
}

export type NextStep = "rest" | "next-exercise" | "done";

export interface CreateSetLogInput {
  exercise: WorkoutExerciseState;
  actualReps: number;
  rpe: number | null;
  location: WorkoutLocation;
  /** True when the user accepted a T2 auto-regulation load drop for this exercise. */
  autoRegulated: boolean;
  now: Date;
  id: string;
  clientId: string;
}

export interface CompletionInput {
  session: WorkoutSession;
  plan: WorkoutPlan;
  /** Every set logged in this session, warm-ups included. */
  sets: SetLog[];
  liftStates: LiftState[];
  settings: UserSettings;
  /**
   * The recent e1RM series to store per exerciseId, exactly as `toRecentE1RMSeries`
   * (src/lib/e1rm.ts) builds it: oldest first. An exercise with no entry keeps the
   * series already on its lift state.
   */
  recentE1RMsByExercise: Record<string, number[]>;
  currentExerciseIndex: number;
  workoutStartTime: Date | null;
  now: Date;
}

export interface CompletionResult {
  /** Full replacement rows for every lift state that changed, already `synced: false`. */
  liftStateUpdates: LiftState[];
  sessionPatch: {
    completedAt: Date;
    totalDurationSeconds: number;
    sets: SetLog[];
    endedEarly?: true;
  };
}

/** What the Dashboard, Program and Configure screens show for the upcoming workout. */
export interface NextWorkoutDescription {
  templateId: string;
  template: WorkoutTemplate;
  plan: WorkoutPlan;
}
