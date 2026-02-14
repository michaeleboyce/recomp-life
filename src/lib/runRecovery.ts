import type { RunLog, TrainingPhase } from '@/types';
import { WORKOUT_TEMPLATES } from '@/lib/workoutTemplates';
import { EXERCISES } from '@/lib/exercises';

export interface RunAdvisory {
  level: 'none' | 'advisory' | 'strong_rest';
  message: string;
  suggestedAction?: 'proceed' | 'extra_warmups' | 'reduce_10' | 'rest';
}

/**
 * Evaluate the impact of recent runs on an upcoming workout.
 *
 * Per spec section 7.2: category-refined thresholds determine when to issue
 * advisories for lower body training after running.
 */
export function evaluateRunImpact(
  recentRuns: RunLog[],
  nextWorkoutHasLowerBody: boolean,
  now: Date,
  phase: TrainingPhase
): RunAdvisory {
  if (!nextWorkoutHasLowerBody) return { level: 'none', message: '' };

  // Find runs within 24h
  const runsWithin24h = recentRuns.filter((r) => {
    const hoursSince = (now.getTime() - new Date(r.date).getTime()) / (1000 * 60 * 60);
    return hoursSince <= 24;
  });

  if (runsWithin24h.length === 0) return { level: 'none', message: '' };

  const mostRecent = runsWithin24h.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )[0];

  const hoursSince = (now.getTime() - new Date(mostRecent.date).getTime()) / (1000 * 60 * 60);

  // Category-refined thresholds (spec section 7.2)
  let effortThreshold = 3;
  if (mostRecent.category === 'intervals' || mostRecent.category === 'tempo') {
    effortThreshold = 2; // lower threshold for high-interference runs
  }
  if (mostRecent.category === 'easy') {
    effortThreshold = 4; // higher threshold for easy runs
  }

  // Strong rest advisory
  if (hoursSince <= 12 && (mostRecent.perceivedEffort >= 4 || mostRecent.durationMinutes >= 45)) {
    let message = `High-effort run ${Math.round(hoursSince)}h ago. Lower body recovery is likely insufficient.`;
    if (phase.mode === 'cutting' && mostRecent.category === 'long' && mostRecent.durationMinutes >= 45) {
      message += ' Consider extra carbs before your session (glycogen depletion on a cut).';
    }
    return { level: 'strong_rest', message, suggestedAction: 'rest' };
  }

  // Standard advisory
  if (hoursSince <= 24 && mostRecent.perceivedEffort >= effortThreshold) {
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
