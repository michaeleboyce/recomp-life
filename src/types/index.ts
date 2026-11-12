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
  exercisePreferences?: ExercisePreferences;
}

export interface UserProfile {
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
export type ExerciseType = "barbell" | "dumbbell" | "cable" | "bodyweight";

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
  endedEarly?: boolean;
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

// Activity Log: sessions other than lifting and running (yoga, cycling, hiking, walking)

export type ActivityKind = "yoga" | "cycling" | "hiking" | "walking" | "other";
export type YogaStyle = "restorative" | "flow" | "power";

export interface ActivityLog {
  id: string;
  clientId: string;
  date: Date;
  kind: ActivityKind;
  durationMinutes: number;
  /** Yoga only; null for every other kind. */
  style: YogaStyle | null;
  distanceMiles: number | null;
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
  clientId: string;
  sessionId: string;
  sleepHours: SleepHours;
  stressLevel: StressLevel;
  date: Date;
  synced: boolean;
}

// Pain/Soreness

export interface PainSorenessEntry {
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
  | "trial";

export type EvidenceArea =
  | "progression"
  | "effort"
  | "rest"
  | "recovery"
  | "running"
  | "volume"
  | "nutrition"
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
