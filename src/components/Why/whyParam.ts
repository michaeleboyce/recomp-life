// The `?why=<exerciseId>:<tier>` query value that opens the why sheet on a page, so
// the sheet can be linked to. No new route: the sheet lives on the host page.
import type { Tier } from "@/types";

export const WHY_PARAM = "why";

const TIERS: readonly Tier[] = ["T1", "T2", "T3", "accessory", "warmup"];

export interface WhyTarget {
  exerciseId: string;
  tier: Tier;
}

/** "squat:T1" -> { exerciseId: "squat", tier: "T1" }; null for anything malformed. */
export function parseWhyParam(value: string | null | undefined): WhyTarget | null {
  if (!value) return null;
  const at = value.lastIndexOf(":");
  if (at <= 0) return null;
  const exerciseId = value.slice(0, at);
  const tier = value.slice(at + 1) as Tier;
  if (!/^[a-z0-9_]+$/.test(exerciseId) || !TIERS.includes(tier)) return null;
  return { exerciseId, tier };
}

/** The query value for a lift: "squat:T1". */
export function whyParamValue(target: WhyTarget): string {
  return `${target.exerciseId}:${target.tier}`;
}

/**
 * The page's current address with the why value set (or removed when `target` is
 * null), keeping every other query value.
 */
export function urlWithWhy(
  location: Pick<Location, "pathname" | "search" | "hash">,
  target: WhyTarget | null
): string {
  const params = new URLSearchParams(location.search);
  if (target) params.set(WHY_PARAM, whyParamValue(target));
  else params.delete(WHY_PARAM);
  const query = params.toString().replace(/%3A/gi, ":");
  return `${location.pathname}${query ? `?${query}` : ""}${location.hash}`;
}

/**
 * Opens or closes the sheet by rewriting the address in place. Next.js keeps
 * `useSearchParams` in step with `history.replaceState`, so the sheet follows the URL
 * and no history entry is added.
 */
export function setWhyInUrl(target: WhyTarget | null): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", urlWithWhy(window.location, target));
}
