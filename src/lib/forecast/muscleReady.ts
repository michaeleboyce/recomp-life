// When the muscles the latest workout trained are expected to be ready again, read
// straight from the recovery windows. Pure.
//
// This is an explanation, not a forecast the app stores and scores. Nothing in the log
// records when a muscle has recovered, and the next session that trains a muscle is
// set by the program's rotation, two or three days on, after these times nearly
// always. Scoring a "ready by" date against that session would be right by
// construction, and whether its last set met its own forecast is already scored, by the
// reps forecast, which a short recovery does not enter. See the rule
// `forecast-muscle-ready`.
import { getMuscleLastTrained } from "@/lib/muscleLoad";
import { MUSCLE_LABELS } from "@/lib/muscles";
import { calculateRecoveryStatus, CUTTING_RECOVERY_BONUS_HOURS, RECOVERY_HOURS } from "@/lib/recovery";
import { getCountedExercise } from "@/lib/volumeTracking";
import type { MuscleId, RecoveryStatus, TrainingPhase, WorkoutSession } from "@/types";
import { finishedBy, toMs } from "./log";

const HOUR_MS = 60 * 60 * 1000;

export interface MuscleReadyTime {
  muscle: MuscleId;
  label: string;
  /** When the muscle was last trained (the start of the workout). */
  trainedAt: number;
  /** When the recovery windows call it ready again. */
  readyAt: number;
  /** When they call it at its best ("primed"). */
  primedAt: number;
  /** Its status at `now`, as the recovery windows give it. */
  status: RecoveryStatus;
}

export interface MuscleReadyExplanation {
  workoutId: string;
  /** When that workout was finished, epoch milliseconds. */
  finishedAt: number;
  /** Hours the windows add while cutting (0 otherwise). */
  bonusHours: number;
  /** Soonest ready first. */
  muscles: MuscleReadyTime[];
}

/**
 * The main muscles of the latest workout finished by `now` (the primary muscles of
 * its T1 and T2 lifts, as performed, a home substitute included) and when each is
 * ready again by the recovery windows: RECOVERY_HOURS.ready after it was last
 * trained, primed from RECOVERY_HOURS.primed, both CUTTING_RECOVERY_BONUS_HOURS later
 * while cutting. Null with no finished workout or none with a T1 or T2 lift.
 *
 * @evidence forecast-muscle-ready
 */
export function muscleReadyTimes(
  workouts: WorkoutSession[],
  phase: TrainingPhase,
  now: Date
): MuscleReadyExplanation | null {
  const finished = finishedBy(workouts, now.getTime());
  const latest = finished[finished.length - 1];
  if (!latest) return null;

  const main = new Set<MuscleId>();
  for (const set of latest.sets ?? []) {
    if (set.tier !== "T1" && set.tier !== "T2") continue;
    const exercise = getCountedExercise(set);
    for (const muscle of exercise?.primaryMuscles ?? []) main.add(muscle);
  }
  if (main.size === 0) return null;

  const lastTrained = getMuscleLastTrained(finished);
  const bonusHours = phase.mode === "cutting" ? CUTTING_RECOVERY_BONUS_HOURS : 0;
  const muscles: MuscleReadyTime[] = [];
  for (const muscle of main) {
    const trained = lastTrained[muscle];
    if (!trained) continue;
    const trainedAt = trained.getTime();
    muscles.push({
      muscle,
      label: MUSCLE_LABELS[muscle] ?? muscle,
      trainedAt,
      readyAt: trainedAt + (RECOVERY_HOURS.ready + bonusHours) * HOUR_MS,
      primedAt: trainedAt + (RECOVERY_HOURS.primed + bonusHours) * HOUR_MS,
      status: calculateRecoveryStatus(trained, null, now, phase),
    });
  }
  muscles.sort((a, b) => a.readyAt - b.readyAt || a.label.localeCompare(b.label));
  return { workoutId: latest.id, finishedAt: toMs(latest.completedAt), bonusHours, muscles };
}
