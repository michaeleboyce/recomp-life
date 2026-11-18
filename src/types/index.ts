import type { RuleId } from "@/lib/evidence/rules";

// Core User Types

export interface TrainingPhase {
  mode: "cutting" | "maintaining" | "bulking";
  dailyDeficit?: number;
  proteinGramsPerDay?: number;
}

export interface EquipmentProfile {
  maxDumbbellWeight: number;
  dumbbellIncrementLbs: number;
  hasBench: boolean;
  hasResistanceBands: boolean;
  hasPullUpBar: boolean;
  gymBarbellIncrementLbs: number;
  availablePlates: number[];
  barWeight: number;
}

export interface UserSettings {
  theme: "dark" | "light";
  restTimerAudio: boolean;
  restTimerVibration: boolean;
  showWarmUps: boolean;
  showRPE: boolean;
  morningWeighInReminder: boolean;
  weighInReminderTime: string;
  trainingPhase: TrainingPhase;
  equipment: EquipmentProfile;
  defaultLocation?: WorkoutLocation;
  /** Preferences that apply everywhere. */
  exercisePreferences?: ExercisePreferences;
  /** Per-location overrides; an entry here wins over the overall preference. */
  exercisePreferencesByLocation?: LocationExercisePreferences;
  /**
   * Per-set weights for the next session of an exercise, set on its page, keyed by
   * `nextSetPlanKey(exerciseId, tier)`. Used up when a session that logged it is
   * finished. Spec: docs/plans/2026-11-17-exercise-page-design.md (E6).
   */
  nextSetPlans?: Record<string, NextSetPlan>;
  /**
   * How a workout's accessories are chosen: "auto" (chosen by the app, the default:
   * absent reads as "auto"), "ask" (offered, none ticked) or "none".
   * Spec: docs/plans/2026-11-17-accessories-design.md (A5).
   */
  accessories?: AccessoryMode;
  /** Accessories pinned to a workout day ("Always on this day"), by template id, in pin order. */
  accessoryPins?: Record<string, string[]>;
  /**
   * Accessory weights set by hand, by exercise id. Each applies until a session logged
   * after `setAt` contains the exercise (`handSetAccessoryWeight`); then double
   * progression over the log takes over again.
   */
  accessoryWeights?: Record<string, AccessoryHandSetWeight>;
  /**
   * The session length to plan for, in minutes (30, 45, 60, 75 or 90 in Settings); null
   * is no limit, absent reads as DEFAULT_SESSION_MINUTES. Accessories chosen for a
   * workout are kept to it (`fitAccessoriesToBudget`).
   */
  sessionMinutes?: number | null;
}

export type AccessoryMode = "auto" | "ask" | "none";

/** An accessory weight set by hand: as lifted (per dumbbell for a two-dumbbell exercise). */
export interface AccessoryHandSetWeight {
  weight: number;
  /** Epoch ms it was set. */
  setAt: number;
}

/** Each set's weight and reps for the next session of one exercise at one tier (E6). */
export interface NextSetPlan {
  /** The exercise performed: the home exercise at home, the lift itself otherwise. */
  exerciseId: string;
  /** The program lift it stands in for; the same as `exerciseId` for a lift done as itself. */
  liftId: string;
  tier: Tier;
  /** The sets as the user set them, in order. */
  sets: PlannedSet[];
  /** The plan's own sets when they were set, for "Plan · You" per set. */
  planSets: PlannedSet[];
  /** ISO time it was set (settings are stored as JSON). */
  createdAt: string;
}

/**
 * Sync stamps carried by every synced row. `updatedAt` and `deletedAt` are epoch
 * milliseconds: the newest `updatedAt` wins a sync conflict, and a row with `deletedAt`
 * set is a soft delete (hidden by the read hooks, kept so the delete can sync and be
 * undone). `externalId` identifies a row imported from another system.
 */
export interface Stamped {
  updatedAt?: number;
  deletedAt?: number | null;
  externalId?: string;
}

/**
 * A row of this device's own sync bookkeeping (the `syncMeta` table): local only, never
 * synced or backed up. Today only the "rebuild needed" marker (src/lib/sync/rebuildMarker.ts).
 */
