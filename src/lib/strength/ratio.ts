/**
 * Ratios between a home exercise and its barbell lift: a starting value per pair
 * (`TRANSFER_PRIORS`), learned from the lifter's own paired sessions. Pure.
 *
 * The ratio is the exercise's estimated max ÷ the lift's, both on total load. It is
 * learned on a log scale with a normal prior: the prior counts as
 * (pairLogSd ÷ priorLogSd)² pairs, so an assumed ratio gives way after one or two of the
 * lifter's own pairs and a studied one after a few.
 *
 * @evidence transfer-ratio
 */

import { TRANSFER_PRIORS, TRANSFER_RATIO, type TransferPrior } from "./coefficients";
import { sessionEstimates } from "./estimate";
import type { SessionEstimate, SessionPair, StrengthSet, TransferRatio } from "./types";
import { DAY_MS } from "@/lib/dates";


/** The starting ratio for a lift and a home exercise, or null when none is known. */
export function priorFor(liftId: string, exerciseId: string): TransferPrior | null {
  const table = (TRANSFER_PRIORS as Record<string, Record<string, TransferPrior> | undefined>)[liftId];
  return table?.[exerciseId] ?? null;
}

/** The home exercises with a starting ratio for a lift. */
export function relatedExercises(liftId: string): string[] {
  const table = (TRANSFER_PRIORS as Record<string, Record<string, TransferPrior> | undefined>)[liftId];
  return table ? Object.keys(table) : [];
}

/**
 * Pairs of a session of the exercise and a session of the lift at most
 * TRANSFER_RATIO.pairWindowDays apart, never from the same workout. Closest pairs are
 * taken first and each session is used once, so the pairs are independent. Ties go to
 * the earlier sessions.
 *
 * @evidence transfer-ratio
 */
export function pairSessions(
  exerciseSessions: readonly SessionEstimate[],
  liftSessions: readonly SessionEstimate[]
): SessionPair[] {
  const windowMs = TRANSFER_RATIO.pairWindowDays * DAY_MS;
  const candidates: Array<{ a: SessionEstimate; b: SessionEstimate; gap: number }> = [];
  for (const a of exerciseSessions) {
    for (const b of liftSessions) {
      if (a.sessionId === b.sessionId) continue;
      const gap = Math.abs(a.date.getTime() - b.date.getTime());
      if (gap <= windowMs) candidates.push({ a, b, gap });
    }
  }
  candidates.sort(
    (x, y) =>
      x.gap - y.gap ||
      x.a.date.getTime() - y.a.date.getTime() ||
      x.b.date.getTime() - y.b.date.getTime()
  );
  const usedA = new Set<string>();
  const usedB = new Set<string>();
  const pairs: SessionPair[] = [];
  for (const { a, b, gap } of candidates) {
    if (usedA.has(a.sessionId) || usedB.has(b.sessionId)) continue;
    usedA.add(a.sessionId);
    usedB.add(b.sessionId);
    pairs.push({
      exerciseSessionId: a.sessionId,
      liftSessionId: b.sessionId,
      exerciseStrength: a.strength,
      liftStrength: b.strength,
      ratio: a.strength / b.strength,
      gapDays: gap / DAY_MS,
    });
  }
  return pairs.sort((x, y) => (x.exerciseSessionId < y.exerciseSessionId ? -1 : 1));
}

function sampleSd(values: number[]): number {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * The ratio between `exerciseId` and `liftId` the sets support: the prior with no pairs,
 * and with pairs the precision-weighted mean of the prior and the pairs on a log scale.
 * Each pair scatters by TRANSFER_RATIO.pairLogSd, or by the lifter's own spread when it
 * is wider and there are at least TRANSFER_RATIO.minPairsForOwnSpread pairs.
 *
 * Returns null only when no prior is known and there are no pairs. With no prior and
 * some pairs, the ratio comes from the pairs alone.
 *
 * @evidence transfer-ratio
 */
export function learnTransferRatio(
  liftId: string,
  exerciseId: string,
  sets: readonly StrengthSet[]
): TransferRatio | null {
  const prior = priorFor(liftId, exerciseId);
  const pairList = pairSessions(sessionEstimates(sets, exerciseId), sessionEstimates(sets, liftId)).filter(
    (p) => p.ratio > 0 && Number.isFinite(p.ratio)
  );
  const n = pairList.length;
  if (!prior && n === 0) return null;

  const logs = pairList.map((p) => Math.log(p.ratio));
  let pairSd: number = TRANSFER_RATIO.pairLogSd;
  if (n >= TRANSFER_RATIO.minPairsForOwnSpread) pairSd = Math.max(pairSd, sampleSd(logs));

  const pairPrecision = n / pairSd ** 2;
  const priorPrecision = prior ? 1 / prior.priorLogSd ** 2 : 0;
  const precision = priorPrecision + pairPrecision;
  const sumLogs = logs.reduce((s, v) => s + v, 0);
  const meanLog =
    n === 0
      ? Math.log(prior!.ratio)
      : ((prior ? Math.log(prior.ratio) * priorPrecision : 0) + sumLogs / pairSd ** 2) / precision;

  const ratio = n === 0 ? prior!.ratio : Math.exp(meanLog);
  const logSd = n === 0 ? prior!.priorLogSd : Math.sqrt(1 / precision);
  return {
    liftId,
    exerciseId,
    ratio,
    sd: ratio * logSd,
    logSd,
    pairs: n,
    prior: prior ? prior.ratio : null,
    grade: prior ? prior.grade : "heuristic",
    basis: n === 0 ? "prior" : "learned",
    pairList,
  };
}

/** `learnTransferRatio` for every home exercise with a starting ratio for the lift. */
export function learnTransferRatios(liftId: string, sets: readonly StrengthSet[]): Record<string, TransferRatio> {
  const out: Record<string, TransferRatio> = {};
  for (const exerciseId of relatedExercises(liftId)) {
    const ratio = learnTransferRatio(liftId, exerciseId, sets);
    if (ratio) out[exerciseId] = ratio;
  }
  return out;
}
