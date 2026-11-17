// Weights changed on the spot during a workout, kept in sessionStorage per workout so a
// reload or a trip to another screen does not lose them. Storage can be missing or
// blocked (private windows, previews); every access is guarded and falls back to none.
import type { SpotWeightsByKey } from "./setPlan";

const PREFIX = "recomp:spot-weights:";

/** The weights saved for `sessionId`, or none. Ignores anything that is not a positive number. */
export function loadSpotWeights(sessionId: string): SpotWeightsByKey {
  try {
    const raw = globalThis.sessionStorage?.getItem(PREFIX + sessionId);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Saves the weights for `sessionId`; an empty set removes the entry. Never throws. */
export function saveSpotWeights(sessionId: string, weights: SpotWeightsByKey): void {
  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return;
    if (Object.keys(weights).length === 0) storage.removeItem(PREFIX + sessionId);
    else storage.setItem(PREFIX + sessionId, JSON.stringify(weights));
  } catch {
    // Storage full or blocked: the changes still hold for this page.
  }
}