export interface SyncMetaRow {
  key: string;
  /** New on every write, so a reader can tell whether the row changed since it looked. */
  token: string;
  /** When it was written (epoch ms). */
  at: number;
}

/** Where a log row came from. Absent means the user entered it by hand. */
/** Where a row came from: entered by hand, Apple Health, or another app's export ("import", the app in `sourceName`). */
export type RecordSource = "manual" | "apple_health" | "import";

/** Heart rate and energy from the watch workout recorded during a lifting session. */
export interface WorkoutHealth {
  /** Identifier of the workout in the system it came from. */
  externalId: string;
  sourceName: string | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  activeEnergyKcal: number | null;
  durationSeconds: number;
}

export interface UserProfile extends Stamped {
  id: string;
  clientId: string;
  name: string;
  bodyweight: number;
  heightInches: number;
  createdAt: Date;
  settings: UserSettings;
  synced: boolean;
}

// Body Region Type

export type BodyRegion =
  | "lower_back" | "upper_back"
  | "left_shoulder" | "right_shoulder"
  | "left_knee" | "right_knee"
  | "left_hip" | "right_hip"
  | "left_elbow" | "right_elbow"
  | "left_wrist" | "right_wrist"
  | "neck"
  | "left_quad" | "right_quad"
  | "left_hamstring" | "right_hamstring"
  | "chest"
  | "core";

export type SensationType = "soreness" | "pain";

// Exercise Preference Types

export type ExercisePreference = "blocked" | "normal" | "preferred";
export type ExercisePreferences = Record<string, ExercisePreference>;
/** Overrides of the overall preferences for one location. */
export type LocationExercisePreferences = Partial<Record<"gym" | "home", ExercisePreferences>>;
/** Where a preference applies: everywhere, or one location only. */
export type PreferenceScope = "all" | "gym" | "home";

// Muscle Types
//
// MuscleId describes what an exercise trains. It is bilateral (no left/right).
// BodyRegion (above) is for pain tracking and stays side-specific.

export type MuscleId =
  | "chest" | "front_delts" | "side_delts" | "rear_delts" | "rotator_cuff"
  | "biceps" | "triceps" | "forearms"
  | "upper_traps" | "mid_back" | "lats" | "lower_back"
  | "abs" | "obliques"
  | "glutes" | "quads" | "hamstrings" | "adductors" | "calves";

export type ActivationLevel = "primary" | "secondary" | "stabilizer";

// Exercise Types

export type MuscleGroup = "push" | "pull" | "legs" | "core" | "full_body";
export type ExerciseType = "barbell" | "dumbbell" | "cable" | "bodyweight" | "machine";

export type DumbbellGrip = "per_hand" | "single" | "both_hands";

export interface Exercise {
  id: string;
  name: string;
  type: ExerciseType;
  muscleGroup: MuscleGroup;
  requiresGym: boolean;
  dumbbellAlternative?: string;
  barbellEquivalent?: string;
  grip?: DumbbellGrip;
  primaryMuscles: MuscleId[];
  secondaryMuscles: MuscleId[];
  stabilizerMuscles: MuscleId[];
  painSensitiveRegions: BodyRegion[];
}

// Program State

export type T1Stage = "5x3" | "6x2" | "10x1";
export type T2Stage = "3x10" | "3x8" | "3x6";

export interface LiftState {
  exerciseId: string;
  clientId: string;
  t1Weight: number;
  t1Stage: T1Stage;
  t1FailCount: number;
  t2Weight: number;
  t2Stage: T2Stage;
  t2FailCount: number;
  t3Weight: number;
  t1LastResetWeight: number | null;
  t2LastResetWeight: number | null;
  t1LastWorkoutDate: Date | null;
  t2LastWorkoutDate: Date | null;
  /**
   * When the T1 / T2 barbell weight was last set by hand (a manual or starting-weight
   * adjustment with a real date). Re-entry at the gym leaves a weight set by hand after
   * the last home session as it is. Absent when it never was. Derived by the rebuild.
   */
  t1SetByHandAt?: Date;
  t2SetByHandAt?: Date;
  /**
   * The plan's own weight for the tier while its weight is set by hand and not lifted
   * since (E7, as `VariantState.plannedWeight`). Absent otherwise. Derived by the rebuild.
   */
  t1PlannedWeight?: number;
  t2PlannedWeight?: number;
  t3PlannedWeight?: number;
  deloadActive: boolean;
  deloadSessionsRemaining: number;
  preDeloadT1Weight: number | null;
  preDeloadT2Weight: number | null;
  t2LoadDropCount: number;
  recentE1RMs: number[];
  recentAvgRPEs: number[];
  recentAMRAPReps: number[];
  synced: boolean;
}

