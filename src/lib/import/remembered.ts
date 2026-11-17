/**
 * What the import screen remembers on this device: the exercise-name choices made in
 * a preview (read before the built-in table on the next import, and when imported sets
 * are read as evidence, so a later choice remaps history without a re-import), and the
 * last import, so it can still be undone after the screen is closed. What a name mapped
 * to at import time is stored with each imported set too, so a device without the
 * choices reads the history as it was imported.
 *
 * Every read and write is guarded: storage can be missing or refuse (private mode).
 */
import type { MappingOverride, MappingOverrides } from "@/lib/import/mapping";
import { isMuscleId } from "@/lib/muscles";

export const MAPPINGS_KEY = "recomp-import-mappings";
export const LAST_IMPORT_KEY = "recomp-import-last";

type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultStore(): KeyValueStore | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function readJson(key: string, store: KeyValueStore | null): unknown {
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown, store: KeyValueStore | null): void {
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered on this device; the import itself is unaffected.
  }
}

function isOverride(value: unknown): value is MappingOverride {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.kind === "exercise") return typeof v.exerciseId === "string";
  if (v.kind === "custom") {
    const list = (x: unknown) => Array.isArray(x) && x.every((m) => typeof m === "string" && isMuscleId(m));
    return list(v.primary) && (v.secondary === undefined || list(v.secondary));
  }
  return false;
}

/** The remembered name choices; anything unreadable is dropped. */
export function loadMappingOverrides(store: KeyValueStore | null = defaultStore()): MappingOverrides {
  const raw = readJson(MAPPINGS_KEY, store);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: MappingOverrides = {};
  for (const [name, choice] of Object.entries(raw as Record<string, unknown>)) {
    if (isOverride(choice)) out[name] = choice;
  }
  return out;
}

/** Sent on `window` after the remembered choices change, so evidence reads them again. */
export const MAPPINGS_CHANGED_EVENT = "recomp-import-mappings-changed";

export function saveMappingOverrides(overrides: MappingOverrides, store: KeyValueStore | null = defaultStore()): void {
  writeJson(MAPPINGS_KEY, overrides, store);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MAPPINGS_CHANGED_EVENT));
}

let snapshotRaw: string | null | undefined;
let snapshotValue: MappingOverrides = {};

/**
 * The remembered choices as one object that stays the same while what is stored does
 * not change (for `useSyncExternalStore`).
 */
export function mappingOverridesSnapshot(store: KeyValueStore | null = defaultStore()): MappingOverrides {
  let raw: string | null = null;
  try {
    raw = store?.getItem(MAPPINGS_KEY) ?? null;
  } catch {
    raw = null;
  }
  if (raw !== snapshotRaw) {
    snapshotRaw = raw;
    snapshotValue = loadMappingOverrides(store);
  }
  return snapshotValue;
}

/** What undoing an import needs: its batch (the sessions) and the cardio rows it added. */
export interface ImportUndoRecord {
  batchId: string;
  /** When the import ran, epoch ms. */
  at: number;
  fileName: string;
  sessions: number;
  runIds: string[];
  activityIds: string[];
}

function isUndoRecord(value: unknown): value is ImportUndoRecord {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const ids = (x: unknown) => Array.isArray(x) && x.every((id) => typeof id === "string");
  return (
    typeof v.batchId === "string" &&
    typeof v.at === "number" &&
    typeof v.fileName === "string" &&
    typeof v.sessions === "number" &&
    ids(v.runIds) &&
    ids(v.activityIds)
  );
}

export function loadLastImport(store: KeyValueStore | null = defaultStore()): ImportUndoRecord | null {
  const raw = readJson(LAST_IMPORT_KEY, store);
  return isUndoRecord(raw) ? raw : null;
}

export function saveLastImport(record: ImportUndoRecord, store: KeyValueStore | null = defaultStore()): void {
  writeJson(LAST_IMPORT_KEY, record, store);
}

export function clearLastImport(store: KeyValueStore | null = defaultStore()): void {
  if (!store) return;
  try {
    store.removeItem(LAST_IMPORT_KEY);
  } catch {
    // Nothing to clear.
  }
}
