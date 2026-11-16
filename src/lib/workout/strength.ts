// The log as strength evidence for planning: stored sets mapped onto the strength
// library's `StrengthSet`, and the pooled estimate and transfer ratios worked out from
// them once per list of sets. Pure: no React, no database, no clock.
import { EXERCISES } from "@/lib/exercises";
import { importedStrengthSets } from "@/lib/import/evidence";
import {
  learnTransferRatio,
  pooledLiftEstimate,
  type PooledEstimate,
  type StrengthSet,
  type StrengthSetRole,
  type TransferRatio,
} from "@/lib/strength";
import type { ImportedSessionRecord, SetLog, WorkoutSession } from "@/types";

/** What a stored set was for, in the strength library's terms. */
function roleOf(set: Pick<SetLog, "tier" | "role">): StrengthSetRole {
  if (set.tier === "warmup") return "warmup";
  switch (set.role) {
    case "ramp":
      return "ramp";
    case "backoff":
      return "backoff";
    case "drop":
      return "drop";
    default:
      return "working";
  }
}

/**
 * One stored set as strength evidence: the exercise actually performed (the home
 * substitute at home), its weight as lifted, per hand for an exercise held with a
 * dumbbell in each hand (catalogue grip `per_hand`), and its role. A warm-up is kept as
 * a warm-up, which the library counts for nothing.
 */
export function strengthSetOf(set: SetLog, sessionId: string): StrengthSet {
  const exerciseId = set.substituteExerciseId || set.exerciseId;
  return {
    id: set.id,
    sessionId,
    exerciseId,
    weight: set.weight,
    perHand: EXERCISES[exerciseId]?.grip === "per_hand",
    reps: set.actualReps,
    rpe: set.rpe ?? null,
    role: roleOf(set),
    tier: set.tier,
    isAMRAP: set.isAMRAP,
    date: set.completedAt,
    ...(set.dropOf ? { dropOf: set.dropOf } : {}),
  };
}

/**
 * Every set of the finished, live workouts as strength evidence, oldest workout first.
 * Unfinished and deleted workouts are left out: what is planned next reads what was
 * done, not what is in progress.
 */
export function strengthSetsOf(
  workouts: readonly Pick<WorkoutSession, "id" | "completedAt" | "deletedAt" | "sets">[]
): StrengthSet[] {
  return workouts
    .filter((workout) => workout.completedAt != null && workout.deletedAt == null)
    .flatMap((workout) => (workout.sets ?? []).map((set) => strengthSetOf(set, workout.id)));
}

/**
 * The strength evidence of everything logged: the finished workouts' sets
 * (`strengthSetsOf`) and the sets of the live imported sessions
 * (`importedStrengthSets`: mapped exercises only, warm-ups and drops kept as such,
 * weighted for recency by the library's half-life like every other session).
 *
 * For the strength estimate, the learned ratios and the muscle strength index, and for
 * the starting weights suggested from imported history. Not for planning: the plan,
 * re-entry and the rebuild read `strengthSetsOf` alone, so imported history never moves
 * a planned weight until the lifter confirms a starting weight from it.
 */
export function strengthEvidenceOf(
  workouts: readonly Pick<WorkoutSession, "id" | "completedAt" | "deletedAt" | "sets">[],
  imported: readonly ImportedSessionRecord[]
): StrengthSet[] {
  return [...importedStrengthSets(imported), ...strengthSetsOf(workouts)];
}

const estimateCache = new WeakMap<readonly StrengthSet[], Map<string, PooledEstimate | null>>();
const ratioCache = new WeakMap<readonly StrengthSet[], Map<string, TransferRatio | null>>();

/**
 * The program lift's pooled strength estimate from `sets` (`pooledLiftEstimate`), worked
 * out once per list of sets and lift. Null with no evidence.
 */
export function pooledEstimateOf(sets: readonly StrengthSet[], liftId: string): PooledEstimate | null {
  let byLift = estimateCache.get(sets);
  if (!byLift) {
    byLift = new Map();
    estimateCache.set(sets, byLift);
  }
  if (!byLift.has(liftId)) byLift.set(liftId, pooledLiftEstimate(liftId, sets));
  return byLift.get(liftId) ?? null;
}

/**
 * The ratio between a home exercise and its program lift that `sets` support
 * (`learnTransferRatio`: the starting ratio with no pairs), once per list of sets.
 */
export function transferRatioOf(
  sets: readonly StrengthSet[],
  liftId: string,
  exerciseId: string
): TransferRatio | null {
  let byPair = ratioCache.get(sets);
  if (!byPair) {
    byPair = new Map();
    ratioCache.set(sets, byPair);
  }
  const key = `${liftId}|${exerciseId}`;
  if (!byPair.has(key)) byPair.set(key, learnTransferRatio(liftId, exerciseId, sets));
  return byPair.get(key) ?? null;
}