/** How a home variant's first weight was chosen. */
export interface VariantSeed {
  /**
   * How `seedVariantWeight` worked it out. "history": the exercise's own recent
   * estimate (its sets inside the evidence window, app or imported), for the stage's
   * reps (F6). "learned": the program lift's pooled strength estimate through the ratio
   * learned from the lifter's own pairs. "estimate": the pooled estimate through the
   * exercise's starting ratio (H3). "ratio": no estimate yet, so the starting ratio
   * times the barbell working weight. "conversion": an exercise with no ratio, by the
   * flat dumbbell conversion (80% of the barbell weight). "harderVariant": the cap
   * policy moved here from a variant that had reached the heaviest dumbbell.
   */
  source: "conversion" | "harderVariant" | "history" | "learned" | "estimate" | "ratio";
  /** The program lift's weight the seed was worked out from, in barbell terms. */
  barbellWeight: number;
  /** The weight the seed asked for when it was more than the heaviest dumbbell. */
  cappedFrom?: number;
  /** For "harderVariant": the variant the cap policy moved on from. */
  fromVariantId?: string;
  /** For "learned", "estimate" and "ratio": the exercise's ratio to the program lift. */
  ratio?: number;
  /** For "learned": how many of the lifter's session pairs the ratio was learned from. */
  pairs?: number;
  /** For "learned" and "estimate": the program lift's pooled strength estimate, lbs. */
  estimate?: number;
  /** For "history": the exercise's own estimated max, lbs on the total load. */
  ownEstimate?: number;
  /** For "history", "learned" and "estimate": the reps per set the weight was worked out for. */
  targetReps?: number;
  /**
   * For "history": the exercise's own session the estimate came from (its best set, as
   * lifted), app or imported. What the first weight is based on, shown instead of
   * "First time".
   */
  history?: {
    at: number;
    weight: number;
    reps: number;
    perHand: boolean;
    sessionId?: string;
    rpe?: number;
    imported?: true;
  };
  /**
   * For "history", when it held the seed down: the heaviest weight, as lifted, the
   * exercise was done at inside the evidence window; the seed is that plus one step.
   */
  heaviestLifted?: number;
  /** The seed was held down to `heaviestLifted` plus one dumbbell step. */
  limitedByHeaviest?: true;
  /** When the exercise was last done (epoch ms), for a seed not from its own history. */
  lastDone?: number;
}

/**
 * The working weight and progression of one exercise performed for a program lift at
 * one tier, e.g. Bulgarian split squat for the squat at T1. Each home exercise keeps
 * its own weight and moves by the GZCLP rules in dumbbell steps. Derived: rebuilt from
 * the log by the same fold as the lift states (`rebuildDerived`), stored only on this
 * device, never synced and never edited by hand.
 */
