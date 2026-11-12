import type { ActivityKind, ActivityLog, RunLog, YogaStyle } from '@/types';
import type { RuleId } from '@/lib/evidence/rules';

/** Kinds in the order they are offered when logging. */
export const ACTIVITY_KINDS: readonly ActivityKind[] = [
  'yoga',
  'cycling',
  'hiking',
  'walking',
  'other',
];

export const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  yoga: 'Yoga',
  cycling: 'Cycling',
  hiking: 'Hiking',
  walking: 'Walking',
  other: 'Other',
};

export const YOGA_STYLES: readonly YogaStyle[] = ['restorative', 'flow', 'power'];

export const YOGA_STYLE_LABELS: Record<YogaStyle, string> = {
  restorative: 'Restorative',
  flow: 'Flow',
  power: 'Power',
};

/** Kinds where distance is worth recording. */
export const DISTANCE_KINDS: readonly ActivityKind[] = ['cycling', 'hiking', 'walking'];

/** Hours after a hard session during which the pre-workout note can appear. */
export const ACTIVITY_NOTE_WINDOW_HOURS = 24;

/** Perceived effort (1-5) at or above which a session counts as hard. */
export const ACTIVITY_HARD_EFFORT = 4;

/**
 * Kinds that load the legs only. They are mentioned before a lower-body T1
 * lift and ignored otherwise; yoga and "other" are mentioned before any workout.
 */
export const LOWER_BODY_ACTIVITY_KINDS: readonly ActivityKind[] = [
  'cycling',
  'hiking',
  'walking',
];

export interface ActivityNote {
  message: string;
  evidenceId: RuleId;
}

/** How a session reads in a sentence: "yoga session", "ride", "hike". */
const SESSION_NOUNS: Record<ActivityKind, string> = {
  yoga: 'yoga session',
  cycling: 'ride',
  hiking: 'hike',
  walking: 'walk',
  other: 'session',
};

function describeHoursAgo(hours: number): string {
  const rounded = Math.round(hours);
  return rounded < 1 ? 'less than an hour ago' : `${rounded}h ago`;
}

/**
 * Looks for a hard non-running session shortly before a workout and returns a
 * note about it, or null when there is nothing worth mentioning.
 *
 * A session counts when it was rated ACTIVITY_HARD_EFFORT or more and happened
 * within ACTIVITY_NOTE_WINDOW_HOURS. Leg-only kinds count only before a
 * lower-body T1 lift. The note never changes weights or progression.
 *
 * @evidence activity-fatigue
 */
export function evaluateActivityImpact(
  recentActivities: ActivityLog[],
  nextWorkoutHasLowerBody: boolean,
  now: Date
): ActivityNote | null {
  const hoursSince = (a: ActivityLog) =>
    (now.getTime() - new Date(a.date).getTime()) / (1000 * 60 * 60);

  const relevant = recentActivities
    .filter((a) => {
      const hours = hoursSince(a);
      return hours >= 0 && hours <= ACTIVITY_NOTE_WINDOW_HOURS;
    })
    .filter((a) => a.perceivedEffort >= ACTIVITY_HARD_EFFORT)
    .filter(
      (a) => nextWorkoutHasLowerBody || !LOWER_BODY_ACTIVITY_KINDS.includes(a.kind)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const mostRecent = relevant[0];
  if (!mostRecent) return null;

  return {
    message: `Hard ${SESSION_NOUNS[mostRecent.kind]} ${describeHoursAgo(hoursSince(mostRecent))}. See how your warm-ups feel before deciding on today's weights.`,
    evidenceId: 'activity-fatigue',
  };
}

/** Title for a logged activity: "Power yoga", "Cycling". */
export function describeActivity(activity: Pick<ActivityLog, 'kind' | 'style'>): string {
  if (activity.kind === 'yoga' && activity.style) {
    return `${YOGA_STYLE_LABELS[activity.style]} yoga`;
  }
  return ACTIVITY_KIND_LABELS[activity.kind];
}

const WEEK_NOUNS: Record<ActivityKind | 'run', [singular: string, plural: string]> = {
  run: ['run', 'runs'],
  yoga: ['yoga', 'yoga'],
  cycling: ['ride', 'rides'],
  hiking: ['hike', 'hikes'],
  walking: ['walk', 'walks'],
  other: ['other', 'other'],
};

/**
 * One-line count of the non-lifting sessions in a set of logs, for example
 * "1 run · 2 yoga". Returns an empty string when there are none.
 */
export function summariseOtherSessions(
  runs: Pick<RunLog, 'id'>[],
  activities: Pick<ActivityLog, 'kind'>[]
): string {
  const counts: [keyof typeof WEEK_NOUNS, number][] = [
    ['run', runs.length],
    ...ACTIVITY_KINDS.map(
      (kind) => [kind, activities.filter((a) => a.kind === kind).length] as [ActivityKind, number]
    ),
  ];
  return counts
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${count} ${WEEK_NOUNS[key][count === 1 ? 0 : 1]}`)
    .join(' · ');
}
