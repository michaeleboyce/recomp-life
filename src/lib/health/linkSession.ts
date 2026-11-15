// Finds the Apple Watch strength workout recorded during a lifting session. Pure.
import { isStrengthWorkout } from "./mapWorkout";
import type { HealthWorkout, SessionHealth } from "./types";

/** Share of the lifting session a Watch workout must cover to be linked to it. */
export const HEALTH_SESSION_OVERLAP = 0.5;

interface SessionWindow {
  startedAt: Date | string;
  completedAt: Date | string | null;
}

function overlapMs(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

/**
 * Heart rate and energy from the strength workout that overlaps a finished
 * lifting session by at least HEALTH_SESSION_OVERLAP of the session's length.
 * When several qualify, the one with the most overlap wins. Returns null for
 * an unfinished session or when nothing qualifies.
 */
export function linkSessionWorkout(
  session: SessionWindow,
  workouts: readonly HealthWorkout[]
): SessionHealth | null {
  if (!session.completedAt) return null;
  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.completedAt).getTime();
  const length = end - start;
  if (!(length > 0)) return null;

  let best: HealthWorkout | null = null;
  let bestOverlap = 0;
  for (const workout of workouts) {
    if (!isStrengthWorkout(workout)) continue;
    const overlap = overlapMs(start, end, workout.start.getTime(), workout.end.getTime());
    if (overlap / length >= HEALTH_SESSION_OVERLAP && overlap > bestOverlap) {
      best = workout;
      bestOverlap = overlap;
    }
  }
  if (!best) return null;

  return {
    externalId: best.uuid,
    sourceName: best.sourceName,
    avgHeartRate: best.avgHeartRate,
    maxHeartRate: best.maxHeartRate,
    activeEnergyKcal: best.activeEnergyKcal,
    durationSeconds: best.durationSeconds,
  };
}
