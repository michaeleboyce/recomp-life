/**
 * Rest Times
 *
 * The single place that decides how long to rest after a set.
 *
 * @evidence rest-heavy
 * @evidence rest-light
 * @evidence rest-cut-bonus
 */

import type { Tier, TrainingPhase } from "@/types";

/** Base rest per tier, in seconds, before the cutting-phase adjustment. */
export const REST_SECONDS: Record<Tier, number> = {
  T1: 180,
  T2: 120,
  T3: 90,
  accessory: 90,
  warmup: 60,
};

/** Extra rest added to heavy tiers while cutting. A coaching heuristic. */
export const CUTTING_REST_BONUS_SECONDS = 30;

/** Tiers that receive the cutting bonus. */
export const CUTTING_REST_BONUS_TIERS: ReadonlySet<Tier> = new Set<Tier>([
  "T1",
  "T2",
]);

/** True when the cutting bonus applies to this tier in this phase. */
export function hasCuttingRestBonus(tier: Tier, phase?: TrainingPhase): boolean {
  return phase?.mode === "cutting" && CUTTING_REST_BONUS_TIERS.has(tier);
}

/** Rest duration in seconds for a set of the given tier in the given phase. */
export function getRestSeconds(tier: Tier, phase?: TrainingPhase): number {
  const base = REST_SECONDS[tier] ?? REST_SECONDS.warmup;
  return hasCuttingRestBonus(tier, phase)
    ? base + CUTTING_REST_BONUS_SECONDS
    : base;
}

/** Which evidence rule explains the rest for this tier. Warm-ups have none. */
export function getRestEvidenceId(
  tier: Tier
): "rest-heavy" | "rest-light" | null {
  if (tier === "T1" || tier === "T2") return "rest-heavy";
  if (tier === "T3" || tier === "accessory") return "rest-light";
  return null;
}

/** Format seconds as m:ss, e.g. 90 -> "1:30". */
export function formatRestDuration(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