export interface VariantState {
  /** `variantKey(liftId, exerciseId, tier)`, e.g. "squat|bulgarian_split_squat|T1". */
  id: string;
  /** The program lift this exercise stands in for. */
  liftId: string;
  /** The exercise performed. */
  exerciseId: string;
  tier: "T1" | "T2" | "T3";
  /** The working weight as lifted: per hand when `perHand`, else the one dumbbell. */
  weight: number;
  perHand: boolean;
  /** The GZCLP stage for T1 and T2; null for T3. */
  stage: T1Stage | T2Stage | null;
  failCount: number;
  /**
   * Reps added to every set by the cap policy once the heaviest dumbbell is reached
   * (3x10 becomes 3x12). 0 below the cap; a miss or a reset clears it.
   */
  extraReps: number;
  lastResetWeight: number | null;
  lastSessionDate: Date | null;
  /** Reps on the last working set of recent sessions, oldest first. */
  recentLastSetReps: number[];
  /** True for the variant the next home session of this lift and tier plans. */
  current: boolean;
  /**
   * Passes of this variant since the program lift was last done at this tier as the
   * barbell lift itself: the steps the home sessions earned for re-entry (H6).
   */
  passesSinceGym: number;
  /**
   * Passes of the barbell lift at this tier since this variant was last done (or since
   * a session prescribed it): the steps the gym sessions earned for its re-entry (H6).
   * Absent means 0 (rows rebuilt before it was counted).
   */
  gymPassesSinceHome?: number;
  /**
   * When the weight was last set by hand (a manual adjustment for this exercise).
   * Re-entry leaves a weight set by hand after the barbell lift's last session as it
   * is: the user has the final say. Absent when it never was.
   */
  setByHandAt?: Date;
  /**
   * The app's own weight when the weight was set by hand and not lifted since: what the
   * plan had before the change. Absent once the exercise is logged, after going back to
   * the plan's weight, or when it never was set by hand. While present, the hand-set
   * weight counts as provisional strength evidence (`targetStrengthSets`).
   */
  plannedWeight?: number;
  seed: VariantSeed;
}

/** A variant's weight and scheme as an outcome records them. */
export interface VariantPoint {
  exerciseId: string;
  weight: number;
  perHand: boolean;
  stage?: string;
  /** Reps per working set. */
  reps: number;
}

/** What the cap policy did on a pass at the heaviest dumbbell, instead of adding weight. */
export type VariantCapAction =
  | {
      policy: "harderVariant";
      maxDumbbellWeight: number;
      /** The variant planned next, now the current one. */
      to: { variantId: string; exerciseId: string; weight: number };
    }
  | { policy: "reps"; maxDumbbellWeight: number; repsFrom: number; repsTo: number };

/**
 * What the program rules did to the home exercise performed for a program lift: the
 * same kinds as a lift's outcome, in the variant's own weight and scheme. The program
 * lift's own outcome for that session is "held" (no reason): the barbell weight does
 * not move at home.
 */
export interface VariantOutcome {
  variantId: string;
  liftId: string;
  exerciseId: string;
  tier: "T1" | "T2" | "T3";
  kind: ProgressionOutcomeKind;
  reason?: ProgressionOutcomeReason;
  from: VariantPoint;
  to: VariantPoint;
  /** Set when a pass met the heaviest dumbbell. */
  cap?: VariantCapAction;
  ruleId: string;
}

// Workout Session Types

export type SetStatus = "completed" | "failed" | "skipped_pain" | "reduced_run_fatigue" | "reduced_equipment" | "autoregulated_load_drop";
export type Tier = "T1" | "T2" | "T3" | "accessory" | "warmup";
export type WorkoutLocation = "gym" | "home";

/**
 * What a set was for. Absent means a working set of the program, as "work" does. Pass
 * or fail is judged on working sets only: a ramp set leads up to them, a back-off set
 * and a drop set come after them and are extra volume.
 */
export type SetRole = "work" | "ramp" | "backoff" | "drop";

/** One planned set with its own weight and rep target (per-set weights). */
export interface PlannedSet {
  weight: number;
  reps: number;
  /** Absent means a working set. */
  role?: SetRole;
}

export interface SetLog {
  id: string;
  clientId: string;
  exerciseId: string;
  tier: Tier;
  setNumber: number;
  targetReps: number;
  actualReps: number;
  weight: number;
  isAMRAP: boolean;
  completedAt: Date;
  restAfterSeconds: number;
  status: SetStatus;
  originalWeight?: number;
  isSubstituted: boolean;
  substituteExerciseId?: string;
  rpe?: number;
  location: WorkoutLocation;
  /** What the set was for; absent on a working set (and on every row logged before roles). */
  role?: SetRole;
  /** For a drop set: the id of the set it continues, with no rest in between. */
  dropOf?: string;
  synced: boolean;
}

export type ModificationAction = "reduce_weight" | "substitute" | "skip";
export type ModificationSource = "pain" | "run_fatigue" | "equipment_limit";

export interface WorkoutModification {
  exerciseId: string;
  originalWeight: number;
  modifiedWeight: number;
  reason: string;
  action: ModificationAction;
  source: ModificationSource;
  userAccepted: boolean;
}

