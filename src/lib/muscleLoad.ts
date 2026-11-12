import type {
  ActivationLevel,
  Exercise,
  MuscleId,
  RecoveryStatus,
  SetLog,
  TrainingPhase,
  WorkoutSession,
} from "@/types";
import { EXERCISES } from "./exercises";
import { MUSCLE_IDS, MUSCLE_VIEW } from "./muscles";
import { calculateRecoveryStatus } from "./recovery";
import { calculateMuscleGroupVolume, getCountedExercise } from "./volumeTracking";

/**
 * Muscle activation, load, heat and recovery. Pure functions that turn the
 * exercise catalogue and logged sets into what the anatomy views draw.
 */

/** 0 = none ... 4 = most worked. */
export type HeatLevel = 0 | 1 | 2 | 3 | 4;
export type MuscleValues = Partial<Record<MuscleId, number>>;
export type MuscleHeat = Partial<Record<MuscleId, HeatLevel>>;
export type MuscleActivationMap = Partial<Record<MuscleId, ActivationLevel>>;

const ACTIVATION_HEAT: Record<ActivationLevel, HeatLevel> = {
  primary: 4,
  secondary: 2,
  stabilizer: 1,
};

/** Which muscles an exercise uses, and how hard. Empty for an unknown id. */
export function getExerciseActivation(exerciseId: string): MuscleActivationMap {
  const exercise = EXERCISES[exerciseId];
  if (!exercise) return {};
  const map: MuscleActivationMap = {};
  for (const m of exercise.stabilizerMuscles) map[m] = "stabilizer";
  for (const m of exercise.secondaryMuscles) map[m] = "secondary";
  for (const m of exercise.primaryMuscles) map[m] = "primary";
  return map;
}

/** Heat for one exercise: primary 4, secondary 2, stabiliser 1. */
export function activationHeatLevels(exerciseId: string): MuscleHeat {
  const heat: MuscleHeat = {};
  const activation = getExerciseActivation(exerciseId);
  for (const [muscle, level] of Object.entries(activation) as [
    MuscleId,
    ActivationLevel,
  ][]) {
    heat[muscle] = ACTIVATION_HEAT[level];
  }
  return heat;
}

/** Heat for a set of exercises (a workout): the highest level per muscle. */
export function combinedActivationHeat(exerciseIds: string[]): MuscleHeat {
  const heat: MuscleHeat = {};
  for (const id of exerciseIds) {
    const one = activationHeatLevels(id);
    for (const [muscle, level] of Object.entries(one) as [MuscleId, HeatLevel][]) {
      if ((heat[muscle] ?? 0) < level) heat[muscle] = level;
    }
  }
  return heat;
}

/**
 * Fractional sets per muscle for a list of sets (primary 1.0, secondary 0.5).
 * Same skip rules as volume tracking.
 */
export function calculateMuscleLoad(sets: SetLog[]): MuscleValues {
  const load: MuscleValues = {};
  const volume = calculateMuscleGroupVolume(sets);
  for (const [muscle, v] of Object.entries(volume)) {
    load[muscle as MuscleId] = v.totalFractional;
  }
  return load;
}

/**
 * Fractional sets per muscle from per-exercise set counts (primary 1.0,
 * secondary 0.5). For work that is not yet a list of logged sets: the
 * session in progress, or a planned workout.
 */
export function loadFromSetCounts(
  items: { exerciseId: string; sets: number }[]
): MuscleValues {
  const load: MuscleValues = {};
  for (const { exerciseId, sets } of items) {
    const exercise = EXERCISES[exerciseId];
    if (!exercise || sets <= 0) continue;
    for (const m of exercise.primaryMuscles) load[m] = (load[m] ?? 0) + sets;
    for (const m of exercise.secondaryMuscles) load[m] = (load[m] ?? 0) + sets * 0.5;
  }
  return load;
}

/** The side of the body that shows an exercise's primary muscles best. */
export function bestViewForExercise(exerciseId: string): "front" | "back" {
  const exercise = EXERCISES[exerciseId];
  if (!exercise) return "front";
  let front = 0;
  let back = 0;
  for (const m of exercise.primaryMuscles) {
    const view = MUSCLE_VIEW[m];
    if (view === "front") front += 1;
    else if (view === "back") back += 1;
  }
  return back > front ? "back" : "front";
}

