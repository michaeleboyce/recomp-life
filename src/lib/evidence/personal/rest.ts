// "Your own numbers" for rest after heavy sets: did the next set come up shorter after
// a short rest than after the full one? Pure.
import { finishedBy, toMs } from "@/lib/forecast/log";
import { formatRestDuration, getRestSeconds } from "@/lib/restTimes";
import type { SetLog, WorkoutSession } from "@/types";
import {
  MAX_SET_GAP_SECONDS,
  PERSONAL_MIN_GROUP_SIZE,
  SET_DURATION_ALLOWANCE_SECONDS,
  SHORT_REST_MARGIN_SECONDS,
} from "./constants";
import { compareStrata, rangeSentence, type Stratum } from "./stats";
import type { PersonalEvidence, PersonalLog } from "./types";

type HeavyTier = "T1" | "T2";
const HEAVY_TIERS: readonly HeavyTier[] = ["T1", "T2"];

/** Sets whose reps measure what the lifter could do at the planned weight. */
const MEASURED_STATUSES: ReadonlySet<SetLog["status"]> = new Set(["completed", "failed"]);

/** One heavy set with the rest before it. */
export interface RestPair {
  workoutId: string;
  exerciseId: string;
  tier: HeavyTier;
  /** Seconds between logging the previous set and this one, less the set allowance. */
  restSeconds: number;
  /** The rest the app planned after the previous set. */
  plannedSeconds: number;
  /** At least SHORT_REST_MARGIN_SECONDS under the plan. */
  short: boolean;
  /** Reps short of this set's target, as a negative number; 0 when it was reached. */
  shortfall: number;
}

/**
 * Every heavy (T1 or T2) working set with the rest before it, from finished, live
 * workouts up to `now`.
 *
 * Rest is not stored reliably (`restAfterSeconds` is written as 0), so it is the time
 * between logging the previous set of the same lift and this one, less
 * SET_DURATION_ALLOWANCE_SECONDS for doing this set. Left out: warm-ups and lighter
 * tiers; the first set of each lift (nothing before it); gaps over MAX_SET_GAP_SECONDS
 * (a break, not a rest); gaps no longer than the allowance (sets logged after the
 * fact); and pairs where either set was skipped or lightened for a reason or carries a
 * load drop.
 */
export function restPairs(workouts: WorkoutSession[], now: Date): RestPair[] {
  const pairs: RestPair[] = [];
  for (const workout of finishedBy(workouts, now.getTime())) {
    const phaseMode = workout.completionContext?.phaseMode;
    for (const tier of HEAVY_TIERS) {
      const planned = getRestSeconds(tier, phaseMode ? { mode: phaseMode } : undefined);
      const byLift = new Map<string, SetLog[]>();
      for (const set of workout.sets ?? []) {
        if (set.tier !== tier) continue;
        const list = byLift.get(set.exerciseId) ?? [];
        list.push(set);
        byLift.set(set.exerciseId, list);
      }
      for (const [exerciseId, sets] of byLift) {
        const ordered = [...sets].sort(
          (a, b) => toMs(a.completedAt) - toMs(b.completedAt) || a.setNumber - b.setNumber
        );
        for (let i = 1; i < ordered.length; i++) {
          const before = ordered[i - 1];
          const set = ordered[i];
          if (!MEASURED_STATUSES.has(before.status) || !MEASURED_STATUSES.has(set.status)) continue;
          const gap = (toMs(set.completedAt) - toMs(before.completedAt)) / 1000;
          if (!Number.isFinite(gap) || gap > MAX_SET_GAP_SECONDS) continue;
          if (gap <= SET_DURATION_ALLOWANCE_SECONDS) continue;
          const restSeconds = gap - SET_DURATION_ALLOWANCE_SECONDS;
          pairs.push({
            workoutId: workout.id,
            exerciseId,
            tier,
            restSeconds,
            plannedSeconds: planned,
            short: restSeconds < planned - SHORT_REST_MARGIN_SECONDS,
            shortfall: Math.min(0, set.actualReps - set.targetReps),
          });
        }
      }
    }
  }
  return pairs;
}

/**
 * Reps short of the target on a heavy set after a short rest, against after the full
 * planned rest, compared within each tier (`compareStrata`). Never a cause: a hint.
 */
export function restLengthEvidence(log: PersonalLog, now: Date): PersonalEvidence {
  const pairs = restPairs(log.workouts, now);
  const strata: Stratum[] = HEAVY_TIERS.map((tier) => {
    const inTier = pairs.filter((p) => p.tier === tier);
    return {
      exposed: inTier.filter((p) => p.short).map((p) => p.shortfall),
      reference: inTier.filter((p) => !p.short).map((p) => p.shortfall),
    };
  });
  const comparison = compareStrata(strata);
  const t1 = formatRestDuration(getRestSeconds("T1"));
  const t2 = formatRestDuration(getRestSeconds("T2"));

  return {
    ruleId: "rest-heavy",
    unit: { one: "heavy set", many: "heavy sets" },
    exposed: {
      label: "reps short on the next set after a short rest",
      name: "after a short rest",
      count: comparison.exposedCount,
    },
    reference: {
      label: "reps short after the full rest",
      name: "after the full rest",
      count: comparison.referenceCount,
    },
    unmatched: comparison.unmatched,
    unmatchedReason:
      "sets are compared only with sets of the same kind (main lift with main lift, second lift with second lift), and so far their kind has had only one length of rest.",
    minPerGroup: PERSONAL_MIN_GROUP_SIZE,
    needed: comparison.needed,
    result: comparison.result,
    method: [
      `Each heavy set after the first of a lift, warm-ups left out. Rest is not stored, so it is the time between logging that set and the one before it, less ${SET_DURATION_ALLOWANCE_SECONDS} seconds for doing the set. Gaps over ${MAX_SET_GAP_SECONDS / 60} minutes are breaks and are left out.`,
      `A rest is short when it is ${SHORT_REST_MARGIN_SECONDS} seconds or more under the planned rest (${t1} for the main lift and ${t2} for the second lift, more while cutting). Sets skipped or lightened for a reason are left out.`,
      "Each set counts the reps it came up short of its target; extra reps count as none. Main-lift sets are compared only with main-lift sets, and second-lift sets with second-lift sets.",
      rangeSentence(),
    ],
  };
}

