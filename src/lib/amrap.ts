/**
 * AMRAP ("as many reps as possible") effort guidance.
 *
 * Heavy T1 sets stop about one rep short of failure in every phase: strength
 * gains do not depend on reaching failure, and failure slows recovery.
 * Lighter T3 sets are pushed close to failure, where muscle growth benefits.
 *
 * @evidence amrap-effort
 */

import type { Tier } from "@/types";

/** Target RPE for the last set of a heavy (T1) lift. */
export const T1_AMRAP_TARGET_RPE = 9;

export const AMRAP_GUIDANCE: Partial<Record<Tier, string>> = {
  T1: `Stop with about 1 rep left (RPE ${T1_AMRAP_TARGET_RPE})`,
  T3: "Push close to failure (0-2 reps left)",
};

/** Guidance shown on an AMRAP set of the given tier, or null if there is none. */
export function getAMRAPGuidance(tier: Tier): string | null {
  return AMRAP_GUIDANCE[tier] ?? null;
}
