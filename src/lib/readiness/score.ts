import type {
  ActivityLog,
  BodyRegion,
  MuscleId,
  PainSorenessEntry,
  ReadinessContribution,
  ReadinessLog,
  ReadinessScore,
  RunLog,
  SleepHours,
  StressLevel,
  TrainingPhase,
  WorkoutSession,
} from "@/types";
import type { RuleId } from "@/lib/evidence/rules";
import {
  ACTIVITY_HARD_EFFORT,
  ACTIVITY_NOTE_WINDOW_HOURS,
  LOWER_BODY_ACTIVITY_KINDS,
  describeActivity,
  evaluateActivityImpact,
} from "@/lib/activities";
import { REGION_TARGETS, slugMuscles } from "@/lib/anatomy/regionMapping";
import { calendarDaysBetween, formatDaysAgo, HOUR_MS } from "@/lib/dates";
import { EXERCISES } from "@/lib/exercises";
import { REPS_MODEL } from "@/lib/forecast/coefficients";
import { getMuscleLastTrained } from "@/lib/muscleLoad";
import { MUSCLE_LABELS } from "@/lib/muscles";
import { calculateRecoveryStatus } from "@/lib/recovery";
import { plural } from "@/lib/text";
import { RUN_ADVISORY_WINDOW_HOURS, evaluateRunImpact } from "@/lib/runRecovery";
import { median } from "./median";
import { READINESS_WEIGHTS as W, formatPoints } from "./weights";

/**
 * The readiness score: a number from 0 to 100 with the list of things that
 * moved it. It shifts the app's forecasts and nothing else. Nothing in this
 * folder returns or changes what is on the bar.
 */

/** The inputs that can move the score. Also the `id` of each contribution. */
export type ReadinessInputId =
  | "sleep"
  | "stress"
  | "rest-days"
  | "run"
  | "activity"
  | "soreness"
  | "pain";

/** Every input id, for code that walks them all. */
export const READINESS_INPUT_IDS: readonly ReadinessInputId[] = [
  "sleep",
  "stress",
  "rest-days",
  "run",
  "activity",
  "soreness",
  "pain",
];

/** The points each input usually gets for one user. */
export type UsualPoints = Partial<Record<ReadinessInputId, number>>;

/** The sleep and energy answers, with measured sleep when the answer was prefilled. */
export type ReadinessAnswers = Pick<ReadinessLog, "sleepHours" | "stressLevel"> &
  Partial<Pick<ReadinessLog, "sleepMinutes" | "sleepSource">>;

/** Everything is optional: an input that is left out moves nothing. */
export interface ReadinessInputs {
  /** The latest sleep and energy answers, or null before they are given. */
  log?: ReadinessAnswers | null;
  /** Exercises in today's workout, main lift first. */
  exerciseIds?: string[];
  /** Workouts finished before this check-in. Unfinished ones and any after `now` are ignored. */
  workouts?: WorkoutSession[];
  runs?: RunLog[];
  activities?: ActivityLog[];
  /** Body-check entries. Only recent ones where today's workout loads the body count. */
  painEntries?: PainSorenessEntry[];
  /** Defaults to maintaining. */
  phase?: TrainingPhase;
  /**
   * Scores of earlier check-ins; `usual` is their median once there are
   * `READINESS_WEIGHTS.minPastScores` of them. Take these from `readinessUsual`.
   * Passing back scores that were themselves built on a usual makes the usual
   * creep, because every ordinary day adds its points again.
   */
  pastScores?: number[];
  /**
   * The points each input usually gets for this user, from `readinessUsual`.
   * When given (and there are enough past scores), a contribution shows today's
   * points minus the usual ones, so an ordinary day scores the usual.
   */
  usualPoints?: UsualPoints;
}

/** One input as it stands today, in points on the fixed scale. */
interface Factor {
  id: ReadinessInputId;
  label: string;
  detail: string;
  level: number;
  ruleId: RuleId;
}

const DEFAULT_PHASE: TrainingPhase = { mode: "maintaining" };

