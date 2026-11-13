// Requirement E10: sync carries edits and deletes between devices, last write wins.
// Two fake-indexeddb databases talk to one in-memory server through the real client.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Dexie from "dexie";
import { makeProfile, makeWorkout } from "@/lib/data/testUtils";
import { fullSync, pullFromServer, pushUnsynced } from "@/lib/sync";
import { PROFILE_ID } from "./registry";
import { FakeSyncServer, TEST_PASSPHRASE, makeDeviceDb } from "./testFakes";

const derived = vi.hoisted(() => ({ applyRebuild: vi.fn() }));
vi.mock("@/lib/data/derived", () => ({ applyRebuild: derived.applyRebuild }));

let server: FakeSyncServer;
let A: Dexie;
let B: Dexie;
const opened: Dexie[] = [];
let run = 0;

async function device(label: string): Promise<Dexie> {
  const database = makeDeviceDb(`two-device-${++run}-${label}`);
  await database.open();
  opened.push(database);
  return database;
}

const nameOf = (database: Dexie) => (database === A ? "A" : database === B ? "B" : "other");
const sync = (database: Dexie) => server.as(nameOf(database), () => fullSync(database));
const push = (database: Dexie) => server.as(nameOf(database), () => pushUnsynced(database));
const pull = (database: Dexie) => server.as(nameOf(database), () => pullFromServer(database));

/** A local edit the way the data layer writes one: new stamp, dirty. */
async function edit(database: Dexie, table: string, id: string, changes: Record<string, unknown>, at: number) {
  await database.table(table).update(id, { ...changes, updatedAt: at, synced: false });
}

const runRow = (id: string, notes: string, updatedAt: number) => ({
  id,
  clientId: `c-${id}`,
  date: new Date("2026-11-10T07:00:00Z"),
  durationMinutes: 30,
  distanceMiles: 3,
  type: "outdoor",
  category: "easy",
  notes,
  perceivedEffort: 3,
  deletedAt: null,
  updatedAt,
  synced: false,
});

const byClientId = async (database: Dexie, table: string, clientId: string) =>
  database.table(table).where("clientId").equals(clientId).first();

beforeEach(async () => {
  derived.applyRebuild.mockReset().mockResolvedValue({});
  localStorage.setItem("recomp-sync-key", TEST_PASSPHRASE);
  server = new FakeSyncServer();
  vi.stubGlobal("fetch", server.fetch);
  A = await device("A");
  B = await device("B");
});

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const database of opened.splice(0)) {
    database.close();
    await database.delete();
  }
});

describe("two devices, one server", () => {
  it("an edit on A reaches B, and B rebuilds after a workout changed", async () => {
    await A.table("runs").add(runRow("r1", "easy", 100));
    await A.table("workouts").add(makeWorkout({ id: "w1", clientId: "c-w1", updatedAt: 100 }));
    await sync(A);
    await sync(B);
    expect((await byClientId(B, "runs", "c-r1")).notes).toBe("easy");
    derived.applyRebuild.mockClear();

    await edit(A, "runs", "r1", { notes: "felt great" }, 200);
    await edit(A, "workouts", "w1", { templateId: "B1" }, 200);
    await sync(A);
    const result = await pull(B);

    expect(result.overwritten).toBe(2);
    expect(await byClientId(B, "runs", "c-r1")).toMatchObject({ notes: "felt great", updatedAt: 200, synced: true });
    expect((await byClientId(B, "workouts", "c-w1")).templateId).toBe("B1");
    expect(derived.applyRebuild).toHaveBeenCalledTimes(1);
  });

  it("a run soft-deleted on A is soft-deleted on B", async () => {
    await A.table("runs").add(runRow("r1", "easy", 100));
    await sync(A);
    await sync(B);

    await edit(A, "runs", "r1", { deletedAt: 300 }, 300);
    await sync(A);
    await pull(B);

    const onB = await byClientId(B, "runs", "c-r1");
    expect(onB.deletedAt).toBe(300);
    expect(await B.table("runs").filter((r) => r.deletedAt == null).count()).toBe(0);
  });

  it.each([
    ["A first", ["A", "B"]],
    ["B first", ["B", "A"]],
  ])("offline edits to the same row resolve to the later stamp (%s)", async (_label, order) => {
    await A.table("runs").add(runRow("r1", "original", 100));
    await sync(A);
    await sync(B);

    await edit(A, "runs", "r1", { notes: "A's edit" }, 200);
    await edit(B, "runs", "r1", { notes: "B's edit" }, 250);
    const devices = order.map((label) => (label === "A" ? A : B));
    await sync(devices[0]);
    await sync(devices[1]);
    await sync(devices[0]);

    for (const database of [A, B]) {
      expect(await byClientId(database, "runs", "c-r1"), nameOf(database)).toMatchObject({
        notes: "B's edit",
        updatedAt: 250,
      });
    }
    expect(server.rows("runs")).toHaveLength(1);
    expect(server.rows("runs")[0]).toMatchObject({ notes: "B's edit", updatedAt: 250 });
  });

  it("an edit made on A while its push is in flight stays dirty and goes out next push", async () => {
    await A.table("runs").add(runRow("r1", "first", 100));
    server.onPush = async (speaker, request) => {
      if (speaker === "A" && request.table === "runs") {
        server.onPush = undefined;
        await edit(A, "runs", "r1", { notes: "second" }, 101);
      }
    };

    await push(A);

    expect(server.rows("runs")[0].notes).toBe("first");
    expect(await A.table("runs").get("r1")).toMatchObject({ notes: "second", synced: false });

    const again = await push(A);

    expect(again).toMatchObject({ pushed: 1, applied: 1 });
    expect(server.rows("runs")[0]).toMatchObject({ notes: "second", updatedAt: 101 });
    expect((await A.table("runs").get("r1")).synced).toBe(true);
    await pull(B);
    expect((await byClientId(B, "runs", "c-r1")).notes).toBe("second");
  });

  it("a brand-new device pulls everything, the profile included, and holds one profile", async () => {
    await A.table("userProfile").add({ ...makeProfile(), id: "seeded-a", clientId: "seeded-a", name: "A", updatedAt: 100, synced: false });
    await B.table("userProfile").add({ ...makeProfile(), id: "seeded-b", clientId: "seeded-b", name: "B", updatedAt: 200, synced: false });
    await A.table("runs").add(runRow("r1", "easy", 100));
    await A.table("runs").add({ ...runRow("r2", "deleted", 100), deletedAt: 150, updatedAt: 150 });
    await B.table("workouts").add(makeWorkout({ id: "w1", clientId: "c-w1", updatedAt: 100 }));
    await sync(A);
    await sync(B);
    await sync(A);

    expect(server.rows("userProfile")).toHaveLength(1);

    const C = await device("C");
    const result = await server.as("C", () => fullSync(C));

    expect(result.errors).toEqual([]);
    expect(await C.table("runs").count()).toBe(2);
    expect((await C.table("runs").get("r2")).deletedAt).toBe(150);
    expect(await C.table("workouts").count()).toBe(1);
    const profiles = await C.table("userProfile").toArray();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ id: PROFILE_ID, clientId: PROFILE_ID, name: "B" });
    expect(profiles[0].createdAt).toBeInstanceOf(Date);
    for (const database of [A, B]) {
      const own = await database.table("userProfile").toArray();
      expect(own, nameOf(database)).toHaveLength(1);
      expect(own[0].name).toBe("B");
    }
    expect(server.requests.some((r) => r.device === "C" && r.path === "/api/sync/pull")).toBe(true);
  });
});
