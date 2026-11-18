// The log as strength evidence for planning: stored sets mapped onto the strength
// library's `StrengthSet`, and the pooled estimate and transfer ratios worked out from
// them once per list of sets. Pure: no React, no database, no clock.
import { EXERCISES } from "@/lib/exercises";
import { importedStrengthSets } from "@/lib/import/evidence";
import type { MappingOverrides } from "@/lib/import/mapping/types";
import {
  asLifted,
  externalLoad,
  learnTransferRatio,
  pooledLiftEstimate,
  type PooledEstimate,
  type StrengthSet,
  type StrengthSetRole,
  type TransferRatio,
} from "@/lib/strength";
import { timeOf } from "@/lib/strength/estimate";
import type { ImportedSessionRecord, PlanEdit, SetLog, Tier, WorkoutSession } from "@/types";

/** What a stand-in replaced: a program lift at its tier. */
export type StandIn = { exerciseId: string; tier: Tier };

/**
 * The exercises a session added to stand in for a program lift swapped out (`add` edits
 * with `replaces`), by exercise id.
 */
export function standInsOf(planEdits: readonly PlanEdit[] | undefined): Map<string, StandIn> {
  const out = new Map<string, StandIn>();
  for (const edit of planEdits ?? []) {
    if (edit.kind === "add" && edit.replaces) out.set(edit.exerciseId, edit.replaces);
  }
  return out;
}

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
export function strengthSetOf(set: SetLog, sessionId: string, standIns?: ReadonlyMap<string, StandIn>): StrengthSet {
  const exerciseId = set.substituteExerciseId || set.exerciseId;
  const standsInFor = set.tier === "accessory" ? standIns?.get(exerciseId) : undefined;
  return {
    id: set.id,
    sessionId,
    exerciseId,
    weight: set.weight,
    perHand: EXERCISES[exerciseId]?.grip === "per_hand",
    reps: set.actualReps,
    repsInReserve: set.repsInReserve ?? null,
    role: roleOf(set),
    tier: set.tier,
    isAMRAP: set.isAMRAP,
    date: set.completedAt,
    ...(set.dropOf ? { dropOf: set.dropOf } : {}),
    ...(standsInFor ? { standsInFor: { ...standsInFor } } : {}),
  };
}

/**
 * Every set of the finished, live workouts as strength evidence, oldest workout first.
 * Unfinished and deleted workouts are left out: what is planned next reads what was
 * done, not what is in progress.
 */
export function strengthSetsOf(
  workouts: readonly (Pick<WorkoutSession, "id" | "completedAt" | "deletedAt" | "sets"> &
    Partial<Pick<WorkoutSession, "planEdits">>)[]
): StrengthSet[] {
  return workouts
    .filter((workout) => workout.completedAt != null && workout.deletedAt == null)
    .flatMap((workout) => {
      const standIns = standInsOf(workout.planEdits);
      return (workout.sets ?? []).map((set) => strengthSetOf(set, workout.id, standIns));
    });
}

/**
 * The strength evidence of everything logged: the finished workouts' sets
 * (`strengthSetsOf`) and the sets of the live imported sessions
 * (`importedStrengthSets`: mapped exercises only, marked `imported`, warm-ups and drops
 * kept as such, weighted for recency by the library's half-life like every other
 * session). Imported names are mapped as of now: a choice remembered since the import
 * (`overrides`) wins.
 *
 * What every plan reads (requirement I9): the pooled estimate, the learned ratios, the
 * first weight of a home exercise (H3) and re-entry (H6) on every path (Today,
 * Configure, the active workout, the ledger's plan and the forecasts written at start,
 * `strengthSetsFrom`), and what the app shows about strength (the muscle strength
 * index) and suggests as starting weights. Imported sessions stay history: the
 * rotation, GZCLP progression, the rebuild of the lift states and the forecast models
 * read the workouts alone, a weight set by hand still wins, and a barbell weight moves
 * only by progression (re-entry within its bounds) or a starting weight the lifter
 * confirms.
 *
 * @evidence strength-pooling
 */
