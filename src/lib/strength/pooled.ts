/**
 * One strength estimate per program lift, pooled from its own sessions and the sessions
 * of its home substitutes. Pure.
 *
 * @evidence strength-pooling
 */

import { STRENGTH_POOLING, TARGET_EVIDENCE } from "./coefficients";
import { compareEstimates, sessionEstimates, targetEstimates } from "./estimate";
import { learnTransferRatios } from "./ratio";
import type { PooledEstimate, RelatedEvidence, SessionEstimate, StrengthSet, TransferRatio } from "./types";

const DAY_MS = 86_400_000;

export interface PooledEstimateOptions {
  /**
   * Ratios to use instead of learning them from `sets`, keyed by exercise id. Only these
   * exercises are pooled when given.
   */
  ratios?: Readonly<Record<string, TransferRatio>>;
}

/**
 * The lift's strength estimate.
 *
 * 1. It starts from the latest session of the lift itself (its `strength`, which for a
 *    session without drops is the estimated max the app stores today). Older sessions of
 *    the lift are superseded by it, as the app's own estimate is. With only the lift's
 *    own sessions the result is exactly that value.
 * 2. Sessions of related exercises (those with a ratio for the lift) after it, and not
 *    in the same workout, are translated into the lift's units (`strength ÷ ratio`) and
 *    added with weight STRENGTH_POOLING.transferWeight. With no session of the lift, all
 *    related sessions are pooled. A weight set by hand for a related exercise and not
 *    lifted since (`targetEstimates`) joins them at TARGET_EVIDENCE.weight of that.
 *
 * @evidence target-evidence
 * 3. Every weight halves for each STRENGTH_POOLING.evidenceHalfLifeDays a session is
 *    older than the newest one pooled. The value is the weighted mean, rounded to a pound.
 * 4. The standard deviation treats each session as scattering by
 *    STRENGTH_POOLING.sessionSdFraction (a related one by that ÷ √transferWeight, which is
 *    what down-weighting it means) and adds each ratio's own uncertainty, shared by all
 *    sessions of that exercise.
 *
 * Null when there is no evidence.
 *
 * @evidence strength-pooling
 */
export function pooledLiftEstimate(
  liftId: string,
  sets: readonly StrengthSet[],
  options: PooledEstimateOptions = {}
): PooledEstimate | null {
  const ownSessions = sessionEstimates(sets, liftId);
  const own = ownSessions.length > 0 ? ownSessions[ownSessions.length - 1] : null;

  const ratios = options.ratios ?? learnTransferRatios(liftId, sets);
  const candidates: Array<{ estimate: SessionEstimate; ratio: TransferRatio }> = [];
  for (const [exerciseId, ratio] of Object.entries(ratios)) {
    if (exerciseId === liftId || !(ratio.ratio > 0)) continue;
    const logged = sessionEstimates(sets, exerciseId);
    for (const estimate of logged) {
      if (own && (estimate.sessionId === own.sessionId || compareEstimates(estimate, own) <= 0)) continue;
      candidates.push({ estimate, ratio });
    }
    // A target counts until the exercise is logged at or after it.
    const lastLogged = logged.length > 0 ? logged[logged.length - 1].date.getTime() : -Infinity;
    for (const estimate of targetEstimates(sets, exerciseId)) {
      if (estimate.date.getTime() <= lastLogged) continue;
      if (own && compareEstimates(estimate, own) <= 0) continue;
      candidates.push({ estimate, ratio });
    }
  }
  candidates.sort((a, b) => compareEstimates(a.estimate, b.estimate) || (a.estimate.exerciseId < b.estimate.exerciseId ? -1 : 1));

  if (!own && candidates.length === 0) return null;

  const dates = [...(own ? [own.date.getTime()] : []), ...candidates.map((c) => c.estimate.date.getTime())];
  const newest = Math.max(...dates);
  const decay = (t: number) => 0.5 ** ((newest - t) / (STRENGTH_POOLING.evidenceHalfLifeDays * DAY_MS));

  const ownWeight = own ? decay(own.date.getTime()) : 0;
  const related: RelatedEvidence[] = candidates.map(({ estimate, ratio }) => ({
    exerciseId: estimate.exerciseId,
    sessionId: estimate.sessionId,
    date: estimate.date,
    strength: estimate.strength,
    liftEquivalent: estimate.strength / ratio.ratio,
    ratio,
    weight:
      STRENGTH_POOLING.transferWeight *
      (estimate.provisional ? TARGET_EVIDENCE.weight : 1) *
      decay(estimate.date.getTime()),
    ...(estimate.provisional ? { provisional: true } : {}),
  }));

  // With the lift's own session alone the value is that session's, untouched by
  // floating-point weighting.
  let value: number;
  if (own && related.length === 0) {
    value = own.strength;
  } else {
    const totalWeight = ownWeight + related.reduce((s, r) => s + r.weight, 0);
    const weighted = (own ? ownWeight * own.strength : 0) + related.reduce((s, r) => s + r.weight * r.liftEquivalent, 0);
    value = weighted / totalWeight;
  }

  return {
    liftId,
    value: Math.round(value),
    sd: Math.round(value * relativeSd(ownWeight, related) * 10) / 10,
    basis: own ? (related.length > 0 ? "pooled" : "own") : "related",
    own,
    ownWeight,
    related,
  };
}

/**
 * Relative standard deviation of the weighted mean: independent session scatter plus
 * each exercise's ratio uncertainty, which every session of that exercise shares.
 */
function relativeSd(ownWeight: number, related: readonly RelatedEvidence[]): number {
  const s2 = STRENGTH_POOLING.sessionSdFraction ** 2;
  const transfer = STRENGTH_POOLING.transferWeight;
  let total = ownWeight;
  let variance = ownWeight ** 2 * s2;
  const byExercise = new Map<string, { weight: number; logSd: number }>();
  for (const r of related) {
    total += r.weight;
    variance += r.weight ** 2 * (s2 / transfer);
    const entry = byExercise.get(r.exerciseId) ?? { weight: 0, logSd: r.ratio.logSd };
    entry.weight += r.weight;
    byExercise.set(r.exerciseId, entry);
  }
  for (const { weight, logSd } of byExercise.values()) variance += weight ** 2 * logSd ** 2;
  return total > 0 ? Math.sqrt(variance) / total : 0;
}
