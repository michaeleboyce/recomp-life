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
}

export interface UserProfile {
  id: string;
  name: string;
  bodyweight: number;
  heightInches: number;
  createdAt: Date;
  settings: UserSettings;
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

// Exercise Types

export type MuscleGroup = "push" | "pull" | "legs" | "core" | "full_body";
export type ExerciseType = "barbell" | "dumbbell" | "cable" | "bodyweight";

export interface Exercise {
  id: string;
  name: string;
  type: ExerciseType;
  muscleGroup: MuscleGroup;
  requiresGym: boolean;
  dumbbellAlternative?: string;
  barbellEquivalent?: string;
  primaryMuscles: BodyRegion[];
  secondaryMuscles: BodyRegion[];
  painSensitiveRegions: BodyRegion[];
}

// Program State

export type T1Stage = "5x3" | "6x2" | "10x1";
export type T2Stage = "3x10" | "3x8" | "3x6";

export interface LiftState {
  exerciseId: string;
  t1Weight: number;
  t1Stage: T1Stage;
  t1FailCount: number;
  t2Weight: number;
  t2Stage: T2Stage;
  t2FailCount: number;
  t1LastResetWeight: number | null;
  t2LastResetWeight: number | null;
  t1LastWorkoutDate: Date | null;
  t2LastWorkoutDate: Date | null;
  deloadActive: boolean;
  deloadSessionsRemaining: number;
  preDeloadT1Weight: number | null;
  preDeloadT2Weight: number | null;
  t2LoadDropCount: number;
  recentE1RMs: number[];
  recentAvgRPEs: number[];
  recentAMRAPReps: number[];
}

// Workout Session Types

export type SetStatus = "completed" | "failed" | "skipped_pain" | "reduced_run_fatigue" | "reduced_equipment" | "autoregulated_load_drop";
export type Tier = "T1" | "T2" | "T3" | "accessory" | "warmup";
export type WorkoutLocation = "gym" | "home";

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

export interface WorkoutSession {
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

export interface RunLog {
  id: string;
  clientId: string;
  date: Date;
  durationMinutes: number;
  distanceMiles: number | null;
  type: RunType;
  category: RunCategory;
  notes: string;
  perceivedEffort: 1 | 2 | 3 | 4 | 5;
  synced: boolean;
}

// Bodyweight Log

export type TimeOfDay = "morning" | "evening" | "other";

export interface BodyweightLog {
  id: string;
  clientId: string;
  date: Date;
  weight: number;
  timeOfDay: TimeOfDay;
  synced: boolean;
}

// Readiness Log

export type SleepHours = "<5" | "5-7" | "7+";
export type StressLevel = "low" | "normal" | "good";

export interface ReadinessLog {
  id: string;
  sessionId: string;
  sleepHours: SleepHours;
  stressLevel: StressLevel;
  date: Date;
}

// Pain/Soreness

export interface PainSorenessEntry {
  id: string;
  date: Date;
  region: BodyRegion;
  sensation: SensationType;
  severity: 1 | 2 | 3 | 4 | 5;
  notes?: string;
  associatedWorkoutId?: string;
}

// Estimated 1RM

export interface Estimated1RM {
  id: string;
  date: Date;
  exerciseId: string;
  workingWeight: number;
  repsCompleted: number;
  estimated1RM: number;
  workoutSessionId: string;
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

export interface FatigueAlert {
  level: FatigueAlertLevel;
  signals: FatigueSignal[];
  message?: string;
  prescription?: DeloadWeek;
}

export interface InactivityAlert {
  level: InactivityAlertLevel;
  message: string;
  prescription: "normal_workout" | "ramp_up_85";
}

// T2 Auto-Regulation Types

export type T2AutoRegAction = "continue" | "suggest_drop";
export type T2ProgressionEffect = "freeze" | "normal";

export interface T2AutoRegResult {
  action: T2AutoRegAction;
  reducedWeight?: number;
  message?: string;
  progressionEffect?: T2ProgressionEffect;
}
