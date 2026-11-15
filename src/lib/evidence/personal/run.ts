// "Your own numbers" for a hard run or session the day before a leg workout. Pure.
import { EXERCISES } from "@/lib/exercises";
import { isLive, toMs } from "@/lib/forecast/log";
import type { ActivityLog, RunLog } from "@/types";
import {
  HARD_ACTIVITY_EFFORT,
  HARD_RUN_EFFORT,
  HARD_SESSION_WINDOW_HOURS,
  PERSONAL_MIN_GROUP_SIZE,
} from "./constants";
import { lastSetResiduals } from "./expected";
import { EXPECTED_SENTENCE } from "./copy";
import { compareStrata, rangeSentence } from "./stats";
import type { PersonalEvidence, PersonalLog } from "./types";

const HOUR_MS = 60 * 60 * 1000;

/** A leg lift or the deadlift: the lifts the run rule checks. */
export function isLowerBodyLift(exerciseId: string): boolean {
  const exercise = EXERCISES[exerciseId];
  if (!exercise) return false;
  return exercise.muscleGroup === "legs" || exerciseId === "deadlift";
}

/**
 * Whether a hard run or other session came in the HARD_SESSION_WINDOW_HOURS before a
 * workout that started at `startMs`: "hard" for one rated HARD_RUN_EFFORT (a run) or
 * HARD_ACTIVITY_EFFORT (anything else) or more; "unknown" when there was none of
 * those but there was a run or session with no rating, which might have been hard (an
 * unrated walk does not count); "none" otherwise.
 */
export function hardSessionBefore(
  startMs: number,
  runs: RunLog[],
  activities: ActivityLog[]
): "hard" | "none" | "unknown" {
  const inWindow = (date: Date) => {
    const t = toMs(date);
    return t < startMs && t >= startMs - HARD_SESSION_WINDOW_HOURS * HOUR_MS;
  };
  const liveRuns = runs.filter((r) => isLive(r) && inWindow(r.date));
  const liveActivities = activities.filter((a) => isLive(a) && inWindow(a.date));
  const hard =
    liveRuns.some((r) => r.perceivedEffort !== null && r.perceivedEffort >= HARD_RUN_EFFORT) ||
    liveActivities.some(
      (a) => a.perceivedEffort !== null && a.perceivedEffort >= HARD_ACTIVITY_EFFORT
    );
  if (hard) return "hard";
  const unrated =
    liveRuns.some((r) => r.perceivedEffort === null) ||
    liveActivities.some((a) => a.perceivedEffort === null && a.kind !== "walking");
  return unrated ? "unknown" : "none";
}

/**
 * Reps on the last set of a leg main lift against what was expected for that session
 * (`lastSetResiduals`), after a hard run or session in the day before against without.
 * Never a cause: a hint.
 */
export function runEvidence(log: PersonalLog, now: Date): PersonalEvidence {
  const exposed: number[] = [];
  const reference: number[] = [];
  for (const row of lastSetResiduals(log, now, isLowerBodyLift)) {
    const before = hardSessionBefore(row.startedAt, log.runs, log.activities);
    if (before === "hard") exposed.push(row.residual);
    else if (before === "none") reference.push(row.residual);
  }
  const comparison = compareStrata([{ exposed, reference }]);
  const hours = HARD_SESSION_WINDOW_HOURS;
  const effort =
    HARD_RUN_EFFORT === HARD_ACTIVITY_EFFORT
      ? `${HARD_RUN_EFFORT} or more out of 5`
      : `${HARD_RUN_EFFORT} or more out of 5 for a run, ${HARD_ACTIVITY_EFFORT} or more for anything else`;

  return {
    ruleId: "run-interference",
    unit: { one: "leg session", many: "leg sessions" },
    exposed: {
      label: `reps against expected within ${hours} hours of a hard run or session`,
      name: `within ${hours} hours of a hard run or session`,
      count: comparison.exposedCount,
    },
    reference: {
      label: "reps against expected without one",
      name: `with no hard run or session in the ${hours} hours before`,
      count: comparison.referenceCount,
    },
    unmatched: comparison.unmatched,
    unmatchedReason: null,
    minPerGroup: PERSONAL_MIN_GROUP_SIZE,
    needed: comparison.needed,
    result: comparison.result,
    method: [
      `Each workout's last set of squat, deadlift or another leg main lift. ${EXPECTED_SENTENCE}`,
      `A hard run or session is one rated ${effort} in the ${hours} hours before the workout started. Workouts after a run or session with no rating (other than a walk) are left out, since how hard it was is not known; so are lifts lightened for a run, whose reps do not measure strength.`,
      rangeSentence(),
    ],
  };
}