export interface WorkoutSession extends Stamped {
  id: string;
  clientId: string;
  templateId: string;
  location: WorkoutLocation;
  startedAt: Date;
  completedAt: Date | null;
  totalDurationSeconds: number;
  includeWarmUps: boolean;
  selectedAccessories: string[];
  sets: SetLog[];
  preWorkoutPainEntries: PainSorenessEntry[];
  modifications: WorkoutModification[];
  endedEarly?: boolean;
  /** What the program prescribed for each program lift when the session started. */
  prescribed?: PrescribedEntry[];
  /** The settings progression depended on when the session was finished. */
  completionContext?: CompletionContext;
  /** Changes the user made to the day's plan before starting. Absent for a plain GZCLP day. */
  planEdits?: PlanEdit[];
  /** The favourite this session was started from, if any. */
  favoriteId?: string;
  /** The watch workout recorded during this session, when one was found. */
  health?: WorkoutHealth;
  /** How each planned number was reached, as shown when the session started. Saved once. */
  decisions?: StoredTrace[];
  synced: boolean;
}

/**
 * A change to one entry of a day's plan, applied after the program's prescription.
 * `exerciseId` and `tier` name the entry as it stands when the edit is applied, so an
 * edit that follows a swap names the replacement.
 */
export type PlanEdit =
  | { kind: "swap"; exerciseId: string; tier: Tier; replacementId: string }
  | { kind: "remove"; exerciseId: string; tier: Tier }
  | { kind: "add"; exerciseId: string; sets: number; reps: number; weight: number; isAMRAP: boolean }
  | { kind: "scheme"; exerciseId: string; tier: Tier; sets: number; reps: number }
  | { kind: "weight"; exerciseId: string; tier: Tier; weight: number }
  /** Each set's own weight and rep target, in order; replaces the entry's sets. */
  | { kind: "setWeights"; exerciseId: string; tier: Tier; sets: PlannedSet[] };

/** One working entry of a favourite's frozen copy. */
export interface FavoriteSnapshotEntry {
  exerciseId: string;
  tier: Tier;
  sets: number;
  reps: number;
  weight: number;
  isAMRAP: boolean;
  /**
   * At home: the home exercise the lift was done as, whose weight (as lifted) `weight`
   * is. Absent at the gym, for a lift done as itself, and on favourites saved before it
   * was recorded.
   */
  performedAs?: string;
}

/** A saved workout: a base day, the user's choices and edits, and a frozen copy of the plan. */
export interface FavoriteWorkout extends Stamped {
  id: string;
  clientId: string;
  name: string;
  templateId: string;
  location: WorkoutLocation;
  includeWarmUps: boolean;
  selectedAccessories: string[];
  /** Home substitutes: template exerciseId -> substitute exerciseId. */
  substitutes: Record<string, string>;
  /** Structural edits only (swap, remove, add). Weights and schemes live in `snapshot`. */
  edits: PlanEdit[];
  snapshot: FavoriteSnapshotEntry[];
  sourceSessionId?: string;
  createdAt: Date;
  lastUsedAt?: Date;
  synced: boolean;
}

/** What the program prescribed for one program lift when the session started, before edits. */
export interface PrescribedEntry {
  exerciseId: string;
  tier: Tier;
  weight: number;
  sets: number;
  reps: number;
  stage?: T1Stage | T2Stage;
  /**
   * At home: what the program prescribed for the exercise performed in the lift's place,
   * in that exercise's own weight and scheme. The rebuild takes it as a fact, as it does
   * the lift's own prescription. Absent at the gym and on sessions saved before home
   * exercises had their own weight.
   */
  home?: HomePrescription;
}

/** The prescription of a home exercise standing in for a program lift. */
export interface HomePrescription {
  exerciseId: string;
  /** As lifted: per hand when `perHand`. */
  weight: number;
  perHand: boolean;
  stage?: T1Stage | T2Stage;
  sets: number;
  reps: number;
}

/** Settings read by progression, stored on a finished workout so a rebuild reuses them. */
export interface CompletionContext {
  phaseMode: TrainingPhase["mode"];
  gymBarbellIncrementLbs: number;
  dumbbellIncrementLbs: number;
  /**
   * The heaviest dumbbell when the session was finished. Absent on sessions finished
   * before it was stored: a rebuild then uses the current setting.
   */
  maxDumbbellWeight?: number;
}

