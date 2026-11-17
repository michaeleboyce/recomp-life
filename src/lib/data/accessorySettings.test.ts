// Accessory settings (A5) through the data layer, and between devices. Device A is the
// app's own database; device B is a second database syncing through the same
// in-memory server.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Dexie from "dexie";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { accessoryModeOf, accessoryPinsFor } from "@/lib/accessories/settings";
import { handSetAccessoryWeight } from "@/lib/accessories/prescription";
import { fullSync } from "@/lib/sync";
import { resetPullState } from "@/lib/sync/pullState";
import { FakeSyncServer, TEST_PASSPHRASE, makeDeviceDb } from "@/lib/sync/testFakes";
import type { UserSettings } from "@/types";
import { exportBackup, importBackup, parseBackup } from "./backup";
import { clearAccessoryWeight, setAccessorySettings, setAccessoryWeight } from "./records";
import { clearDb } from "./testUtils";

let server: FakeSyncServer;
let B: Dexie;
let run = 0;

const syncA = () => server.as("A", () => fullSync(db));
const syncB = () => server.as("B", () => fullSync(B));
const settingsOn = async (database: Dexie): Promise<UserSettings> =>
  (await database.table("userProfile").toCollection().first()).settings;

beforeEach(async () => {
  await clearDb();
  resetPullState(db.name);
  await initializeDatabase();
  localStorage.setItem("recomp-sync-key", TEST_PASSPHRASE);
  server = new FakeSyncServer();
  vi.stubGlobal("fetch", server.fetch);
  B = makeDeviceDb(`accessory-sync-${++run}-B`);
  await B.open();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  B.close();
  await B.delete();
});

describe("setAccessorySettings", () => {
  it("an old profile reads as chosen for me, with no pins", async () => {
    const settings = await settingsOn(db);
    expect(accessoryModeOf(settings)).toBe("auto");
    expect(accessoryPinsFor(settings, "A1")).toEqual([]);
  });

  it("sets the mode and pins and unpins in order, stamped", async () => {
    const before = (await db.userProfile.toCollection().first())!;
    await db.userProfile.update(before.id, { synced: true });
    await setAccessorySettings({ mode: "ask" }, before.updatedAt! + 1);
    await setAccessorySettings({ pin: { templateId: "A1", exerciseId: "hack_squat", pinned: true } });
    await setAccessorySettings({ pin: { templateId: "A1", exerciseId: "face_pulls", pinned: true } });
    await setAccessorySettings({ pin: { templateId: "B1", exerciseId: "calf_raises", pinned: true } });
    await setAccessorySettings({ pin: { templateId: "B1", exerciseId: "calf_raises", pinned: false } });

    const after = (await db.userProfile.toCollection().first())!;
    expect(after.updatedAt!).toBeGreaterThan(before.updatedAt!);
    expect(after.synced).toBe(false);
    expect(after.settings.accessories).toBe("ask");
    expect(after.settings.accessoryPins).toEqual({ A1: ["hack_squat", "face_pulls"] });
  });

  it("quick pins one after another never undo each other", async () => {
    await Promise.all([
      setAccessorySettings({ pin: { templateId: "A1", exerciseId: "a", pinned: true } }),
      setAccessorySettings({ pin: { templateId: "A1", exerciseId: "b", pinned: true } }),
      setAccessorySettings({ pin: { templateId: "A2", exerciseId: "c", pinned: true } }),
    ]);
    const pins = (await settingsOn(db)).accessoryPins!;
    expect(pins.A1).toEqual(["a", "b"]);
    expect(pins.A2).toEqual(["c"]);
  });

  it("a pin set on device A reaches device B after both sync", async () => {
    await syncA();
    await syncB();
    expect(accessoryPinsFor(await settingsOn(B), "A1")).toEqual([]);

    await setAccessorySettings({ mode: "none", pin: { templateId: "A1", exerciseId: "hack_squat", pinned: true } });
    const first = await syncA();
    const second = await syncB();

    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
    const onB = await settingsOn(B);
    expect(accessoryPinsFor(onB, "A1")).toEqual(["hack_squat"]);
    expect(accessoryModeOf(onB)).toBe("none");
    expect(onB).toEqual(await settingsOn(db));
  });
});

describe("backup", () => {
  it("keeps the accessory settings through export and restore, and drops damaged ones", async () => {
    await setAccessorySettings({ mode: "ask", pin: { templateId: "A1", exerciseId: "hack_squat", pinned: true } });
    await setAccessoryWeight("leg_curls", 85, 1_000);
    const backup = await exportBackup();
    await importBackup(parseBackup(JSON.stringify(backup)));
    expect(await settingsOn(db)).toMatchObject({
      accessories: "ask",
      accessoryPins: { A1: ["hack_squat"] },
      accessoryWeights: { leg_curls: { weight: 85, setAt: 1_000 } },
    });

    const damaged = JSON.parse(JSON.stringify(backup));
    const profile = damaged.tables.userProfile[0];
    profile.settings = { ...profile.settings, accessories: "always", accessoryPins: { A1: "x" }, accessoryWeights: { a: { weight: "x" } } };
    await importBackup(parseBackup(JSON.stringify(damaged)));
    const restored = await settingsOn(db);
    expect(accessoryModeOf(restored)).toBe("auto");
    expect(restored.accessoryPins).toEqual({});
    expect(restored.accessoryWeights).toEqual({});
  });
});

describe("setAccessoryWeight", () => {
  it("stores a hand-set weight with its time, and clears it", async () => {
    await setAccessoryWeight("leg_curls", 85, 1_000);
    expect((await settingsOn(db)).accessoryWeights).toEqual({ leg_curls: { weight: 85, setAt: 1_000 } });
    expect(handSetAccessoryWeight(await settingsOn(db), "leg_curls", [])).toEqual({ weight: 85, setAt: 1_000 });
    await clearAccessoryWeight("leg_curls");
    expect((await settingsOn(db)).accessoryWeights).toEqual({});
    expect(handSetAccessoryWeight(await settingsOn(db), "leg_curls", [])).toBeNull();
  });

  it("rejects a weight that is not a number of at least 0", async () => {
    await expect(setAccessoryWeight("leg_curls", -5)).rejects.toThrow();
    await expect(setAccessoryWeight("leg_curls", Number.NaN)).rejects.toThrow();
  });

  it("a hand-set weight on device A reaches device B after both sync", async () => {
    await syncA();
    await syncB();
    await setAccessoryWeight("machine_row", 95, 2_000);
    expect((await syncA()).errors).toEqual([]);
    expect((await syncB()).errors).toEqual([]);
    expect((await settingsOn(B)).accessoryWeights).toEqual({ machine_row: { weight: 95, setAt: 2_000 } });
  });
});
