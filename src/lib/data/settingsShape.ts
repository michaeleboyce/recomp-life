// Data layer: settings that come from outside this device (a pull, a backup file) are
// made safe to read before they are stored. Another app version, an older backup or a
// hand-edited file may hold a shape this version would crash on. Pure: no database.
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { sanitizeAccessorySettings } from "@/lib/accessories/settings";
import type { NextSetPlan, PlannedSet, UserSettings } from "@/types";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isPlannedSet = (value: unknown): value is PlannedSet =>
  isRecord(value) && Number.isFinite(value.weight) && Number.isFinite(value.reps);

/**
 * One stored set plan as a reader can use it, or null when it cannot be: it needs an
 * exercise, a tier and its sets (each a finite weight and reps). A revived Date becomes
 * the ISO string the type says, a missing `liftId` is the exercise, and unreadable
 * `planSets` are none. Fields this version does not know are kept.
 */
function sanitizeNextSetPlan(value: unknown): NextSetPlan | null {
  if (!isRecord(value)) return null;
  const { exerciseId, tier, sets } = value;
  if (typeof exerciseId !== "string" || !exerciseId) return null;
  if (typeof tier !== "string" || !tier) return null;
  if (!Array.isArray(sets) || !sets.every(isPlannedSet)) return null;
  const planSets = Array.isArray(value.planSets) ? value.planSets.filter(isPlannedSet) : [];
  const createdAt =
    value.createdAt instanceof Date
      ? Number.isFinite(value.createdAt.getTime())
        ? value.createdAt.toISOString()
        : new Date(0).toISOString()
      : typeof value.createdAt === "string"
        ? value.createdAt
        : new Date(0).toISOString();
  return {
    ...value,
    exerciseId,
    liftId: typeof value.liftId === "string" && value.liftId ? value.liftId : exerciseId,
    tier: tier as NextSetPlan["tier"],
    sets,
    planSets,
    createdAt,
  };
}

/**
 * `UserSettings.nextSetPlans` as readers can use it: each plan a reader would crash on
 * is dropped, the rest kept under their keys. Undefined when `value` is not a record.
 */
export function sanitizeNextSetPlans(value: unknown): Record<string, NextSetPlan> | undefined {
  if (!isRecord(value)) return undefined;
  const plans: Record<string, NextSetPlan> = {};
  for (const [key, entry] of Object.entries(value)) {
    const plan = sanitizeNextSetPlan(entry);
    if (plan) plans[key] = plan;
  }
  return plans;
}

/**
 * Settings from outside this device as this version reads them: a top-level field an
 * older version did not have takes its default (anything that is not an object is the
 * defaults), and the set plans are cleaned (`sanitizeNextSetPlans`); the key is left
 * out when no record of plans was there.
 */
export function sanitizeSettings(value: unknown): UserSettings {
  const source = isRecord(value) ? value : {};
  // A copy, so a caller can never change the defaults themselves.
  const defaults = JSON.parse(JSON.stringify(DEFAULT_USER_PROFILE.settings)) as UserSettings;
  const settings = { ...defaults, ...source } as UserSettings;
  const plans = sanitizeNextSetPlans(source.nextSetPlans);
  if (plans) settings.nextSetPlans = plans;
  else delete settings.nextSetPlans;
  // Accessory mode, pins and hand-set weights (A5): unreadable values are dropped.
  sanitizeAccessorySettings(settings);
  return settings;
}
