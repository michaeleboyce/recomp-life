// Contracts for Apple Health import. Pure: no React, no database, no Capacitor.
//
// Everything above `HealthSource` works with these plugin-neutral shapes, so the
// native plugin can be replaced without touching the mapping or the importer.
// Health-side values are in SI units (kg, metres, seconds); conversion to the
// app's lbs and miles happens in ./units.

/** The groups of data the user can switch on or off. */
export type HealthCategory = "bodyweight" | "sleep" | "workouts" | "daily";

export const HEALTH_CATEGORIES: readonly HealthCategory[] = [
  "bodyweight",
  "sleep",
  "workouts",
  "daily",
];

/** Fields every sample carries. */
export interface HealthSampleBase {
  /** HealthKit's UUID for the sample. Stable across reads. */
  uuid: string;
  /** Name of the app or device that recorded it, e.g. "Apple Watch". */
  sourceName: string | null;
}

export interface HealthWeight extends HealthSampleBase {
  date: Date;
  kilograms: number;
}

/**
 * The kinds of workout the app distinguishes. Anything else arrives as "other"
 * with HealthKit's own name in `rawType`.
 */
export type HealthWorkoutType =
  | "running"
  | "cycling"
  | "hiking"
  | "walking"
  | "yoga"
  | "strength"
  | "other";

export interface HealthWorkout extends HealthSampleBase {
  type: HealthWorkoutType;
  /** HealthKit's name for the activity, e.g. "traditionalStrengthTraining". */
  rawType: string;
  start: Date;
  end: Date;
  durationSeconds: number;
  distanceMetres: number | null;
  /** True for treadmill and other indoor sessions; null when not recorded. */
  indoor: boolean | null;
  activeEnergyKcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
}

/** "inBed" and "awake" do not count as sleep. */
export type SleepStage = "inBed" | "awake" | "asleep" | "core" | "deep" | "rem";

export interface HealthSleepSample extends HealthSampleBase {
  start: Date;
  end: Date;
  stage: SleepStage;
}

/** The per-day values kept in one HealthDaily row, apart from sleep. */
export type HealthQuantity =
  | "steps"
  | "restingHr"
  | "hrvMs"
  | "activeEnergyKcal"
  | "exerciseMinutes"
  | "vo2Max"
  | "bodyFatPct"
  | "leanMassLbs"
  | "dietaryKcal"
  | "proteinG";

/** One value for one local day, already totalled or averaged by the source. */
export interface HealthQuantitySample {
  quantity: HealthQuantity;
  /** Local calendar day, "YYYY-MM-DD". */
  day: string;
  value: number;
}

/** One night's sleep, attributed to the day the user woke up. */
export interface NightSleep {
  /** Local calendar day of waking, "YYYY-MM-DD". */
  day: string;
  asleepMinutes: number;
  deepMinutes: number | null;
  remMinutes: number | null;
  /** Earliest sleep start and latest sleep end of the night. */
  start: Date;
  end: Date;
}

/** The values of one HealthDaily row. Null means "no data that day". */
export interface HealthDailyValues {
  /** Local calendar day, "YYYY-MM-DD". */
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
}

/** What a linked Watch workout adds to a lifting session. */
export interface SessionHealth {
  externalId: string;
  sourceName: string | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  activeEnergyKcal: number | null;
  durationSeconds: number;
}

export interface HealthAvailability {
  available: boolean;
  /** Why not, in a sentence fit to show the user. */
  reason?: string;
}

export interface HealthRange {
  /** Inclusive. */
  since: Date;
  /** Exclusive. */
  until: Date;
}

/**
 * Read access to a health store. The native implementation is
 * src/native/healthkit.ts; tests and the browser use ./fakeSource.
 *
 * iOS never says whether a read permission was refused: a refused category
 * simply returns nothing. `requestAccess` resolves once the permission sheet
 * has been dealt with, whatever the user chose.
 */
export interface HealthSource {
  isAvailable(): Promise<HealthAvailability>;
  requestAccess(categories: readonly HealthCategory[]): Promise<void>;
  readWeights(range: HealthRange): Promise<HealthWeight[]>;
  readWorkouts(range: HealthRange): Promise<HealthWorkout[]>;
  readSleep(range: HealthRange): Promise<HealthSleepSample[]>;
  readDaily(range: HealthRange): Promise<HealthQuantitySample[]>;
}
