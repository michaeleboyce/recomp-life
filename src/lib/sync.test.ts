import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Dexie from "dexie";
import { makeProfile, makeSet, makeWorkout } from "@/lib/data/testUtils";
import { PROFILE_ID, SYNC_REGISTRY } from "@/lib/sync/registry";
import { FakeSyncServer, TEST_PASSPHRASE, makeDeviceDb } from "@/lib/sync/testFakes";
import {
  REBUILD_TABLES,
  SYNC_UNAUTHORIZED,
  fullSync,
  pullFromServer,
  pushUnsynced,
  syncRequest,
} from "./sync";

const derived = vi.hoisted(() => ({ applyRebuild: vi.fn() }));
vi.mock("@/lib/data/derived", () => ({ applyRebuild: derived.applyRebuild }));

let database: Dexie;
let dbCount = 0;

beforeEach(async () => {
  derived.applyRebuild.mockReset().mockResolvedValue({});
  localStorage.setItem("recomp-sync-key", TEST_PASSPHRASE);
  database = makeDeviceDb(`sync-unit-${++dbCount}`);
  await database.open();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  database.close();
  await database.delete();
});

type Call = [string, RequestInit];
const bodies = (mock: ReturnType<typeof vi.fn>) =>
  mock.mock.calls.map((call) => JSON.parse((call as unknown as Call)[1].body as string));

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const pushOk = (applied: number, skipped = 0) => reply({ success: true, applied, skipped });
const pullReply = (rows: Record<string, unknown[]>, errors: Record<string, string> = {}) =>
  reply({ rows, errors, serverTime: 1_000 });

const workouts = () => database.table("workouts");
const runs = () => database.table("runs");
const profiles = () => database.table("userProfile");

describe("syncRequest", () => {
  it("adds the passphrase header and keeps the caller's headers", async () => {
    const fetchMock = vi.fn(async () => reply({}));
    vi.stubGlobal("fetch", fetchMock);
    await syncRequest("/api/sync/push", { method: "POST", headers: { "Content-Type": "application/json" } });
    const [url, init] = fetchMock.mock.calls[0] as unknown as Call;
    expect(url).toBe("/api/sync/push");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: `Bearer ${TEST_PASSPHRASE}`,
    });
  });
});

describe("REBUILD_TABLES", () => {
  it("names registry tables only", () => {
    const names = new Set(SYNC_REGISTRY.map((t) => t.name));
    for (const name of REBUILD_TABLES) expect(names.has(name), name).toBe(true);
  });
});

