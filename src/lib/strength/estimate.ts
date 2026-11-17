/**
 * Estimated max per exercise and per session, from any exercise's sets. Pure.
 *
 * Uses the app's own formula and limits (`calculateE1RM`, `isE1RMEligibleSet`): a set
 * gives an estimate when it is a T1 AMRAP set of 2 to E1RM_MAX_REPS reps, with the
 * logged effort credited. The only change is the weight: dumbbell exercises count the
 * total load moved (`externalLoad`), so a barbell lift's estimates are exactly the
 * values the app stores today.
 *
 * @evidence strength-pooling
 * @evidence drop-set-evidence
 */

import { calculateE1RM, isE1RMEligibleSet } from "@/lib/e1rm";
import { EXERCISES } from "@/lib/exercises";
import { DROP_SETS } from "./coefficients";
import type { EstimateSet, SessionEstimate, StrengthSet } from "./types";

/** How an exercise is loaded, for turning a per-hand weight into the total. */
export type Loading = "two-dumbbells" | "one-dumbbell" | "other";

/**
 * From the exercise catalogue's `grip`: `per_hand` means a dumbbell in each hand
 * (dumbbell bench, Bulgarian split squat); `both_hands` and `single` mean one dumbbell
 * (goblet squat). Anything else (barbell, cable, machine, unknown) is `other`.
 */
export function loadingOf(exerciseId: string): Loading {
  const grip = EXERCISES[exerciseId]?.grip;
  if (grip === "per_hand") return "two-dumbbells";
  if (grip === "both_hands" || grip === "single") return "one-dumbbell";
  return "other";
}

/**
 * The total load a set moved. A per-hand weight counts twice for an exercise held with a
 * dumbbell in each hand, once for a one-dumbbell exercise. A weight not flagged per hand
 * is already the total. An unknown exercise flagged per hand counts twice: the flag says
 * there was a dumbbell in each hand.
 */
export function externalLoad(set: Pick<StrengthSet, "exerciseId" | "weight" | "perHand">): number {
  if (!set.perHand) return set.weight;
  return loadingOf(set.exerciseId) === "one-dumbbell" ? set.weight : set.weight * 2;
}

/** The weight as lifted for a total load: per dumbbell when the exercise uses two. */
export function asLifted(totalLoad: number, exerciseId: string): number {
  return loadingOf(exerciseId) === "two-dumbbells" ? totalLoad / 2 : totalLoad;
}

/**
 * A normal set (not a warm-up or a drop) that the app's rule accepts for an estimate,
 * with a load: a set logged at no weight (or an unreadable one) says nothing about
 * strength, and an estimate of 0 would drag the pooled estimate toward the empty bar.
 */
export function isEstimateSet(set: StrengthSet): boolean {
  if (set.role === "warmup" || set.role === "drop") return false;
  if (!(externalLoad(set) > 0) || !Number.isFinite(set.weight)) return false;
  return isE1RMEligibleSet(set.tier, set.isAMRAP, set.reps);
}

/** The set's estimated max on its total load, with the logged effort; null under 2 reps. */
export function setEstimate(set: StrengthSet): number | null {
  return calculateE1RM(externalLoad(set), set.reps, set.rpe ?? null);
}

/** Epoch ms of a set's date; NaN when unreadable. */
export function timeOf(date: Date | string): number {
  return new Date(date).getTime();
}