/** Lift-state fields an adjustment may set. Everything else is derived from the log. */
export type AdjustableField =
  | "t1Weight" | "t1Stage" | "t1FailCount" | "t1LastResetWeight"
  | "t2Weight" | "t2Stage" | "t2FailCount" | "t2LastResetWeight"
  | "t3Weight";

/**
 * A dated change to a lift made outside a workout: the starting weights, a manual
 * change, or an accepted time-off reduction. Append-only; the rebuild applies them in
 * date order between workouts.
 */
export interface LiftAdjustment extends Stamped {
  id: string;
  clientId: string;
  exerciseId: string;
  at: Date;
  source: "start" | "manual" | "decay" | "import";
  set: Partial<Pick<LiftState, AdjustableField>>;
  /**
   * Set when the adjustment is for a home exercise standing in for `exerciseId` at a
   * tier: the rebuild applies it to that exercise's own state (its weight, stage and
   * fail count, read from the tier's fields of `set`) instead of the barbell lift.
   * Absent or null: the barbell lift.
   */
  variant?: { exerciseId: string; tier: Tier } | null;
  note?: string;
  synced: boolean;
}

// Workout Template Type

export interface WorkoutTemplateExercise {
  exerciseId: string;
  tier: Tier;
  sets: number;
  reps: number;
  isAMRAP: boolean;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  exercises: WorkoutTemplateExercise[];
}

// Run Log

export type RunType = "outdoor" | "treadmill" | "trail";
export type RunCategory = "easy" | "tempo" | "intervals" | "long" | "other";

export interface RunLog extends Stamped {
  id: string;
  clientId: string;
  date: Date;
  durationMinutes: number;
  distanceMiles: number | null;
  type: RunType;
  category: RunCategory;
  notes: string;
  /** Null for a session imported without an effort rating; the app never guesses one. */
  perceivedEffort: 1 | 2 | 3 | 4 | 5 | null;
  /** Where the row came from; absent means entered by hand. */
  source?: RecordSource;
  /** The app or device that recorded an imported row, e.g. "Apple Watch". */
  sourceName?: string;
  /** The import that added the row, when an export file did: undoing that import removes it too. */
  importBatchId?: string;
  synced: boolean;
}

// Activity Log: sessions other than lifting and running (yoga, cycling, hiking, walking)

export type ActivityKind = "yoga" | "cycling" | "hiking" | "walking" | "other";
export type YogaStyle = "restorative" | "flow" | "power";

export interface ActivityLog extends Stamped {
  id: string;
  clientId: string;
  date: Date;
  kind: ActivityKind;
  durationMinutes: number;
  /** Yoga only; null for every other kind. */
  style: YogaStyle | null;
  distanceMiles: number | null;
  notes: string;
  /** Null for a session imported without an effort rating; the app never guesses one. */
  perceivedEffort: 1 | 2 | 3 | 4 | 5 | null;
  /** Where the row came from; absent means entered by hand. */
  source?: RecordSource;
  /** The app or device that recorded an imported row, e.g. "Apple Watch". */
  sourceName?: string;
  /** The import that added the row, when an export file did: undoing that import removes it too. */
  importBatchId?: string;
  synced: boolean;
}

// Bodyweight Log

export type TimeOfDay = "morning" | "evening" | "other";

export interface BodyweightLog extends Stamped {
  id: string;
  clientId: string;
  date: Date;
  weight: number;
  timeOfDay: TimeOfDay;
  /** Where the row came from; absent means entered by hand. */
  source?: RecordSource;
  /** The app or device that recorded an imported row, e.g. "Apple Watch". */
  sourceName?: string;
  synced: boolean;
}

// Readiness Log

export type SleepHours = "<5" | "5-7" | "7+";
export type StressLevel = "low" | "normal" | "good";

export interface ReadinessLog extends Stamped {
  id: string;
  clientId: string;
  sessionId: string;
  sleepHours: SleepHours;
  stressLevel: StressLevel;
  /**
   * Minutes asleep the night before, when the answer was prefilled from a health
   * source. A row pulled from the server carries null when there was none.
   */
  sleepMinutes?: number | null;
  sleepSource?: RecordSource;
  date: Date;
  synced: boolean;
}