describe("pushUnsynced", () => {
  it("sends only dirty rows, as stored, and marks them synced", async () => {
    await workouts().bulkAdd([
      makeWorkout({ id: "w1", synced: false, updatedAt: 10 }),
      makeWorkout({ id: "w2", synced: true, updatedAt: 5 }),
    ]);
    await runs().add({ id: "r1", clientId: "c-r1", notes: "easy", synced: false, updatedAt: 3 });
    const fetchMock = vi.fn(async () => pushOk(1));
    vi.stubGlobal("fetch", fetchMock);

    const result = await pushUnsynced(database);

    const sent = bodies(fetchMock);
    expect(sent.map((b) => b.table)).toEqual(["workouts", "runs"]);
    expect(sent[0].rows.map((r: { id: string }) => r.id)).toEqual(["w1"]);
    expect(sent[0].rows[0]).toMatchObject({ id: "w1", clientId: "c-w1", updatedAt: 10, synced: false });
    expect(result).toMatchObject({ pushed: 2, applied: 2, skipped: 0, marked: 2, errors: {} });
    expect((await workouts().get("w1")).synced).toBe(true);
    expect((await runs().get("r1")).synced).toBe(true);
  });

  it("makes no request when nothing is dirty", async () => {
    await workouts().add(makeWorkout({ id: "w1", synced: true }));
    const fetchMock = vi.fn(async () => pushOk(0));
    vi.stubGlobal("fetch", fetchMock);
    expect((await pushUnsynced(database)).pushed).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("leaves a row dirty when it was edited while its push was in flight", async () => {
    await workouts().bulkAdd([
      makeWorkout({ id: "w1", synced: false, updatedAt: 10 }),
      makeWorkout({ id: "w2", synced: false, updatedAt: 10 }),
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await workouts().update("w1", { templateId: "B1", updatedAt: 11, synced: false });
        return pushOk(2);
      })
    );

    const result = await pushUnsynced(database);

    expect(result.marked).toBe(1);
    expect(await workouts().get("w1")).toMatchObject({ templateId: "B1", updatedAt: 11, synced: false });
    expect((await workouts().get("w2")).synced).toBe(true);
  });

  it("stops with SYNC_UNAUTHORIZED on 401 and marks nothing", async () => {
    await workouts().add(makeWorkout({ id: "w1", synced: false }));
    await runs().add({ id: "r1", clientId: "c-r1", synced: false });
    const fetchMock = vi.fn(async () => reply({ error: "Unauthorized" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(pushUnsynced(database)).rejects.toThrow(SYNC_UNAUTHORIZED);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await workouts().get("w1")).synced).toBe(false);
  });

  it("records a failing table and still pushes the others", async () => {
    await workouts().add(makeWorkout({ id: "w1", synced: false }));
    await runs().add({ id: "r1", clientId: "c-r1", synced: false });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) =>
        JSON.parse(init.body as string).table === "workouts"
          ? reply({ error: "Unknown column in rows for table: workouts" }, 400)
          : pushOk(1)
      )
    );

    const result = await pushUnsynced(database);

    expect(result.errors).toEqual({ workouts: "400 Unknown column in rows for table: workouts" });
    expect(result.pushed).toBe(1);
    expect((await workouts().get("w1")).synced).toBe(false);
    expect((await runs().get("r1")).synced).toBe(true);
  });

  it("records a network failure per table", async () => {
    await runs().add({ id: "r1", clientId: "c-r1", synced: false });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    const result = await pushUnsynced(database);
    expect(result.errors).toEqual({ runs: "Failed to fetch" });
    expect((await runs().get("r1")).synced).toBe(false);
  });

  it("surfaces the server's applied and skipped counts", async () => {
    await runs().bulkAdd([
      { id: "r1", clientId: "c-r1", synced: false, updatedAt: 1 },
      { id: "r2", clientId: "c-r2", synced: false, updatedAt: 1 },
      { id: "r3", clientId: "c-r3", synced: false, updatedAt: 1 },
    ]);
    vi.stubGlobal("fetch", vi.fn(async () => pushOk(1, 2)));
    expect(await pushUnsynced(database)).toMatchObject({ pushed: 3, applied: 1, skipped: 2, marked: 3 });
  });
});

