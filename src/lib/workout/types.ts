// Shared types for the pure workout domain (src/lib/workout). No React, no database.
import type {
  EquipmentProfile,
  LiftState,
  PlanEdit,
  PlannedSet,
  SetLog,
  Tier,
  UserSettings,
  VariantState,
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
  /**
   * Each set's own weight and rep target, in order, when they differ (a ramp, a back-off
   * set). Absent: every set is `targetReps` at `weight`, as always. When present,
   * `targetSets` is its length and `weight` and `targetReps` are its heaviest working set.
   */
  perSet?: PlannedSet[];
  /** At home: the id of the variant state this entry's weight and scheme come from. */
  variantId?: string;
  /** At home: true when `weight` is per hand (two dumbbells), false for one dumbbell. */
  perHand?: boolean;
  /**
   * At home: the weight the plan asked for when `weight` is capped at the heaviest
   * dumbbell (a borderline or over-the-limit conversion, or a lower limit set since).
   */
  cappedFrom?: number;
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
  /**
   * Changes the user made to the day (swap, remove, add, sets and reps, weight),
   * applied in order after everything above. Absent or empty: the plan is exactly
   * the program's.
   */
  edits?: PlanEdit[];
  /**
   * The home exercises' own states (`rebuildDerived().variantStates`). At home each
   * program lift is planned from its current variant's weight and scheme; a lift with
   * no variant yet is seeded from today's conversion (`seedVariantWeight`), so leaving
   * this out plans exactly what the conversion gives. Ignored at the gym.
   */
  variantStates?: VariantState[];
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
  /**
   * The home exercises' states going in. A home session progresses these, not the lift
   * states; a variant performed for the first time is seeded as the plan seeded it.
   */
  variantStates?: VariantState[];
}

export interface CompletionResult {
  /** Full replacement rows for every lift state that changed, already `synced: false`. */
  liftStateUpdates: LiftState[];
  /**
   * Full replacement rows for every variant state that changed or was created: the
   * variants performed at home, the one a cap policy moved to, and the variants whose
   * steps earned at home were used up by a session of the barbell lift itself.
   */
  variantStateUpdates: VariantState[];
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
