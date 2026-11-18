/**
 * AMRAP ("as many reps as possible") effort guidance.
 *
 * Heavy T1 sets stop a rep or two short of failure in every phase: strength
 * gains do not depend on reaching failure, and failure slows recovery.
 * Lighter T3 sets are pushed close to failure, where muscle growth benefits.
 *
 * @evidence amrap-effort
 */

import type { RepsInReserve, Tier } from "@/types";

/** Reps to leave on the last set of a heavy (T1) lift. */
export const T1_AMRAP_TARGET_REPS_IN_RESERVE: RepsInReserve = "1-2";

export const AMRAP_GUIDANCE: Partial<Record<Tier, string>> = {
  T1: `Stop with ${T1_AMRAP_TARGET_REPS_IN_RESERVE} reps left`,
  T3: "Push close to failure (0-2 reps left)",
};

/** Guidance shown on an AMRAP set of the given tier, or null if there is none. */
export function getAMRAPGuidance(tier: Tier): string | null {
  return AMRAP_GUIDANCE[tier] ?? null;
}