function byDateThenId(a: StrengthSet, b: StrengthSet): number {
  return timeOf(a.date) - timeOf(b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * The first drop after each normal set: drops are grouped by the set their chain starts
 * from (following `dropOf` through earlier drops), and the earliest of each group is
 * the first. Works whether later drops point at the previous drop or at the set itself.
 */
function firstDrops(sessionSets: StrengthSet[]): StrengthSet[] {
  const byId = new Map(sessionSets.map((s) => [s.id, s]));
  const rootOf = (drop: StrengthSet): StrengthSet | null => {
    let current: StrengthSet | undefined = drop;
    const seen = new Set<string>();
    while (current && current.role === "drop") {
      if (!current.dropOf || seen.has(current.id)) return null;
      seen.add(current.id);
      current = byId.get(current.dropOf);
    }
    return current ?? null;
  };
  const firstByRoot = new Map<string, StrengthSet>();
  for (const drop of sessionSets.filter((s) => s.role === "drop").sort(byDateThenId)) {
    const root = rootOf(drop);
    if (!root || root.role === "warmup") continue;
    if (!firstByRoot.has(root.id)) firstByRoot.set(root.id, drop);
  }
  return [...firstByRoot.values()];
}

function toEstimateSet(set: StrengthSet): EstimateSet {
  return {
    id: set.id,
    weight: set.weight,
    perHand: set.perHand,
    load: externalLoad(set),
    reps: set.reps,
    rpe: set.rpe ?? null,
  };
}

/** One session's estimate for an exercise, or null when no normal set qualifies. */
function estimateForSession(exerciseId: string, sessionId: string, sets: StrengthSet[]): SessionEstimate | null {
  let best: { set: StrengthSet; value: number } | null = null;
  for (const set of sets) {
    if (!isEstimateSet(set)) continue;
    const value = setEstimate(set);
    if (value === null) continue;
    // Highest estimate wins; on a tie the later set, like the app's latest row.
    if (!best || value > best.value || (value === best.value && byDateThenId(set, best.set) > 0)) {
      best = { set, value };
    }
  }
  if (!best) return null;

  // First drops within the formula's limits (a drop is taken as far as it goes, so it is
  // treated as an AMRAP set), after their fatigue allowance.
  const dropValues = firstDrops(sets)
    .filter((drop) => externalLoad(drop) > 0 && isE1RMEligibleSet(drop.tier, true, drop.reps))
    .map((drop) => setEstimate(drop))
    .filter((value): value is number => value !== null)
    .map((value) => value / (1 - DROP_SETS.fatigueDiscount));

  let strength = best.value;
  if (dropValues.length > 0) {
    const dropMean = dropValues.reduce((sum, v) => sum + v, 0) / dropValues.length;
    const w = DROP_SETS.evidenceWeight;
    strength = (best.value + w * dropMean) / (1 + w);
  }

  return {
    exerciseId,
    sessionId,
    date: new Date(best.set.date),
    estimatedMax: best.value,
    strength,
    bestSet: toEstimateSet(best.set),
    dropsCounted: dropValues.length,
  };
}

/**
 * What each session says about one exercise, oldest first.
 *
 * - The estimated max is the session's best normal set (working, ramp or back-off, each
 *   at its own weight). Drops never set it, so they never make an estimated-max row or a
 *   new best, and a session with only drops gives nothing.
 * - Strength adds the session's first drops (the first after each set; later drops are
 *   more tired by an amount nobody has measured): each drop's estimate is divided by
 *   (1 - DROP_SETS.fatigueDiscount), and the drops together count
 *   DROP_SETS.evidenceWeight of the best set.
 * - Sets with an unreadable date are skipped.
 *
 * @evidence strength-pooling
 * @evidence drop-set-evidence
 */
export function sessionEstimates(sets: readonly StrengthSet[], exerciseId: string): SessionEstimate[] {
  return estimatesOf(sets, exerciseId, false);
}

/**
 * What the exercise's weights set by hand and not lifted yet say (`provisional` sets),
 * oldest first, each marked `provisional`. Read by the pooled estimate alone.
 *
 * @evidence target-evidence
 */
export function targetEstimates(sets: readonly StrengthSet[], exerciseId: string): SessionEstimate[] {
  return estimatesOf(sets, exerciseId, true).map((estimate) => ({ ...estimate, provisional: true }));
}

function estimatesOf(sets: readonly StrengthSet[], exerciseId: string, provisional: boolean): SessionEstimate[] {
  const bySession = new Map<string, StrengthSet[]>();
  for (const set of sets) {
    if (set.exerciseId !== exerciseId || Number.isNaN(timeOf(set.date))) continue;
    if ((set.provisional === true) !== provisional) continue;
    const list = bySession.get(set.sessionId);
    if (list) list.push(set);
    else bySession.set(set.sessionId, [set]);
  }
  const estimates: SessionEstimate[] = [];
  for (const [sessionId, list] of bySession) {
    const estimate = estimateForSession(exerciseId, sessionId, list);
    if (estimate) estimates.push(estimate);
  }
  return estimates.sort(compareEstimates);
}

/** Oldest first; on the same instant, by session id. */
export function compareEstimates(a: SessionEstimate, b: SessionEstimate): number {
  return (
    a.date.getTime() - b.date.getTime() ||
    (a.sessionId < b.sessionId ? -1 : a.sessionId > b.sessionId ? 1 : 0)
  );
}

/** The most recent session's estimate for an exercise, or null. */
export function latestEstimate(sets: readonly StrengthSet[], exerciseId: string): SessionEstimate | null {
  const all = sessionEstimates(sets, exerciseId);
  return all.length > 0 ? all[all.length - 1] : null;
}
