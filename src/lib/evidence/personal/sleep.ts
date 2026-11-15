// "Your own numbers" for short sleep before a workout. Pure.
import { isLive, toMs } from "@/lib/forecast/log";
import { SLEEP_FULL_HOURS, SLEEP_SHORT_HOURS } from "@/lib/health/sleep";
import type { ReadinessLog, SleepHours } from "@/types";
import { PERSONAL_MIN_GROUP_SIZE } from "./constants";
import { EXPECTED_SENTENCE } from "./copy";
import { lastSetResiduals } from "./expected";
import { compareStrata, rangeSentence } from "./stats";
import type { PersonalEvidence, PersonalLog } from "./types";

/** The sleep answers that count as short; "7+" is the one compared with. */
const SHORT_SLEEP: ReadonlySet<SleepHours> = new Set<SleepHours>(["<5", "5-7"]);

/**
 * The check-in of each workout, by workout id: the live one, or the latest updated when
 * there are several.
 */
export function checkInFor(logs: ReadinessLog[]): Map<string, ReadinessLog> {
  const out = new Map<string, ReadinessLog>();
  for (const log of logs) {
    if (!isLive(log)) continue;
    const held = out.get(log.sessionId);
    const newer =
      !held ||
      (log.updatedAt ?? 0) > (held.updatedAt ?? 0) ||
      ((log.updatedAt ?? 0) === (held.updatedAt ?? 0) && toMs(log.date) > toMs(held.date));
    if (newer) out.set(log.sessionId, log);
  }
  return out;
}

/**
 * Reps on the last set of every main lift against what was expected for that session
 * (`lastSetResiduals`), after a short night ("under 5 hours" or "5 to 7 hours" in the
 * check-in) against after "7 hours or more". Workouts with no check-in are left out.
 * Never a cause: a hint.
 */
export function sleepEvidence(log: PersonalLog, now: Date): PersonalEvidence {
  const answers = checkInFor(log.readinessLogs);
  const exposed: number[] = [];
  const reference: number[] = [];
  for (const row of lastSetResiduals(log, now)) {
    const answer = answers.get(row.workoutId)?.sleepHours;
    if (!answer) continue;
    if (SHORT_SLEEP.has(answer)) exposed.push(row.residual);
    else reference.push(row.residual);
  }
  const comparison = compareStrata([{ exposed, reference }]);
  const full = SLEEP_FULL_HOURS;

  return {
    ruleId: "readiness",
    unit: { one: "session", many: "sessions" },
    exposed: {
      label: `reps against expected after under ${full} hours of sleep`,
      name: `after under ${full} hours of sleep`,
      count: comparison.exposedCount,
    },
    reference: {
      label: `reps against expected after ${full} hours or more`,
      name: `after ${full} hours or more`,
      count: comparison.referenceCount,
    },
    unmatched: comparison.unmatched,
    unmatchedReason: null,
    minPerGroup: PERSONAL_MIN_GROUP_SIZE,
    needed: comparison.needed,
    result: comparison.result,
    method: [
      `Each workout's last set of its main lift. ${EXPECTED_SENTENCE}`,
      `Short sleep is the answer "under ${SLEEP_SHORT_HOURS} hours" or "${SLEEP_SHORT_HOURS} to ${full} hours" in the check-in before the workout; it is compared with "${full} hours or more". Workouts with no check-in are left out.`,
      rangeSentence(),
    ],
  };
}
