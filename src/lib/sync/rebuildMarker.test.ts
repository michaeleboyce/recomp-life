import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Dexie from "dexie";
import { makeDeviceDb } from "./testFakes";
import { SYNC_META_TABLE, markRebuildNeeded, owedRebuild, rebuildIfNeeded } from "./rebuildMarker";

const derived = vi.hoisted(() => ({ applyRebuild: vi.fn() }));
vi.mock("@/lib/data/derived", () => ({ applyRebuild: derived.applyRebuild }));

let database: Dexie;
let run = 0;

beforeEach(async () => {
  derived.applyRebuild.mockReset().mockResolvedValue({});
  database = makeDeviceDb(`rebuild-marker-${++run}`);
  await database.open();
});

afterEach(async () => {
  database.close();
  await database.delete();
});

describe("the rebuild marker", () => {
  it("owes nothing on a new device, and rebuilds nothing", async () => {
    expect(await owedRebuild(database)).toBeNull();
    expect(await rebuildIfNeeded(database)).toEqual({ rebuilt: false });
    expect(derived.applyRebuild).not.toHaveBeenCalled();
  });

  it("is stored in the device database and cleared by a rebuild that succeeds", async () => {
    await markRebuildNeeded(database);
    expect(await database.table(SYNC_META_TABLE).count()).toBe(1);
    expect(await owedRebuild(database)).toEqual(expect.any(String));

    expect(await rebuildIfNeeded(database)).toEqual({ rebuilt: true });
    expect(derived.applyRebuild).toHaveBeenCalledTimes(1);
    expect(await owedRebuild(database)).toBeNull();

    expect(await rebuildIfNeeded(database)).toEqual({ rebuilt: false });
    expect(derived.applyRebuild).toHaveBeenCalledTimes(1);
  });

  it("stays when the rebuild throws, and the error comes back instead of being thrown", async () => {
    derived.applyRebuild.mockRejectedValueOnce(new Error("boom"));
    await markRebuildNeeded(database);

    expect(await rebuildIfNeeded(database)).toEqual({ rebuilt: true, error: "boom" });
    expect(await owedRebuild(database)).not.toBeNull();

    expect(await rebuildIfNeeded(database)).toEqual({ rebuilt: true });
    expect(await owedRebuild(database)).toBeNull();
  });

  it("stays when rows were merged while the rebuild ran, so the next one includes them", async () => {
    await markRebuildNeeded(database);
    derived.applyRebuild.mockImplementationOnce(async () => {
      // A page merged after the rebuild read the log.
      await markRebuildNeeded(database);
      return {};
    });

    expect(await rebuildIfNeeded(database)).toEqual({ rebuilt: true });
    expect(await owedRebuild(database)).not.toBeNull();

    await rebuildIfNeeded(database);
    expect(derived.applyRebuild).toHaveBeenCalledTimes(2);
    expect(await owedRebuild(database)).toBeNull();
  });
});
