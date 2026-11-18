// Settings merged field by field between devices. The profile is one synced row, and a
// row is last-write-wins as a whole; without this, a set plan saved on one device and
// the theme changed on another between syncs would lose one of the two. Each write
// stamps the settings paths it changed (`stampSettingsChanges`), and a pull merges the
// two copies path by path, the newer stamp winning (`mergeSettings`). A removal keeps
// its stamp, so a plan used up on one device is not brought back by the other.
// Pure: no database.
import type { UserSettings } from "@/types";

/** The settings key that holds the stamps. Never merged as a field itself. */
export const STAMPS_KEY = "fieldStamps";

/**
 * Fields that are maps of independent entries, with how many levels of keys lead to one
 * entry: two set plans, or two pinned days, are two paths, not one field.
 */
const ENTRY_DEPTH: Readonly<Record<string, number>> = {
  nextSetPlans: 1,
  accessoryPins: 1,
  accessoryWeights: 1,
  exercisePreferences: 1,
  exercisePreferencesByLocation: 2,
};

/**
 * How long the stamp of a removed path is kept. A device offline longer than this could
 * bring a removed entry back; any shorter and a week away would.
 */
export const REMOVED_STAMP_TTL_MS = 365 * 24 * 60 * 60 * 1000;

type Settings = Record<string, unknown>;
type Stamps = Record<string, number>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

/** A path as a stamp key: JSON, so no key a map may hold can be confused with another. */
const pathKey = (path: readonly string[]) => JSON.stringify(path);
const pathOf = (key: string): string[] => JSON.parse(key) as string[];

/** The stamps held in `settings`: finite numbers under string keys; anything else is none. */
export function stampsOf(settings: unknown): Stamps {
  const raw = isRecord(settings) ? settings[STAMPS_KEY] : undefined;
  if (!isRecord(raw)) return {};
  const stamps: Stamps = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "number" && Number.isFinite(value)) stamps[key] = value;
  }
  return stamps;
}

/**
 * Every value in `settings` by path. A map field gives one path per entry (a map field
 * that is not a record gives none); any other field is one path. Only present keys have
 * paths: an explicit `null` is a value, a missing key is not.
 */
function leaves(settings: Settings): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const walk = (value: unknown, path: string[], depth: number) => {
    if (depth === 0) {
      out.set(pathKey(path), value);
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, entry] of Object.entries(value)) walk(entry, [...path, key], depth - 1);
  };
  for (const [field, value] of Object.entries(settings)) {
    if (field === STAMPS_KEY) continue;
    walk(value, [field], ENTRY_DEPTH[field] ?? 0);
  }
  return out;
}

/** Settings rebuilt from paths (the inverse of `leaves`), stamps not included. */
function fromLeaves(values: Map<string, unknown>): Settings {
  const out: Settings = {};
  for (const [key, value] of values) {
    const path = pathOf(key);
    let node = out;
    for (const segment of path.slice(0, -1)) {
      if (!isRecord(node[segment])) node[segment] = {};
      node = node[segment] as Settings;
    }
    node[path[path.length - 1]] = value;
  }
  return out;
}

/** Key order does not matter; a Date compares by its time (as JSON writes it). */
function canonical(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);

/** Drops the stamps of removed paths older than REMOVED_STAMP_TTL_MS. */
function pruned(stamps: Stamps, present: Map<string, unknown>, now: number): Stamps {
  const out: Stamps = {};
  for (const [key, stamp] of Object.entries(stamps)) {
    if (present.has(key) || now - stamp < REMOVED_STAMP_TTL_MS) out[key] = stamp;
  }
  return out;
}

/**
 * `after` with its stamps updated for a write made at `now`: every path whose value
 * differs from `before` (added, changed, removed, or set to null) is stamped `now`; the
 * others keep their stamps. Map fields that become empty keep an empty record.
 */
export function stampSettingsChanges<T extends UserSettings>(before: UserSettings, after: T, now: number): T {
  const was = leaves(before as unknown as Settings);
  const is = leaves(after as unknown as Settings);
  const stamps = { ...stampsOf(before), ...stampsOf(after) };
  for (const key of new Set([...was.keys(), ...is.keys()])) {
    if (was.has(key) !== is.has(key) || !same(was.get(key), is.get(key))) stamps[key] = now;
  }
  return { ...after, [STAMPS_KEY]: pruned(stamps, is, now) };
}

export interface SettingsMerge {
  settings: UserSettings;
  /** The local copy held a newer value for some path: the server needs the merged row. */
  serverBehind: boolean;
  /** The server held a newer value for some path: the local copy changes. */
  localBehind: boolean;
}

/**
 * The two copies merged path by path: each path takes the value (or the absence) of the
 * copy with the newer stamp; a path unstamped on both, or stamped equally, takes the
 * server's. Both copies should already be sanitized (`sanitizeSettings`).
 */
export function mergeSettings(local: UserSettings, server: UserSettings, now: number = Date.now()): SettingsMerge {
  const localValues = leaves(local as unknown as Settings);
  const serverValues = leaves(server as unknown as Settings);
  const localStamps = stampsOf(local);
  const serverStamps = stampsOf(server);
  const keys = new Set([
    ...localValues.keys(),
    ...serverValues.keys(),
    ...Object.keys(localStamps),
    ...Object.keys(serverStamps),
  ]);

  const merged = new Map<string, unknown>();
  const stamps: Stamps = {};
  let serverBehind = false;
  let localBehind = false;
  for (const key of keys) {
    const ls = localStamps[key] ?? 0;
    const ss = serverStamps[key] ?? 0;
    const winner = ls > ss ? localValues : serverValues;
    if (winner.has(key)) merged.set(key, winner.get(key));
    if (ls > 0 || ss > 0) stamps[key] = Math.max(ls, ss);
    if (ls > ss) serverBehind = true;
    else if (ss > ls) localBehind = true;
    else if (localValues.has(key) !== serverValues.has(key) || !same(localValues.get(key), serverValues.get(key))) {
      localBehind = true;
    }
  }

  const settings = fromLeaves(merged);
  // A map field either copy holds stays a record even when it has no entries left.
  for (const field of Object.keys(ENTRY_DEPTH)) {
    if (!(field in settings) && (field in local || field in server)) {
      const source = field in server ? server : local;
      if (isRecord((source as unknown as Settings)[field])) settings[field] = {};
    }
  }
  settings[STAMPS_KEY] = pruned(stamps, merged, now);
  return { settings: settings as unknown as UserSettings, serverBehind, localBehind };
}