export function strengthEvidenceOf(
  workouts: readonly (Pick<WorkoutSession, "id" | "completedAt" | "deletedAt" | "sets"> &
    Partial<Pick<WorkoutSession, "planEdits">>)[],
  imported: readonly ImportedSessionRecord[],
  overrides?: MappingOverrides
): StrengthSet[] {
  return [...importedStrengthSets(imported, overrides), ...strengthSetsOf(workouts)];
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
 * (`learnTransferRatio`: the starting ratio with no pairs), once per list of sets. Pairs
 * of imported sessions count like the app's when `sets` include them.
 *
 * @evidence transfer-ratio
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

/**
 * How far back an exercise's own sets count for its first weight (`ownHistoryOf`,
 * `seedVariantWeight`, and an accessory's `ownHistoryFirstWeight`), in weeks, measured
 * back from the date being planned for.
 *
 * Source: none. Four of the pooled estimate's evidence half-lives
 * (STRENGTH_POOLING.evidenceHalfLifeDays), where an older session would count a
 * sixteenth of a new one: long enough to span a block at the gym between home
 * stretches, short enough that the sets still describe the lifter being planned for.
 * Judgment.
 *
 * @evidence home-progression
 */
export const OWN_HISTORY_WINDOW_WEEKS = 8;

const WEEK_MS = 7 * 86_400_000;

/** What a home exercise's own sets say, for its first weight (`ownHistoryOf`). */
export interface OwnHistory {
  /**
   * The exercise's own estimate inside the window, on the total load: its latest
   * session's, as a program lift's own estimate starts from its latest session
   * (`pooledLiftEstimate` with no related exercise), the logged effort credited. Null
   * when no set inside the window gives an estimate.
   */
  estimate: PooledEstimate | null;
  /**
   * The heaviest weight, as lifted (per dumbbell when it uses two), of the exercise's
   * loaded normal sets (not warm-ups or drops) inside the window; null when there are none.
   */
  heaviest: number | null;
  /** When the exercise's latest loaded normal set was done, at any date (epoch ms); null when never. */
  lastDone: number | null;
}

const ownCache = new WeakMap<readonly StrengthSet[], Map<string, OwnHistory>>();

/** The start of the own-history window for a plan on `now` (epoch ms). */
export function ownHistorySince(now: Date): number {
  return now.getTime() - OWN_HISTORY_WINDOW_WEEKS * WEEK_MS;
}

/** A set the lifter did with a load: not a warm-up, a drop or a weight set by hand and not lifted. */
function isLoadedWorkSet(set: StrengthSet): boolean {
  if (set.provisional || set.role === "warmup" || set.role === "drop") return false;
  return Number.isFinite(set.weight) && externalLoad(set) > 0 && set.reps >= 1;
}

/**
 * A home exercise's own history, for its first weight: its own estimate and the
 * heaviest weight it was lifted at, from its sets in the OWN_HISTORY_WINDOW_WEEKS before
 * `now`, the date being planned for (sets after it are not history yet), and when it
 * was last done at all by then. Sets years old never seed today's weight; they only say
 * when it was last done. Left out, `now` is the newest set in `sets` (of any exercise),
 * for callers with no planning date. App and imported sets count alike. A weight set by hand and not lifted
 * (`provisional`) is not history: the library reads it only through the pooled
 * estimate. Worked out once per list of sets and exercise.
 *
 * @evidence home-progression
 */
export function ownHistoryOf(sets: readonly StrengthSet[], exerciseId: string, now?: Date): OwnHistory {
  let byExercise = ownCache.get(sets);
  if (!byExercise) {
    byExercise = new Map();
    ownCache.set(sets, byExercise);
  }
  const key = now ? `${exerciseId}@${now.getTime()}` : exerciseId;
  const cached = byExercise.get(key);
  if (cached) return cached;

  let until = now ? now.getTime() : -Infinity;
  if (!now) {
    for (const set of sets) {
      const t = set.provisional ? NaN : timeOf(set.date);
      if (t > until) until = t;
    }
  }
  const since = until - OWN_HISTORY_WINDOW_WEEKS * WEEK_MS;
  const byThen = (set: StrengthSet) => timeOf(set.date) <= until;
  // Every set of the exercise in the window goes to the estimate (it counts drops by its
  // own rules and warm-ups for nothing); only loaded normal sets bound the weight.
  const recent = sets.filter(
    (set) => set.exerciseId === exerciseId && !set.provisional && timeOf(set.date) >= since && byThen(set)
  );
  const own = sets.filter(
    (set) => set.exerciseId === exerciseId && isLoadedWorkSet(set) && !Number.isNaN(timeOf(set.date)) && byThen(set)
  );
  const inWindow = own.filter((set) => timeOf(set.date) >= since);
  const result: OwnHistory = {
    estimate: recent.length > 0 ? pooledLiftEstimate(exerciseId, recent, { ratios: {} }) : null,
    heaviest: inWindow.length > 0 ? Math.max(...inWindow.map((set) => asLifted(externalLoad(set), exerciseId))) : null,
    lastDone: own.length > 0 ? Math.max(...own.map((set) => timeOf(set.date))) : null,
  };
  byExercise.set(key, result);
  return result;
}
