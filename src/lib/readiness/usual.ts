import type {
  ActivityLog,
  PainSorenessEntry,
  ReadinessLog,
  ReadinessScore,
  RunLog,
  TrainingPhase,
  WorkoutSession,
} from "@/types";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { median } from "./median";
import {
  EVENT_INPUTS,
  READINESS_INPUT_IDS,
  readinessScore,
  type ReadinessAnswers,
  type UsualPoints,
} from "./score";
import { READINESS_WEIGHTS as W } from "./weights";

/** The app's records the score is worked out from, as the read hooks return them. */
export interface ReadinessRecords {
  readinessLogs: ReadinessLog[];
  workouts: WorkoutSession[];
  runs: RunLog[];
  activities: ActivityLog[];
  painEntries: PainSorenessEntry[];
  /** Today's phase. A past check-in uses the phase saved with its workout when there is one. */
  phase: TrainingPhase;
}

/** What a user's earlier check-ins looked like. Spread into the inputs of `readinessScore`. */
export interface ReadinessUsual {
  /** Each earlier check-in scored from the default baseline, oldest first. */
  pastScores: number[];
  /** The median points of each input over those check-ins, where it is not zero. */
  usualPoints: UsualPoints;
}

export interface ReadinessToday {
  /** Today's sleep and energy answers, once given. */
  log?: ReadinessAnswers | null;
  /** Exercises in today's workout, main lift first. */
  exerciseIds: string[];
  /** Today's workout once it has started, so it and its check-in are not read as history. */
  sessionId?: string;
}

const timeOf = (date: Date | string | number) => new Date(date).getTime();

/** The exercises a workout was built from, main lift first. */
function sessionExerciseIds(session: WorkoutSession): string[] {
  const planned =
    session.prescribed ??
    WORKOUT_TEMPLATES[session.templateId]?.exercises.filter(
      (e) => e.tier === "T1" || e.tier === "T2" || e.tier === "T3"
    ) ??
    [];
  const ids =
    planned.length > 0
      ? planned.map((e) => e.exerciseId)
      : session.sets.filter((set) => set.tier !== "warmup").map((set) => set.exerciseId);
  return [...new Set(ids)];
}

/**
 * The user's usual, from their most recent check-ins before `now`.
 *
 * Each earlier check-in is scored on its own, from the default baseline and
 * from what was known at the time, so the result never depends on a score the
 * app showed before and the usual cannot feed on itself. A check-in is a
 * readiness log whose workout still exists.
 *
 * @evidence readiness-score
 */
export function readinessUsual(
  records: ReadinessRecords,
  now: Date,
  /** Today's workout, left out together with its check-in. */
  sessionId?: string
): ReadinessUsual {
  const workoutsById = new Map(records.workouts.map((w) => [w.id, w]));
  const checkIns = records.readinessLogs
    .filter(
      (log) =>
        log.sessionId !== sessionId &&
        timeOf(log.date) < now.getTime() &&
        workoutsById.has(log.sessionId)
    )
    .sort((a, b) => timeOf(a.date) - timeOf(b.date))
    .slice(-W.usualWindow);

  const results = checkIns.map((log) => {
    const session = workoutsById.get(log.sessionId) as WorkoutSession;
    return readinessScore(
      {
        log,
        exerciseIds: sessionExerciseIds(session),
        // Its own workout is not rest before itself.
        workouts: records.workouts.filter((w) => w.id !== session.id),
        runs: records.runs,
        activities: records.activities,
        painEntries: records.painEntries,
        phase: session.completionContext
          ? { mode: session.completionContext.phaseMode }
          : records.phase,
      },
      new Date(log.date)
    );
  });

  const usualPoints: UsualPoints = {};
  for (const id of READINESS_INPUT_IDS) {
    const values: number[] = [];
    for (const result of results) {
      const contribution = result.contributions.find((c) => c.id === id);
      if (contribution) values.push(contribution.points);
      // Nothing logged means it did not happen; a missing answer is just unknown.
      else if (EVENT_INPUTS.includes(id)) values.push(0);
    }
    if (values.length < W.minPastScores) continue;
    const usual = Math.round(median(values));
    if (usual !== 0) usualPoints[id] = usual;
  }

  return { pastScores: results.map((result) => result.score), usualPoints };
}

/**
 * Today's readiness score from the app's records: today's inputs measured
 * against the user's own earlier check-ins.
 */
export function readinessFromRecords(
  records: ReadinessRecords,
  today: ReadinessToday,
  now: Date
): ReadinessScore {
  return readinessScore(
    {
      log: today.log ?? null,
      exerciseIds: today.exerciseIds,
      workouts: today.sessionId
        ? records.workouts.filter((w) => w.id !== today.sessionId)
        : records.workouts,
      runs: records.runs,
      activities: records.activities,
      painEntries: records.painEntries,
      phase: records.phase,
      ...readinessUsual(records, now, today.sessionId),
    },
    now
  );
}