/** Fractional sets per muscle across completed workouts in a Mon-Sun week. */
export function getWeeklyMuscleLoad(
  workouts: WorkoutSession[],
  weekStart: Date
): MuscleValues {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  const sets: SetLog[] = [];
  for (const w of workouts) {
    if (!w.completedAt) continue;
    const started = new Date(w.startedAt);
    if (started >= weekStart && started < weekEnd) sets.push(...w.sets);
  }
  return calculateMuscleLoad(sets);
}

/**
 * Heat level for a weekly set count. 10 sets is the weekly target used by the
 * volume chart, so 10+ is the top level.
 *
 * @evidence weekly-volume
 */
export function weeklyHeatLevel(sets: number): HeatLevel {
  if (sets <= 0) return 0;
  if (sets < 3) return 1;
  if (sets < 6) return 2;
  if (sets < 10) return 3;
  return 4;
}

export function weeklyHeatLevels(load: MuscleValues): MuscleHeat {
  const heat: MuscleHeat = {};
  for (const [muscle, sets] of Object.entries(load) as [MuscleId, number][]) {
    const level = weeklyHeatLevel(sets);
    if (level > 0) heat[muscle] = level;
  }
  return heat;
}

/** Heat scaled to the largest value in the load (for a single session). */
export function relativeHeatLevels(load: MuscleValues): MuscleHeat {
  const entries = Object.entries(load) as [MuscleId, number][];
  const max = Math.max(0, ...entries.map(([, v]) => v));
  if (max <= 0) return {};
  const heat: MuscleHeat = {};
  for (const [muscle, value] of entries) {
    if (value <= 0) continue;
    heat[muscle] = Math.min(4, Math.max(1, Math.ceil((value / max) * 4))) as HeatLevel;
  }
  return heat;
}

/**
 * When each muscle last received primary or secondary work in a completed
 * workout. Muscles never trained are absent.
 */
export function getMuscleLastTrained(
  workouts: WorkoutSession[]
): Partial<Record<MuscleId, Date>> {
  const last: Partial<Record<MuscleId, Date>> = {};
  for (const w of workouts) {
    if (!w.completedAt) continue;
    const when = new Date(w.startedAt);
    for (const set of w.sets) {
      const exercise = getCountedExercise(set);
      if (!exercise) continue;
      for (const muscle of [...exercise.primaryMuscles, ...exercise.secondaryMuscles]) {
        const prev = last[muscle];
        if (!prev || prev.getTime() < when.getTime()) last[muscle] = when;
      }
    }
  }
  return last;
}

/**
 * Recovery status for every muscle, using the same thresholds as the lift
 * recovery bars (including the cutting-phase bonus).
 *
 * @evidence recovery-windows
 */
export function getMuscleRecovery(
  workouts: WorkoutSession[],
  now: Date,
  phase: TrainingPhase
): Record<MuscleId, RecoveryStatus> {
  const last = getMuscleLastTrained(workouts);
  const result = {} as Record<MuscleId, RecoveryStatus>;
  for (const muscle of MUSCLE_IDS) {
    result[muscle] = calculateRecoveryStatus(last[muscle] ?? null, null, now, phase);
  }
  return result;
}

export interface MuscleExercise {
  exercise: Exercise;
  level: "primary" | "secondary";
}

/** Exercises that train a muscle as primary or secondary, primary first. */
export function exercisesForMuscle(muscle: MuscleId): MuscleExercise[] {
  const primary: MuscleExercise[] = [];
  const secondary: MuscleExercise[] = [];
  for (const exercise of Object.values(EXERCISES)) {
    if (exercise.primaryMuscles.includes(muscle)) {
      primary.push({ exercise, level: "primary" });
    } else if (exercise.secondaryMuscles.includes(muscle)) {
      secondary.push({ exercise, level: "secondary" });
    }
  }
  return [...primary, ...secondary];
}
