import { describe, expect, it, vi } from "vitest";
import {
  LAST_IMPORT_KEY,
  MAPPINGS_CHANGED_EVENT,
  MAPPINGS_KEY,
  clearLastImport,
  loadLastImport,
  loadMappingOverrides,
  mappingOverridesSnapshot,
  saveLastImport,
  saveMappingOverrides,
} from "./remembered";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("remembered name choices", () => {
  it("round-trips the choices made on the import screen", () => {
    const store = memoryStore();
    const overrides = {
      zorblax: { kind: "exercise" as const, exerciseId: "bicep_curls" },
      wobble: { kind: "custom" as const, primary: ["chest" as const] },
    };
    saveMappingOverrides(overrides, store);
    expect(loadMappingOverrides(store)).toEqual(overrides);
  });

  it("drops anything unreadable and survives a store that throws", () => {
    const store = memoryStore();
    store.data.set(MAPPINGS_KEY, JSON.stringify({ a: { kind: "exercise" }, b: { kind: "custom", primary: ["elbows"] }, c: 3 }));
    expect(loadMappingOverrides(store)).toEqual({});
    store.data.set(MAPPINGS_KEY, "{not json");
    expect(loadMappingOverrides(store)).toEqual({});
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadMappingOverrides(broken)).toEqual({});
    expect(() => saveMappingOverrides({}, broken)).not.toThrow();
    expect(loadMappingOverrides(null)).toEqual({});
  });
});

describe("the last import", () => {
  it("is kept for undo and cleared after it", () => {
    const store = memoryStore();
    const record = { batchId: "b1", at: 5, fileName: "export.csv", sessions: 3, runIds: ["r"], activityIds: [] };
    saveLastImport(record, store);
    expect(loadLastImport(store)).toEqual(record);
    clearLastImport(store);
    expect(loadLastImport(store)).toBeNull();
    store.data.set(LAST_IMPORT_KEY, JSON.stringify({ batchId: 1 }));
    expect(loadLastImport(store)).toBeNull();
  });
});

describe("the remembered choices as evidence reads them", () => {
  it("is one object until the stored choices change, and saving tells the screens", () => {
    const store = memoryStore();
    const first = mappingOverridesSnapshot(store);
    expect(mappingOverridesSnapshot(store)).toBe(first);
    const heard = vi.fn();
    window.addEventListener(MAPPINGS_CHANGED_EVENT, heard);
    saveMappingOverrides({ zorblax: { kind: "exercise", exerciseId: "db_bench" } }, store);
    window.removeEventListener(MAPPINGS_CHANGED_EVENT, heard);
    expect(heard).toHaveBeenCalledTimes(1);
    const next = mappingOverridesSnapshot(store);
    expect(next).not.toBe(first);
    expect(next).toEqual({ zorblax: { kind: "exercise", exerciseId: "db_bench" } });
    expect(mappingOverridesSnapshot(store)).toBe(next);
  });
});
