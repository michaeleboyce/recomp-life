/**
 * What the import screen remembers on this device: the exercise-name choices made in
 * a preview (read before the built-in table on the next import), and the last import,
 * so it can still be undone after the screen is closed. The choices only steer how the
 * next file is mapped; what a name mapped to is stored with each imported set, so every
 * device reads the same history.
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

export function saveMappingOverrides(overrides: MappingOverrides, store: KeyValueStore | null = defaultStore()): void {
  writeJson(MAPPINGS_KEY, overrides, store);
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