type DateLike = Date | string | number;
const timeOf = (date: DateLike) => new Date(date).getTime();
const hoursSince = (date: DateLike, now: Date) => (now.getTime() - timeOf(date)) / HOUR_MS;

const sentenceCase = (text: string) => text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** "less than an hour ago", "19 hours ago", "2 days ago". */
function describeAgo(hours: number): string {
  if (hours < 1) return "less than an hour ago";
  if (hours < 48) return `${plural(Math.floor(hours), "hour")} ago`;
  return `${plural(Math.floor(hours / 24), "day")} ago`;
}

const clampScore = (value: number) => Math.min(W.maxScore, Math.max(W.minScore, value));

// ---------------------------------------------------------------------------
// Today's workout
// ---------------------------------------------------------------------------

/**
 * True when the main lift (the first exercise) is a leg lift or the deadlift:
 * the same test `workoutHasLowerBody` applies to a program workout.
 */
export function mainLiftIsLowerBody(exerciseIds: string[]): boolean {
  const mainId = exerciseIds[0];
  const main = mainId ? EXERCISES[mainId] : undefined;
  if (!main) return false;
  return main.muscleGroup === "legs" || mainId === "deadlift";
}

/** Muscles the figure draws inside a pain region; none for joints. */
function regionMuscles(region: BodyRegion): MuscleId[] {
  const muscles = new Set<MuscleId>();
  for (const target of REGION_TARGETS[region] ?? []) {
    if (target.kind !== "shape") continue;
    for (const muscle of slugMuscles(target.slug, target.view)) muscles.add(muscle);
  }
  return [...muscles];
}

interface TodaysWorkout {
  /** Primary muscles, in exercise order. */
  primary: MuscleId[];
  /** Primary and secondary muscles. */
  worked: Set<MuscleId>;
  /** Regions the exercises are sensitive to, joints included. */
  regions: Set<BodyRegion>;
  lowerBody: boolean;
}