// Health Daily: one row per calendar day of values imported from a health source.
// Display only: no coaching rule reads these. Null means "no data that day".

export interface HealthDailyLog extends Stamped {
  /** "hd:<day>", so a day has exactly one row on every device. */
  id: string;
  clientId: string;
  /** Local calendar day, "YYYY-MM-DD". Sleep counts toward the day of waking. */
  day: string;
  sleepMinutes: number | null;
  sleepDeepMinutes: number | null;
  sleepRemMinutes: number | null;
  steps: number | null;
  restingHr: number | null;
  hrvMs: number | null;
  activeEnergyKcal: number | null;
  exerciseMinutes: number | null;
  vo2Max: number | null;
  bodyFatPct: number | null;
  leanMassLbs: number | null;
  dietaryKcal: number | null;
  proteinG: number | null;
  synced: boolean;
}

// Pain/Soreness

export interface PainSorenessEntry extends Stamped {
  id: string;
  clientId: string;
  date: Date;
  region: BodyRegion;
  sensation: SensationType;
  severity: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  associatedWorkoutId?: string;
  synced: boolean;
}

// Estimated 1RM

export interface Estimated1RM {
  id: string;
  clientId: string;
  date: Date;
  exerciseId: string;
  workingWeight: number;
  repsCompleted: number;
  estimated1RM: number;
  workoutSessionId: string;
  /** The set this estimate was computed from (rows written by the rebuild). */
  setId?: string;
  synced: boolean;
}

// Weekly Volume (computed, not stored)

export interface MuscleGroupVolume {
  directSets: number;
  indirectSets: number;
  totalFractional: number;
}

export interface WeeklyVolumeSummary {
  weekStartDate: Date;
  muscleGroups: Record<string, MuscleGroupVolume>;
}

// Recovery Types

export type RecoveryStatus = "recovering" | "ready" | "primed" | "detraining";

export interface RecoveryState {
  exerciseId: string;
  lastTrainedAsT1: Date | null;
  lastTrainedAsT2: Date | null;
  daysSinceLastT1: number;
  daysSinceLastT2: number;
  recoveryStatus: RecoveryStatus;
}

// Auto-Adapt Types

export type AdaptationStatus = "fits" | "borderline" | "exceeds" | "no_substitute";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface AdaptationOption {
  label: string;
  exercise: Exercise;
  weight: number;
  pros: string;
  cons: string;
  /** The weight the conversion asked for when `weight` is capped at the heaviest dumbbell. */
  cappedFrom?: number;
}

export interface ExerciseAdaptation {
  originalExercise: Exercise;
  originalWeight: number;
  adaptedExercise: Exercise;
  adaptedWeight: number;
  adaptationStatus: AdaptationStatus;
  confidenceLevel: ConfidenceLevel;
  warningMessage?: string;
  alternatives: AdaptationOption[];
  /**
   * The weight the conversion asked for when `adaptedWeight` is capped at the heaviest
   * dumbbell, borderline (within 10 lb) or not. Absent when nothing was capped.
   */
  cappedFrom?: number;
}

// Warm-Up Types

export interface WarmUpSet {
  weight: number;
  reps: number;
  label: string;
}

// Volume Ratio Types

export type VolumeRatioStatus = "ok" | "warning";

export interface VolumeRatioCheck {
  status: VolumeRatioStatus;
  ratio: string;
  message?: string;
  suggestedMaxAccessories?: number;
}

// Fatigue/Deload Types

export type FatigueSignalType = "e1rm_decline" | "rpe_increase" | "amrap_decline";
export type FatigueAlertLevel = "watch" | "systemic";
export type InactivityAlertLevel = "gentle" | "urgent" | "detraining";

export interface FatigueSignal {
  type: FatigueSignalType;
  lift: string;
  consecutiveSessions: number;
}

export interface DeloadWeek {
  duration: string;
  t1: string;
  t2: string;
  t3: string;
  accessories: string;
  rpe_target: string;
  return: string;
}

export interface DeloadPrescription {
  weightReductionPercent: number;
  t3VolumeReduction: number; // 0 = no reduction, 0.25 = -25%, 0.5 = -50% (half)
  dropAllAccessories: boolean;
  maxAccessories: number;
  rpeTarget: string;
}