describe("pullFromServer", () => {
  const stubPull = (rows: Record<string, unknown[]>, errors: Record<string, string> = {}) =>
    vi.stubGlobal("fetch", vi.fn(async () => pullReply(rows, errors)));

  it("inserts a row it does not have, marked synced", async () => {
    stubPull({ runs: [{ id: "r1", clientId: "c-r1", notes: "easy", updatedAt: 5, deletedAt: null }] });
    const result = await pullFromServer(database);
    expect(result).toMatchObject({ pulled: 1, inserted: 1, overwritten: 0, kept: 0 });
    expect(await runs().get("r1")).toMatchObject({ notes: "easy", synced: true, deletedAt: null });
  });

  it("overwrites a local row when the server's stamp is newer, keeping the local id", async () => {
    await runs().add({ id: "local-r1", clientId: "c-r1", notes: "old", updatedAt: 5, synced: true });
    stubPull({ runs: [{ id: "server-r1", clientId: "c-r1", notes: "new", updatedAt: 6 }] });

    const result = await pullFromServer(database);

    expect(result.overwritten).toBe(1);
    expect(await runs().count()).toBe(1);
    expect(await runs().get("local-r1")).toMatchObject({ notes: "new", updatedAt: 6, synced: true });
  });

  it("treats a missing local stamp as 0", async () => {
    await runs().add({ id: "r1", clientId: "c-r1", notes: "old", synced: true });
    stubPull({ runs: [{ id: "r1", clientId: "c-r1", notes: "new", updatedAt: 1 }] });
    await pullFromServer(database);
    expect((await runs().get("r1")).notes).toBe("new");
  });

  it("keeps the local row when it is newer or equally new", async () => {
    await runs().bulkAdd([
      { id: "r1", clientId: "c-r1", notes: "local newer", updatedAt: 9, synced: false },
      { id: "r2", clientId: "c-r2", notes: "local equal", updatedAt: 7, synced: true },
    ]);
    stubPull({
      runs: [
        { id: "r1", clientId: "c-r1", notes: "server", updatedAt: 8 },
        { id: "r2", clientId: "c-r2", notes: "server", updatedAt: 7 },
      ],
    });

    const result = await pullFromServer(database);

    expect(result).toMatchObject({ pulled: 0, kept: 2 });
    expect(await runs().get("r1")).toMatchObject({ notes: "local newer", synced: false });
    expect((await runs().get("r2")).notes).toBe("local equal");
  });

  it("brings a tombstone in, so the row drops out of a live-rows filter", async () => {
    await runs().add({ id: "r1", clientId: "c-r1", updatedAt: 5, deletedAt: null, synced: true });
    stubPull({
      runs: [
        { id: "r1", clientId: "c-r1", updatedAt: 6, deletedAt: 6 },
        { id: "r2", clientId: "c-r2", updatedAt: 6, deletedAt: 6 },
      ],
    });

    await pullFromServer(database);

    expect(await runs().count()).toBe(2);
    expect((await runs().get("r1")).deletedAt).toBe(6);
    expect(await runs().filter((r) => r.deletedAt == null).count()).toBe(0);
  });

  it("strips null from optional-not-nullable fields but keeps deletedAt: null", async () => {
    stubPull({
      workouts: [
        { ...makeWorkout({ id: "w1", clientId: "c-w1" }), externalId: null, prescribed: null, deletedAt: null, completedAt: null },
      ],
    });
    await pullFromServer(database);
    const stored = await workouts().get("w1");
    expect("externalId" in stored).toBe(false);
    expect("prescribed" in stored).toBe(false);
    expect(stored.deletedAt).toBeNull();
    expect(stored.completedAt).toBeNull();
  });

  it("revives dates, including those nested in a workout's sets", async () => {
    stubPull({
      workouts: [
        {
          ...makeWorkout({ id: "w9", clientId: "c-w9", templateId: "A1" }),
          startedAt: "2026-11-10T09:00:00.000Z",
          completedAt: "2026-11-10T09:45:00.000Z",
          sets: [{ ...makeSet({ id: "s9" }), completedAt: "2026-11-10T09:10:00.000Z" }],
        },
      ],
    });

    await pullFromServer(database);

    const stored = await workouts().get("w9");
    expect(stored.startedAt).toBeInstanceOf(Date);
    expect(stored.startedAt.toISOString()).toBe("2026-11-10T09:00:00.000Z");
    expect(stored.completedAt).toBeInstanceOf(Date);
    expect(stored.sets[0].completedAt).toBeInstanceOf(Date);
    expect(stored.templateId).toBe("A1");
  });

  describe("the profile", () => {
    const serverProfile = (overrides: Record<string, unknown> = {}) => ({
      ...makeProfile(),
      id: PROFILE_ID,
      clientId: PROFILE_ID,
      createdAt: "2026-11-01T08:00:00.000Z",
      ...overrides,
    });

    it("is inserted with the fixed id when this device has none", async () => {
      stubPull({ userProfile: [serverProfile({ name: "Server", updatedAt: 3 })] });
      await pullFromServer(database);
      const all = await profiles().toArray();
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ id: PROFILE_ID, clientId: PROFILE_ID, name: "Server", synced: true });
      expect(all[0].createdAt).toBeInstanceOf(Date);
    });

    it("overwrites the local profile in place when newer, never adding a second", async () => {
      await profiles().add({ ...makeProfile(), id: "old-local-id", clientId: "old-client", name: "Local", updatedAt: 1 });
      stubPull({ userProfile: [serverProfile({ name: "Server", updatedAt: 2 })] });

      await pullFromServer(database);

      const all = await profiles().toArray();
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ id: "old-local-id", clientId: PROFILE_ID, name: "Server" });
    });

    it("keeps the local profile when it is newer", async () => {
      await profiles().add({ ...makeProfile(), id: PROFILE_ID, clientId: PROFILE_ID, name: "Local", updatedAt: 5 });
      stubPull({ userProfile: [serverProfile({ name: "Server", updatedAt: 4 })] });
      await pullFromServer(database);
      const all = await profiles().toArray();
      expect(all.map((p) => p.name)).toEqual(["Local"]);
    });

    it("takes only the newest when the server sends several", async () => {
      stubPull({
        userProfile: [
          serverProfile({ id: "a", clientId: "a", name: "A", updatedAt: 1 }),
          serverProfile({ id: "b", clientId: "b", name: "B", updatedAt: 2 }),
        ],
      });
      await pullFromServer(database);
      const all = await profiles().toArray();
      expect(all.map((p) => [p.id, p.name])).toEqual([[PROFILE_ID, "B"]]);
    });
  });

  it("reports tables listed in errors and still merges the rest", async () => {
    stubPull({ runs: [{ id: "r1", clientId: "c-r1", updatedAt: 1 }] }, { activities: 'relation "activities" does not exist' });
    const result = await pullFromServer(database);
    expect(result.errors).toEqual({ activities: 'relation "activities" does not exist' });
    expect(await runs().get("r1")).toBeDefined();
  });

  it("throws SYNC_UNAUTHORIZED on 401 and a status error otherwise", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({}, 401)));
    await expect(pullFromServer(database)).rejects.toThrow(SYNC_UNAUTHORIZED);
    vi.stubGlobal("fetch", vi.fn(async () => reply({}, 500)));
    await expect(pullFromServer(database)).rejects.toThrow("Pull failed: 500");
  });

  describe("rebuild", () => {
    it("runs once when workouts or adjustments were inserted or overwritten", async () => {
      await workouts().add(makeWorkout({ id: "w1", clientId: "c-w1", updatedAt: 1, synced: true }));
      stubPull({
        workouts: [
          makeWorkout({ id: "w1", clientId: "c-w1", updatedAt: 2 }),
          makeWorkout({ id: "w2", clientId: "c-w2", updatedAt: 2 }),
        ],
        liftAdjustments: [{ id: "a1", clientId: "c-a1", exerciseId: "squat", updatedAt: 2 }],
      });

      const result = await pullFromServer(database);

      expect(result.rebuilt).toBe(true);
      expect(derived.applyRebuild).toHaveBeenCalledTimes(1);
    });

    it("runs for a pulled adjustment alone", async () => {
      stubPull({ liftAdjustments: [{ id: "a1", clientId: "c-a1", exerciseId: "squat", updatedAt: 2 }] });
      await pullFromServer(database);
      expect(derived.applyRebuild).toHaveBeenCalledTimes(1);
    });

    it("does not run when only other tables changed or every workout was kept", async () => {
      await workouts().add(makeWorkout({ id: "w1", clientId: "c-w1", updatedAt: 5, synced: true }));
      stubPull({
        workouts: [makeWorkout({ id: "w1", clientId: "c-w1", updatedAt: 5 })],
        runs: [{ id: "r1", clientId: "c-r1", updatedAt: 1 }],
      });
      const result = await pullFromServer(database);
      expect(result.rebuilt).toBe(false);
      expect(derived.applyRebuild).not.toHaveBeenCalled();
    });

    it("reports a failed rebuild without losing the pulled rows", async () => {
      derived.applyRebuild.mockRejectedValue(new Error("applyRebuild is not implemented yet"));
      stubPull({ workouts: [makeWorkout({ id: "w1", clientId: "c-w1", updatedAt: 1 })] });
      const result = await pullFromServer(database);
      expect(result.rebuildError).toBe("applyRebuild is not implemented yet");
      expect(await workouts().get("w1")).toBeDefined();
    });
  });
});