function describeWorkout(exerciseIds: string[]): TodaysWorkout {
  const primary: MuscleId[] = [];
  const worked = new Set<MuscleId>();
  const regions = new Set<BodyRegion>();
  for (const id of exerciseIds) {
    const exercise = EXERCISES[id];
    if (!exercise) continue;
    for (const muscle of exercise.primaryMuscles) {
      if (!primary.includes(muscle)) primary.push(muscle);
      worked.add(muscle);
    }
    for (const muscle of exercise.secondaryMuscles) worked.add(muscle);
    for (const region of exercise.painSensitiveRegions) regions.add(region);
  }
  return { primary, worked, regions, lowerBody: mainLiftIsLowerBody(exerciseIds) };
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const SLEEP_LABELS: Record<SleepHours, string> = {
  "7+": "Sleep: 7 hours or more",
  "5-7": "Sleep: 5 to 7 hours",
  "<5": "Sleep: under 5 hours",
};

/** The answer a measured night falls under. */
function sleepAnswerFor(minutes: number): SleepHours {
  if (minutes < 5 * 60) return "<5";
  if (minutes < 7 * 60) return "5-7";
  return "7+";
}

function sleepFactor(log: ReadinessAnswers): Factor {
  const minutes = log.sleepMinutes;
  // The answer decides the points. Measured sleep is shown only while it agrees
  // with the answer, so a user who corrected a prefilled value sees their own.
  const measured =
    typeof minutes === "number" && minutes > 0 && sleepAnswerFor(minutes) === log.sleepHours
      ? minutes
      : null;
  const whole = measured === null ? 0 : Math.round(measured);
  return {
    id: "sleep",
    label:
      measured === null
        ? SLEEP_LABELS[log.sleepHours]
        : `Sleep ${Math.floor(whole / 60)} h ${String(whole % 60).padStart(2, "0")} m`,
    detail:
      measured === null
        ? "Your answer before the workout."
        : log.sleepSource === "apple_health"
          ? "From Apple Health."
          : "Measured sleep, saved with your answer.",
    level: W.sleep[log.sleepHours],
    ruleId: "readiness",
  };
}

function stressFactor(log: ReadinessAnswers): Factor {
  return {
    id: "stress",
    // The answers are "low", "normal" and "good"; "low" is the low-energy one.
    label: `Energy: ${log.stressLevel}`,
    detail: "Your answer to the stress and energy question.",
    level: W.stress[log.stressLevel],
    ruleId: "readiness",
  };
}

const REST_DAY_LABELS = ["No rest day", "One rest day", "Two rest days", "Three rest days"];

function restFactor(
  workout: TodaysWorkout,
  workouts: WorkoutSession[],
  phase: TrainingPhase,
  now: Date
): Factor | null {
  if (workout.primary.length === 0) return null;
  const before = workouts.filter((w) => w.completedAt && timeOf(w.startedAt) < now.getTime());
  const lastTrained = getMuscleLastTrained(before);

  // The muscle in today's workout that was worked most recently sets the status.
  let latest: { muscle: MuscleId; at: Date } | null = null;
  for (const muscle of workout.primary) {
    const at = lastTrained[muscle];
    if (at && (!latest || at.getTime() > latest.at.getTime())) latest = { muscle, at };
  }
  if (!latest) return null;

  const status = calculateRecoveryStatus(latest.at, null, now, phase);
  const muscle = sentenceCase(MUSCLE_LABELS[latest.muscle]);
  const when = formatDaysAgo(latest.at, now).toLowerCase();
  const restDays = Math.max(0, calendarDaysBetween(latest.at, now) - 1);

  if (status === "detraining") {
    return {
      id: "rest-days",
      label: "Long break",
      detail: `${muscle} last worked ${when}. Here a break this long counts the same as being recovered; what it means for today is dealt with when the workout is set up.`,
      level: W.rest.detraining,
      ruleId: "recovery-windows",
    };
  }
  const phrase = { recovering: "still recovering", ready: "recovered", primed: "fully rested" }[status];
  return {
    id: "rest-days",
    label: REST_DAY_LABELS[restDays] ?? `${restDays} rest days`,
    detail: `${muscle} last worked ${when}; ${phrase}.`,
    level: W.rest[status],
    ruleId: "recovery-windows",
  };
}

const RUN_NAMES: Record<RunLog["category"], string> = {
  easy: "easy",
  tempo: "tempo",
  intervals: "interval",
  long: "long",
  other: "",
};

function describeRun(run: RunLog): string {
  const miles = run.distanceMiles ? `${Math.round(run.distanceMiles * 10) / 10} mile` : "";
  return capitalise([RUN_NAMES[run.category], miles, "run"].filter(Boolean).join(" "));
}

function runFactor(
  workout: TodaysWorkout,
  runs: RunLog[],
  phase: TrainingPhase,
  now: Date
): Factor | null {
  const recent = runs
    .filter((run) => {
      const hours = hoursSince(run.date, now);
      return hours >= 0 && hours <= RUN_ADVISORY_WINDOW_HOURS;
    })
    .sort((a, b) => timeOf(b.date) - timeOf(a.date));
  const advisory = evaluateRunImpact(recent, workout.lowerBody, now, phase);
  if (advisory.level === "none") return null;

  // The run check judges the most recent run in its window.
  const run = recent[0];
  const strong = advisory.level === "strong";
  const facts = `${describeAgo(hoursSince(run.date, now))}, effort ${run.perceivedEffort} of 5.`;
  return {
    id: "run",
    label: describeRun(run),
    detail: capitalise(
      strong ? `${facts} A hard run this recent usually leaves the legs tired.` : facts
    ),
    level: strong ? W.run.strong : W.run.advisory,
    ruleId: advisory.evidenceId ?? "run-interference",
  };
}

function activityFactor(
  workout: TodaysWorkout,
  activities: ActivityLog[],
  now: Date
): Factor | null {
  const recent = activities
    .filter((activity) => {
      const hours = hoursSince(activity.date, now);
      return hours >= 0 && hours <= ACTIVITY_NOTE_WINDOW_HOURS;
    })
    .sort((a, b) => timeOf(b.date) - timeOf(a.date));
  const note = evaluateActivityImpact(recent, workout.lowerBody, now);
  if (!note) return null;

  // The session the activity check picked: the most recent hard one that applies.
  const session = recent.find(
    (activity) =>
      activity.perceivedEffort !== null &&
      activity.perceivedEffort >= ACTIVITY_HARD_EFFORT &&
      (workout.lowerBody || !LOWER_BODY_ACTIVITY_KINDS.includes(activity.kind))
  );
  const kind = session && session.kind !== "other" ? describeActivity(session).toLowerCase() : "";
  return {
    id: "activity",
    label: kind ? `Hard session: ${kind}` : "Hard session",
    detail: session
      ? capitalise(
          `${describeAgo(hoursSince(session.date, now))}, effort ${session.perceivedEffort} of 5.`
        )
      : "In the last day.",
    level: W.hardActivity,
    ruleId: note.evidenceId,
  };
}

const SEVERITY_WORDS = ["minimal", "mild", "moderate", "significant", "severe"];

/** The worst entry of one kind that is recent and where today's workout loads the body. */
function worstEntry(
  entries: PainSorenessEntry[],
  sensation: PainSorenessEntry["sensation"],
  windowHours: number,
  workout: TodaysWorkout,
  now: Date
): PainSorenessEntry | null {
  let worst: PainSorenessEntry | null = null;
  for (const entry of entries) {
    if (entry.sensation !== sensation) continue;
    const hours = hoursSince(entry.date, now);
    if (hours < 0 || hours > windowHours) continue;
    const involved =
      workout.regions.has(entry.region) ||
      regionMuscles(entry.region).some((muscle) => workout.worked.has(muscle));
    if (!involved) continue;
    const better =
      !worst ||
      entry.severity > worst.severity ||
      (entry.severity === worst.severity && timeOf(entry.date) > timeOf(worst.date));
    if (better) worst = entry;
  }
  return worst;
}

function sorenessFactor(
  workout: TodaysWorkout,
  entries: PainSorenessEntry[],
  now: Date
): Factor | null {
  const entry = worstEntry(entries, "soreness", W.sorenessWindowHours, workout, now);
  if (!entry) return null;
  return {
    id: "soreness",
    label: `Sore ${entry.region.replace(/_/g, " ")}: ${SEVERITY_WORDS[entry.severity - 1]}`,
    detail: `Body check, ${describeAgo(hoursSince(entry.date, now))}.`,
    level: Math.max(W.sorenessFloor, entry.severity * W.sorenessPerSeverity),
    // No rule of its own covers soreness, so it carries this score's own grade.
    ruleId: "readiness-score",
  };
}

function painFactor(
  workout: TodaysWorkout,
  entries: PainSorenessEntry[],
  now: Date
): Factor | null {
  const entry = worstEntry(entries, "pain", W.painWindowDays * 24, workout, now);
  if (!entry) return null;
  return {
    id: "pain",
    label: `${capitalise(entry.region.replace(/_/g, " "))} pain: ${SEVERITY_WORDS[entry.severity - 1]}`,
    detail: `Body check, ${describeAgo(hoursSince(entry.date, now))}.`,
    level: Math.max(W.painFloor, entry.severity * W.painPerSeverity),
    ruleId: "training-with-pain",
  };
}

function readinessFactors(inputs: ReadinessInputs, now: Date): Factor[] {
  const workout = describeWorkout(inputs.exerciseIds ?? []);
  const phase = inputs.phase ?? DEFAULT_PHASE;
  const entries = inputs.painEntries ?? [];
  const factors: (Factor | null)[] = [
    restFactor(workout, inputs.workouts ?? [], phase, now),
    inputs.log ? stressFactor(inputs.log) : null,
    inputs.log ? sleepFactor(inputs.log) : null,
    sorenessFactor(workout, entries, now),
    painFactor(workout, entries, now),
    runFactor(workout, inputs.runs ?? [], phase, now),
    activityFactor(workout, inputs.activities ?? [], now),
  ];
  return factors.filter((factor): factor is Factor => factor !== null);
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

/**
 * Inputs where nothing logged means nothing happened, so their usual cost is
 * given back on a day without them. For the others (sleep, energy, rest) a
 * missing value is unknown and the usual is assumed.
 */
export const EVENT_INPUTS: readonly ReadinessInputId[] = ["run", "activity", "soreness", "pain"];

const ABSENT: Partial<Record<ReadinessInputId, { label: string; what: string; ruleId: RuleId }>> = {
  run: {
    label: "No recent run",
    what: "a run before the workout; there was none this time",
    ruleId: "run-interference",
  },
  activity: {
    label: "No hard session beforehand",
    what: "a hard session in the day before; there was none this time",
    ruleId: "activity-fatigue",
  },
  soreness: {
    label: "No soreness logged",
    what: "soreness; none is logged this time",
    ruleId: "readiness-score",
  },
  pain: {
    label: "No pain logged",
    what: "pain; none is logged this time",
    ruleId: "training-with-pain",
  },
};

/**
 * The readiness score for one check-in.
 *
 * `usual` is the median of `pastScores`, or `READINESS_WEIGHTS.defaultUsual`
 * until there are enough. Each contribution carries signed points and the
 * rule of its input, and `usual` plus the points equals the score before it is
 * clamped to the range. With `usualPoints`, the points are measured against
 * what each input usually is for this user.
 *
 * @evidence readiness-score
 */
export function readinessScore(inputs: ReadinessInputs, now: Date): ReadinessScore {
  const pastScores = inputs.pastScores ?? [];
  const hasUsual = pastScores.length >= W.minPastScores;
  const usual = hasUsual ? Math.round(median(pastScores)) : W.defaultUsual;
  const usualPoints: UsualPoints = hasUsual ? (inputs.usualPoints ?? {}) : {};

  const factors = readinessFactors(inputs, now);
  const contributions: ReadinessContribution[] = factors.map((factor) => {
    const usualLevel = usualPoints[factor.id] ?? 0;
    return {
      id: factor.id,
      label: factor.label,
      detail: usualLevel
        ? `${factor.detail} This is usually ${formatPoints(usualLevel)} for you, so only the difference counts.`
        : factor.detail,
      points: factor.level - usualLevel,
      ruleId: factor.ruleId,
    };
  });

  for (const id of EVENT_INPUTS) {
    const usualLevel = usualPoints[id] ?? 0;
    const absent = ABSENT[id];
    if (!usualLevel || !absent || factors.some((factor) => factor.id === id)) continue;
    contributions.push({
      id,
      label: absent.label,
      detail: `Your usual includes ${formatPoints(usualLevel)} for ${absent.what}.`,
      points: -usualLevel,
      ruleId: absent.ruleId,
    });
  }

  // Biggest movers first; equal sizes keep the order above.
  contributions.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));

  const total = contributions.reduce((sum, c) => sum + c.points, 0);
  return {
    score: clampScore(usual + total),
    usual,
    contributions,
    suggestSkippingAccessories: shouldSuggestSkippingAccessories(inputs.log),
  };
}

/**
 * The one plan change readiness may suggest: under 5 hours of sleep together
 * with low energy. The same rule the pre-workout check applies. It is a
 * suggestion to drop optional work, and the user can ignore it.
 *
 * @evidence readiness
 */
export function shouldSuggestSkippingAccessories(
  log:
    | { sleepHours: SleepHours | null | undefined; stressLevel: StressLevel | null | undefined }
    | null
    | undefined
): boolean {
  return log?.sleepHours === "<5" && log?.stressLevel === "low";
}

/**
 * How far a forecast's strength level moves for this score, as a fraction:
 * positive above the usual, negative below, zero on a usual day.
 *
 * @evidence forecast-reps
 */
export function readinessLevelShift(score: Pick<ReadinessScore, "score" | "usual">): number {
  return (score.score - score.usual) * REPS_MODEL.readinessLevelShiftPerPoint;
}