export interface FatigueAlert {
  level: FatigueAlertLevel;
  signals: FatigueSignal[];
  message?: string;
  prescription?: DeloadWeek;
}

export interface InactivityAlert {
  level: InactivityAlertLevel;
  message: string;
  prescription: "normal_workout" | "ease_back_in";
}

export interface StallAlert {
  detected: boolean;
  message: string;
  suggestions: string[];
}

// T2 Auto-Regulation Types

export type T2AutoRegAction = "continue" | "suggest_drop";
export type T2ProgressionEffect = "freeze" | "normal";

export interface T2AutoRegResult {
  action: T2AutoRegAction;
  reducedWeight?: number;
  message?: string;
  progressionEffect?: T2ProgressionEffect;
  /** Evidence rule explaining the suggestion (set when action is "suggest_drop"). */
  evidenceId?: RuleId;
}

// Evidence / Research Types
//
// The evidence registry (src/lib/evidence) is the single source of truth for
// every coaching rule: what the app does, why, the research behind it, where
// it is implemented and where it is shown. See docs/research/ADDING_RESEARCH.md.

/**
 * How well research supports a rule.
 * - strong: a position stand or agreeing meta-analyses directly on the rule
 * - moderate: one meta-analysis or several trials, or strong evidence applied indirectly
 * - limited: small or untrained-only studies, or the exact number is a judgment call
 * - heuristic: no direct research; a coaching convention
 * - program: defined by the GZCLP program itself
 */
export type EvidenceStrength =
  | "strong"
  | "moderate"
  | "limited"
  | "heuristic"
  | "program";

export type StudyDesign =
  | "position-stand"
  | "meta-analysis"
  | "systematic-review"
  | "review"
  | "rct"
  | "trial"
  | "observational";

export type EvidenceArea =
  | "progression"
  | "effort"
  | "rest"
  | "recovery"
  | "running"
  | "volume"
  | "nutrition"
  | "projection"
  | "pain"
  | "equipment";

/** active = shown in the UI; planned = logic exists in src/lib but is not connected. */
export type RuleStatus = "active" | "planned";

export interface EvidenceSource {
  /** Short label used in inline citations, e.g. "Singer 2024". */
  short: string;
  authors: string;
  year: number;
  title: string;
  journal: string;
  design: StudyDesign;
  /** Who or what was studied, e.g. "9 studies" or "55 untrained adults". */
  population: string;
  /** One plain-language sentence stating what the source found. */
  finding: string;
  /** Canonical link to the paper (DOI link preferred). */
  url: string;
  doi?: string;
  pmid?: string;
  /** Free full text, when one exists and differs from `url`. */
  fullTextUrl?: string;
}

export interface EvidenceRule<SourceKey extends string = string> {
  area: EvidenceArea;
  status: RuleStatus;
  /** Heading of the detail sheet, phrased as the user's question. */
  title: string;
  /** Inline one-liner shown under a suggestion. Max 80 characters. */
  summary: string;
  /** What the app does, with live values interpolated from lib constants. */
  appBehavior: string;
  /** Why, in plain language. */
  rationale: string;
  /** Limits of the evidence or of the rule. */
  caveat?: string;
  strength: EvidenceStrength;
  sources: readonly SourceKey[];
  /** YYYY-MM of the last time the evidence for this rule was reviewed. */
  reviewedOn: string;
  /** Code locations as "path#symbol". Each file carries an `@evidence <rule-id>` tag. */
  implementedIn: readonly string[];
  /** Component files that render an EvidenceLine for this rule. Empty for planned rules. */
  surfaces: readonly string[];
  /** For planned rules: what must change before the rule is switched on. */
  activationNotes?: string;
}

export interface EvidenceChange<
  RuleKey extends string = string,
  SourceKey extends string = string,
> {
  /** YYYY-MM-DD */
  date: string;
  ruleId: RuleKey;
  /** What changed in the app, in one sentence. */
  change: string;
  sources: readonly SourceKey[];
}

import type { ProgressionOutcomeKind, ProgressionOutcomeReason, StoredTrace } from "./glass";
export * from "./glass";
export * from "./imported";