describe("fullSync", () => {
  it("pushes then pulls and reports success", async () => {
    const server = new FakeSyncServer();
    vi.stubGlobal("fetch", server.fetch);
    await runs().add({ id: "r1", clientId: "c-r1", synced: false, updatedAt: 1 });

    const result = await fullSync(database);

    expect(result).toEqual({ pushed: 1, pulled: 0, errors: [], pullSucceeded: true });
    expect(server.requests.map((r) => r.path)).toEqual(["/api/sync/push", "/api/sync/pull"]);
  });

  it("collects push, pull and rebuild failures as strings, never throwing", async () => {
    const server = new FakeSyncServer();
    server.failPush.add("runs");
    server.pullErrors = { activities: "missing" };
    vi.stubGlobal("fetch", server.fetch);
    derived.applyRebuild.mockRejectedValue(new Error("nope"));
    await runs().add({ id: "r1", clientId: "c-r1", synced: false, updatedAt: 1 });
    server.tables.set("workouts", new Map([["c-w9", { ...makeWorkout({ id: "w9", clientId: "c-w9" }), updatedAt: 1 }]]));

    const result = await fullSync(database);

    expect(result.errors).toEqual(["Push runs: 500 Boom", "Pull activities: missing", "Rebuild: nope"]);
    expect(result.pullSucceeded).toBe(true);
  });

  it("reports a rejected passphrase from push and pull", async () => {
    localStorage.removeItem("recomp-sync-key");
    vi.stubGlobal("fetch", new FakeSyncServer().fetch);
    await runs().add({ id: "r1", clientId: "c-r1", synced: false });

    const result = await fullSync(database);

    expect(result.errors).toEqual([`Push: ${SYNC_UNAUTHORIZED}`, `Pull: ${SYNC_UNAUTHORIZED}`]);
    expect(result.pullSucceeded).toBe(false);
  });
});
