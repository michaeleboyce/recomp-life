// Exercise preferences travel between devices. Device A is the app's own database
// (the data layer writes only to it); device B is a second database that syncs
// through the same in-memory server.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Dexie from "dexie";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { fullSync } from "@/lib/sync";
import { resetPullState } from "@/lib/sync/pullState";
import { FakeSyncServer, TEST_PASSPHRASE, makeDeviceDb } from "@/lib/sync/testFakes";
import type { UserSettings } from "@/types";
import { setExercisePreference } from "./records";
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
  B = makeDeviceDb(`preference-sync-${++run}-B`);
  await B.open();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  B.close();
  await B.delete();
});

describe("setExercisePreference", () => {
  it("a preference set on device A reaches device B after both sync", async () => {
    await syncA();
    await syncB();
    expect((await settingsOn(B)).exercisePreferences?.incline_db_press).toBeUndefined();

    await setExercisePreference("all", "incline_db_press", "preferred");
    await setExercisePreference("gym", "pendulum_squat", "blocked");
    const first = await syncA();
    const second = await syncB();

    expect(first.errors).toEqual([]);
    expect(second.errors).toEqual([]);
    const onB = await settingsOn(B);
    expect(onB.exercisePreferences?.incline_db_press).toBe("preferred");
    expect(onB.exercisePreferencesByLocation?.gym?.pendulum_squat).toBe("blocked");
    expect(await settingsOn(B)).toEqual(await settingsOn(db));
  });

  it("stamps the edit and marks the profile unsynced", async () => {
    const before = (await db.userProfile.toCollection().first())!;
    await db.userProfile.update(before.id, { synced: true });

    await setExercisePreference("home", "db_pullover", "blocked", before.updatedAt!);

    const after = (await db.userProfile.toCollection().first())!;
    expect(after.updatedAt!).toBeGreaterThan(before.updatedAt!);
    expect(after.synced).toBe(false);
    expect(after.settings.exercisePreferencesByLocation?.home?.db_pullover).toBe("blocked");
    expect(after.settings.exercisePreferences ?? {}).toEqual(before.settings.exercisePreferences ?? {});
  });

  it("reads the settings as stored, so changes made one after another never undo each other", async () => {
    await Promise.all([
      setExercisePreference("all", "incline_db_press", "preferred"),
      setExercisePreference("all", "leg_curls", "blocked"),
      setExercisePreference("gym", "pendulum_squat", "preferred"),
    ]);

    const settings = await settingsOn(db);
    expect(settings.exercisePreferences).toMatchObject({
      incline_db_press: "preferred",
      leg_curls: "blocked",
    });
    expect(settings.exercisePreferencesByLocation?.gym?.pendulum_squat).toBe("preferred");
  });

  it("keeps the rest of the settings as they are", async () => {
    const before = await settingsOn(db);
    await setExercisePreference("all", "incline_db_press", "preferred");
    expect(await settingsOn(db)).toEqual({
      ...before,
      exercisePreferences: { ...before.exercisePreferences, incline_db_press: "preferred" },
      exercisePreferencesByLocation: before.exercisePreferencesByLocation ?? {},
      // When the preference changed, for the sync merge.
      fieldStamps: { [JSON.stringify(["exercisePreferences", "incline_db_press"])]: expect.any(Number) },
    });
  });
});
