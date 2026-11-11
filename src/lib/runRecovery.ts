import type { RunLog, TrainingPhase } from '@/types';
import { WORKOUT_TEMPLATES } from '@/lib/workoutTemplates';
import { EXERCISES } from '@/lib/exercises';

export interface RunAdvisory {
  level: 'none' | 'advisory' | 'strong';
  message: string;
  suggestedAction?: 'proceed' | 'extra_warmups' | 'reduce_10';
}

/**
 * Hours after a hard run during which leg strength is most likely reduced.
 * In training studies, strength gains suffered when sessions were back to
 * back but not when they were 6 hours apart.
 */
export const RUN_STRONG_WINDOW_HOURS = 6;

/** Hours after a run during which a lighter advisory can still appear. */
export const RUN_ADVISORY_WINDOW_HOURS = 24;

/** Minutes at which a non-easy run counts as long. */
export const RUN_LONG_MINUTES = 45;

/** Perceived effort (1-5) at or above which any recent run counts as hard. */
export const RUN_HARD_EFFORT = 4;

/**
 * Perceived effort (1-5) at which a run within the advisory window triggers
 * the lighter advisory, by run category. Faster running gets a lower bar.
 * These category thresholds are a coaching heuristic.
 */
export const RUN_ADVISORY_EFFORT_THRESHOLD: Record<RunLog['category'], number> = {
  intervals: 2,
  tempo: 2,
  long: 3,
  other: 3,
  easy: 4,
};

/**
 * Evaluate the impact of recent runs on an upcoming workout.
 *
 * - strong: a hard run (effort >= RUN_HARD_EFFORT, or a non-easy run of
 *   RUN_LONG_MINUTES or more) within RUN_STRONG_WINDOW_HOURS. Suggests
 *   reducing the T1 load, never skipping the session.
 * - advisory: a run within RUN_ADVISORY_WINDOW_HOURS at or above the effort
 *   threshold for its category.
 *
 * The user always decides; both levels can be dismissed.
 *
 * @evidence run-interference
 */
export function evaluateRunImpact(
  recentRuns: RunLog[],
  nextWorkoutHasLowerBody: boolean,
  now: Date,
  phase: TrainingPhase
): RunAdvisory {
  if (!nextWorkoutHasLowerBody) return { level: 'none', message: '' };

  const hoursSinceRun = (r: RunLog) =>
    (now.getTime() - new Date(r.date).getTime()) / (1000 * 60 * 60);

  const runsInWindow = recentRuns.filter(
    (r) => hoursSinceRun(r) <= RUN_ADVISORY_WINDOW_HOURS
  );

  if (runsInWindow.length === 0) return { level: 'none', message: '' };

  const mostRecent = [...runsInWindow].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )[0];

  const hoursSince = hoursSinceRun(mostRecent);

  const isHardRun =
    mostRecent.perceivedEffort >= RUN_HARD_EFFORT ||
    (mostRecent.category !== 'easy' &&
      mostRecent.durationMinutes >= RUN_LONG_MINUTES);

  // Strong advisory: hard run only a few hours ago
  if (hoursSince <= RUN_STRONG_WINDOW_HOURS && isHardRun) {
    let message = `Hard ${mostRecent.category} run ${Math.round(hoursSince)}h ago. Your legs are likely still fatigued. Consider reducing T1 by 10% or lifting later today.`;
    if (
      phase.mode === 'cutting' &&
      mostRecent.category === 'long' &&
      mostRecent.durationMinutes >= RUN_LONG_MINUTES
    ) {
      message += ' Consider extra carbs before your session (glycogen depletion on a cut).';
    }
    return { level: 'strong', message, suggestedAction: 'reduce_10' };
  }

  // Standard advisory
  const effortThreshold = RUN_ADVISORY_EFFORT_THRESHOLD[mostRecent.category];
  if (mostRecent.perceivedEffort >= effortThreshold) {
    return {
      level: 'advisory',
      message: `${mostRecent.category} run ${Math.round(hoursSince)}h ago (effort ${mostRecent.perceivedEffort}/5). Options: proceed, add extra warm-ups, or reduce T1 by 10%.`,
      suggestedAction: 'extra_warmups',
    };
  }

  return { level: 'none', message: '' };
}

/**
 * Determine if a workout template's T1 exercise targets lower body.
 * Returns true if the T1 exercise is squat or deadlift.
 */
export function workoutHasLowerBody(templateId: string): boolean {
  const template = WORKOUT_TEMPLATES[templateId];
  if (!template) return false;

  const t1Exercise = template.exercises.find((e) => e.tier === 'T1');
  if (!t1Exercise) return false;

  const exercise = EXERCISES[t1Exercise.exerciseId];
  if (!exercise) return false;

  return exercise.muscleGroup === 'legs' || t1Exercise.exerciseId === 'deadlift';
}
