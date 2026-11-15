// Apple Health choices that belong to this device, not to the user's synced
// profile: whether it is connected here, which categories are on, and when the
// last import ran. Kept in localStorage beside the sync passphrase.
import { HEALTH_CATEGORIES, type HealthCategory } from "./types";

const STORAGE_KEY = "recomp-health";

/** Fired on `window` whenever the settings change or an import finishes. */
export const HEALTH_CHANGED_EVENT = "recomp-health-changed";

export interface HealthDeviceSettings {
  /** The user has been through the permission sheet on this device. */
  connected: boolean;
  categories: HealthCategory[];
  /** Epoch milliseconds of the last completed import; null before the first. */
  lastImportAt: number | null;
}

export const DEFAULT_HEALTH_SETTINGS: HealthDeviceSettings = {
  connected: false,
  categories: [...HEALTH_CATEGORIES],
  lastImportAt: null,
};

/** Reads stored settings, tolerating anything missing or malformed. */
export function parseHealthSettings(raw: string | null): HealthDeviceSettings {
  if (!raw) return { ...DEFAULT_HEALTH_SETTINGS, categories: [...HEALTH_CATEGORIES] };
  try {
    const parsed = JSON.parse(raw) as Partial<HealthDeviceSettings>;
    const categories = Array.isArray(parsed.categories)
      ? HEALTH_CATEGORIES.filter((c) => (parsed.categories as unknown[]).includes(c))
      : [...HEALTH_CATEGORIES];
    return {
      connected: parsed.connected === true,
      categories,
      lastImportAt:
        typeof parsed.lastImportAt === "number" && Number.isFinite(parsed.lastImportAt)
          ? parsed.lastImportAt
          : null,
    };
  } catch {
    return { ...DEFAULT_HEALTH_SETTINGS, categories: [...HEALTH_CATEGORIES] };
  }
}

export function getHealthSettings(): HealthDeviceSettings {
  try {
    return parseHealthSettings(localStorage.getItem(STORAGE_KEY));
  } catch {
    return parseHealthSettings(null);
  }
}

/** Merges a change into the stored settings and announces it. */
export function saveHealthSettings(patch: Partial<HealthDeviceSettings>): HealthDeviceSettings {
  const next = { ...getHealthSettings(), ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(HEALTH_CHANGED_EVENT));
  } catch {
    // Storage unavailable (private mode): the choice lasts for this page only.
  }
  return next;
}
