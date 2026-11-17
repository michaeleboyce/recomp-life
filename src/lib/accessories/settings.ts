// Accessory settings in the profile's settings JSON (A5): the mode, per-day pins and
// weights set by hand. Pure: readers that are safe on any stored shape, and the edits
// the data layer applies inside its transaction.
// Spec: docs/plans/2026-11-17-accessories-design.md.
import type { AccessoryHandSetWeight, AccessoryMode, UserSettings } from "@/types";

export const ACCESSORY_MODES: readonly AccessoryMode[] = ["auto", "ask", "none"];

/** The mode when none is stored: accessories are chosen for every workout. */
export const DEFAULT_ACCESSORY_MODE: AccessoryMode = "auto";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A stored mode as readers can use it, or undefined (read as the default). */
export function sanitizeAccessoryMode(value: unknown): AccessoryMode | undefined {
  return typeof value === "string" && (ACCESSORY_MODES as readonly string[]).includes(value)
    ? (value as AccessoryMode)
    : undefined;
}

/** The mode in force: the stored one, else "auto". */
export function accessoryModeOf(settings: Pick<UserSettings, "accessories"> | null | undefined): AccessoryMode {
  return sanitizeAccessoryMode(settings?.accessories) ?? DEFAULT_ACCESSORY_MODE;
}

/**
 * Stored pins as readers can use them: per template id, the exercise ids as non-empty
 * strings, each once, in pin order. A day with no usable pins is left out; undefined
 * when `value` is not a record.
 */
export function sanitizeAccessoryPins(value: unknown): Record<string, string[]> | undefined {
  if (!isRecord(value)) return undefined;
  const pins: Record<string, string[]> = {};
  for (const [templateId, list] of Object.entries(value)) {
    if (!Array.isArray(list)) continue;
    const ids = [...new Set(list.filter((id): id is string => typeof id === "string" && id.length > 0))];
    if (ids.length > 0) pins[templateId] = ids;
  }
  return pins;
}

/** The pins of one day, in order (none when there are none or they are unreadable). */
export function accessoryPinsFor(
  settings: Pick<UserSettings, "accessoryPins"> | null | undefined,
  templateId: string
): string[] {
  return sanitizeAccessoryPins(settings?.accessoryPins)?.[templateId] ?? [];
}

/**
 * `pins` with `exerciseId` pinned to (added at the end) or unpinned from `templateId`.
 * Returns a new record; a day left with no pins is removed.
 */
export function withAccessoryPin(
  pins: Record<string, string[]> | undefined,
  templateId: string,
  exerciseId: string,
  pinned: boolean
): Record<string, string[]> {
  const next: Record<string, string[]> = { ...(sanitizeAccessoryPins(pins) ?? {}) };
  const day = (next[templateId] ?? []).filter((id) => id !== exerciseId);
  if (pinned) day.push(exerciseId);
  if (day.length > 0) next[templateId] = day;
  else delete next[templateId];
  return next;
}

function timeOf(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

/**
 * Stored hand-set weights as readers can use them: each needs a finite weight of at
 * least 0 and a readable time (a revived Date or an ISO string becomes epoch ms).
 * Undefined when `value` is not a record.
 */
export function sanitizeAccessoryWeights(value: unknown): Record<string, AccessoryHandSetWeight> | undefined {
  if (!isRecord(value)) return undefined;
  const out: Record<string, AccessoryHandSetWeight> = {};
  for (const [exerciseId, entry] of Object.entries(value)) {
    if (!isRecord(entry)) continue;
    const weight = entry.weight;
    const setAt = timeOf(entry.setAt);
    if (typeof weight !== "number" || !Number.isFinite(weight) || weight < 0 || setAt === null) continue;
    out[exerciseId] = { weight, setAt };
  }
  return out;
}

/** `weights` with the weight for `exerciseId` set (a number) or cleared (null). Returns a new record. */
export function withAccessoryWeight(
  weights: Record<string, AccessoryHandSetWeight> | undefined,
  exerciseId: string,
  entry: AccessoryHandSetWeight | null
): Record<string, AccessoryHandSetWeight> {
  const next = { ...(sanitizeAccessoryWeights(weights) ?? {}) };
  if (entry) next[exerciseId] = entry;
  else delete next[exerciseId];
  return next;
}

/**
 * The accessory fields of settings from outside this device, made safe in place: a
 * mode this version does not know is removed (read as "auto"), pins and weights are
 * cleaned, and a field that is not a record is removed. Used by `sanitizeSettings`.
 */
export function sanitizeAccessorySettings(settings: UserSettings): void {
  const mode = sanitizeAccessoryMode(settings.accessories);
  if (mode) settings.accessories = mode;
  else delete settings.accessories;
  const pins = sanitizeAccessoryPins(settings.accessoryPins);
  if (pins) settings.accessoryPins = pins;
  else delete settings.accessoryPins;
  const weights = sanitizeAccessoryWeights(settings.accessoryWeights);
  if (weights) settings.accessoryWeights = weights;
  else delete settings.accessoryWeights;
}
