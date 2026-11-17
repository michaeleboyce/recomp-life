import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type Dexie from "dexie";
import { makeProfile, makeSet, makeWorkout } from "@/lib/data/testUtils";
import { PROFILE_ID, SYNC_REGISTRY } from "@/lib/sync/registry";
import { FakeSyncServer, TEST_PASSPHRASE, makeDeviceDb } from "@/lib/sync/testFakes";
import { MAX_PUSH_BYTES, MAX_PUSH_ROWS, PULL_SINCE_OVERLAP_MS, decodePullCursor } from "@/lib/sync/wire";
import { loadPullState, resetPullState } from "@/lib/sync/pullState";
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
/** A pull answer for one table: its rows in one page, or a 500 when the table is in `errors`. */
const pullReply = (url: string, rows: Record<string, unknown[]>, errors: Record<string, string> = {}) => {
  const table = new URL(url, "http://fake.local").searchParams.get("table") ?? "";
  if (table in errors) return reply({ error: errors[table], code: "read_failed" }, 500);
  return reply({ table, rows: rows[table] ?? [], nextCursor: null, serverTime: 1_000 });
};

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

  describe("batches of at most MAX_PUSH_ROWS", () => {
    const dirtyRuns = (count: number) =>
      runs().bulkAdd(
        Array.from({ length: count }, (_, i) => ({ id: `r${i}`, clientId: `c-r${i}`, synced: false, updatedAt: 1 }))
      );
    const acceptAll = () =>
      vi.fn(async (_url: string, init: RequestInit) => pushOk(JSON.parse(init.body as string).rows.length));

    it("sends 1,200 rows in three requests and marks every row synced", async () => {
      expect(MAX_PUSH_ROWS).toBe(500);
      await dirtyRuns(1200);
      const fetchMock = acceptAll();
      vi.stubGlobal("fetch", fetchMock);

      const result = await pushUnsynced(database);

      const sent = bodies(fetchMock);
      expect(sent.map((b) => b.rows.length)).toEqual([500, 500, 200]);
      expect(sent.every((b) => b.table === "runs")).toBe(true);
      // Every row exactly once.
      const ids = sent.flatMap((b) => b.rows.map((r: { id: string }) => r.id));
      expect(new Set(ids).size).toBe(1200);
      expect(result).toMatchObject({ pushed: 1200, applied: 1200, skipped: 0, marked: 1200, errors: {} });
      expect(await runs().filter((r) => r.synced !== true).count()).toBe(0);
    });

    it("sends exactly MAX_PUSH_ROWS rows in one request", async () => {
      await dirtyRuns(MAX_PUSH_ROWS);
      const fetchMock = acceptAll();
      vi.stubGlobal("fetch", fetchMock);
      await pushUnsynced(database);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("a failed batch stops its table: earlier batches stay synced, the rest stays dirty for next time", async () => {
      await dirtyRuns(1200);
      await workouts().add(makeWorkout({ id: "w1", synced: false }));
      let runCalls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) => {
          const body = JSON.parse(init.body as string);
          if (body.table === "runs" && ++runCalls === 2) return reply({ error: "Server error" }, 500);
          return pushOk(body.rows.length);
        })
      );

      const result = await pushUnsynced(database);

      expect(runCalls).toBe(2);
      expect(result.errors).toEqual({ runs: "500 Server error" });
      expect(result.pushed).toBe(501);
      expect(await runs().filter((r) => r.synced === true).count()).toBe(500);
      expect(await runs().filter((r) => r.synced !== true).count()).toBe(700);
      expect((await workouts().get("w1")).synced).toBe(true);
    });

    it("keeps each request under MAX_PUSH_BYTES, so large rows never hit the platform's body limit", async () => {
      // 40 KB a row: 500 of them would be 20 MB, far over the 4.5 MB a function accepts.
      const note = "x".repeat(40_000);
      await runs().bulkAdd(
        Array.from({ length: 120 }, (_, i) => ({ id: `r${i}`, clientId: `c-r${i}`, synced: false, updatedAt: 1, note }))
      );
      const fetchMock = acceptAll();
      vi.stubGlobal("fetch", fetchMock);

      const result = await pushUnsynced(database);

      const sizes = fetchMock.mock.calls.map((call) => new TextEncoder().encode((call as unknown as Call)[1].body as string).length);
      expect(sizes.length).toBeGreaterThan(1);
      expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_PUSH_BYTES);
      expect(result).toMatchObject({ pushed: 120, marked: 120, errors: {} });
    });

    it("sends a single row larger than MAX_PUSH_BYTES on its own", async () => {
      await runs().bulkAdd([
        { id: "big", clientId: "c-big", synced: false, updatedAt: 1, note: "x".repeat(MAX_PUSH_BYTES) },
        { id: "small", clientId: "c-small", synced: false, updatedAt: 1 },
      ]);
      const fetchMock = acceptAll();
      vi.stubGlobal("fetch", fetchMock);
      await pushUnsynced(database);
      expect(bodies(fetchMock).map((b) => b.rows.map((r: { id: string }) => r.id))).toEqual([["big"], ["small"]]);
    });

    it("a 401 on a later batch still stops everything", async () => {
      await dirtyRuns(600);
      let calls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, init: RequestInit) =>
          ++calls === 2 ? reply({ error: "Unauthorized" }, 401) : pushOk(JSON.parse(init.body as string).rows.length)
        )
      );
      await expect(pushUnsynced(database)).rejects.toThrow(SYNC_UNAUTHORIZED);
      expect(await runs().filter((r) => r.synced !== true).count()).toBe(100);
    });
  });

  it("a row the server could not save stays dirty and is reported; the rest are synced", async () => {
    await runs().bulkAdd([
      { id: "r1", clientId: "c-r1", synced: false, updatedAt: 1 },
      { id: "r2", clientId: "c-r2", synced: false, updatedAt: 1 },
      { id: "r3", clientId: "c-r3", synced: false, updatedAt: 1 },
    ]);
    await workouts().add(makeWorkout({ id: "w1", synced: false }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = JSON.parse(init.body as string);
        return body.table === "runs"
          ? reply({ success: true, applied: 2, skipped: 0, failed: [1] })
          : pushOk(body.rows.length);
      })
    );

    const result = await pushUnsynced(database);

    expect((await runs().toArray()).map((r) => [r.id, r.synced])).toEqual([
      ["r1", true],
      ["r2", false],
      ["r3", true],
    ]);
    expect(result.errors).toEqual({ runs: "1 row could not be saved by the server" });
    expect(result.marked).toBe(3);
    expect((await workouts().get("w1")).synced).toBe(true);
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
    vi.stubGlobal("fetch", vi.fn(async (url: string) => pullReply(url, rows, errors)));

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

    it("stores settings a reader can use: a damaged set plan is dropped, a missing field defaulted", async () => {
      const settings: Partial<ReturnType<typeof makeProfile>["settings"]> = { ...makeProfile().settings };
      delete settings.equipment;
      const plan = {
        exerciseId: "squat",
        liftId: "squat",
        tier: "T1",
        sets: [{ weight: 185, reps: 3 }],
        planSets: [],
        createdAt: "2026-11-17T09:00:00.000Z",
      };
      stubPull({
        userProfile: [
          serverProfile({ updatedAt: 3, settings: { ...settings, nextSetPlans: { "squat|T1": plan, "bad|T1": { sets: 5 } } } }),
        ],
      });
      await pullFromServer(database);
      const [stored] = await profiles().toArray();
      // createdAt stays the ISO string it was saved as, though dates are revived elsewhere.
      expect(stored.settings.nextSetPlans).toEqual({ "squat|T1": plan });
      expect(stored.settings.equipment).toEqual(makeProfile().settings.equipment);
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

  it("reports a table the server could not read and still merges the rest", async () => {
    stubPull({ runs: [{ id: "r1", clientId: "c-r1", updatedAt: 1 }] }, { activities: "could not read" });
    const result = await pullFromServer(database);
    expect(result.errors).toEqual({ activities: "500 could not read" });
    expect(await runs().get("r1")).toBeDefined();
  });

  it("asks for each registry table by name", async () => {
    stubPull({});
    await pullFromServer(database);
    const urls = (vi.mocked(fetch).mock.calls as unknown as [string][]).map(([url]) => url);
    expect(urls).toEqual(SYNC_REGISTRY.map((def) => `/api/sync/pull?table=${def.name}`));
  });

  it("throws SYNC_UNAUTHORIZED on 401 and when the connection fails; a 500 is a table's error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({}, 401)));
    await expect(pullFromServer(database)).rejects.toThrow(SYNC_UNAUTHORIZED);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(pullFromServer(database)).rejects.toThrow("Failed to fetch");
    vi.stubGlobal("fetch", vi.fn(async () => reply({}, 500)));
    const result = await pullFromServer(database);
    expect(Object.keys(result.errors)).toEqual(SYNC_REGISTRY.map((def) => def.name));
    expect(result.errors.runs).toBe("500");
  });

  describe("pages", () => {
    const runOn = (i: number, notes = "") => ({ id: `r${i}`, clientId: `c-r${String(i).padStart(3, "0")}`, notes, updatedAt: 1 });
    let server: FakeSyncServer;

    beforeEach(() => {
      server = new FakeSyncServer();
      server.pageRows = 3;
      vi.stubGlobal("fetch", server.fetch);
    });

    const runPulls = () => server.requests.filter((r) => r.path === "/api/sync/pull" && r.table === "runs");

    it("pulls a table larger than one page completely, in several requests", async () => {
      for (let i = 0; i < 10; i += 1) server.store("runs", runOn(i), 100 + i);
      const result = await pullFromServer(database);
      expect(await runs().count()).toBe(10);
      expect(result.inserted).toBe(10);
      // Three full pages, then a last one with the tenth row.
      expect(runPulls()).toHaveLength(4);
      expect(runPulls()[0].cursor).toBeUndefined();
      expect(decodePullCursor(runPulls()[1].cursor)).toEqual({ stamp: 102, clientId: "c-r002" });
      expect(result.errors).toEqual({});
    });

    it("stops when a page ends the table, even after an exactly full one", async () => {
      for (let i = 0; i < 6; i += 1) server.store("runs", runOn(i), 100 + i);
      await pullFromServer(database);
      // Two full pages and an empty one that says the table is done.
      expect(runPulls()).toHaveLength(3);
      expect(await runs().count()).toBe(6);
    });

    it("after a complete pull, asks only for what the server wrote since shortly before it", async () => {
      server.clock = () => 1_000_000;
      for (let i = 0; i < 4; i += 1) server.store("runs", runOn(i), 1_000 + i);
      await pullFromServer(database);
      expect(loadPullState(database.name).runs).toEqual({ since: 1_000_000 - PULL_SINCE_OVERLAP_MS });

      // One new row and one edit, written after the first pull.
      server.store("runs", runOn(9), 1_000_500);
      server.store("runs", { ...runOn(0, "edited"), updatedAt: 2 }, 1_000_600);
      server.requests.length = 0;
      const result = await pullFromServer(database);

      expect(runPulls()[0].since).toBe(1_000_000 - PULL_SINCE_OVERLAP_MS);
      expect(result).toMatchObject({ inserted: 1, overwritten: 1, kept: 0 });
      expect((await runs().get("r0")).notes).toBe("edited");
      expect(await runs().count()).toBe(5);
    });

    it("an edit made offline long ago still arrives: since follows the server's write stamp", async () => {
      server.clock = () => 1_000_000;
      server.store("runs", runOn(0), 1_000);
      await pullFromServer(database);
      // Another device edited the row a week before and pushed it only now.
      server.store("runs", { ...runOn(0, "from the other device"), updatedAt: 5 }, 1_000_100);
      await pullFromServer(database);
      expect((await runs().get("r0")).notes).toBe("from the other device");
    });

    it("does not lose a row changed between pages", async () => {
      for (let i = 0; i < 7; i += 1) server.store("runs", runOn(i), 100 + i);
      let page = 0;
      server.onPull = (request) => {
        if (request.table !== "runs" || ++page !== 2) return;
        // Before page two: a row already read and a row not read yet both change.
        server.store("runs", { ...runOn(1, "changed after page one"), updatedAt: 5 }, 900);
        server.store("runs", { ...runOn(5, "changed before it was read"), updatedAt: 5 }, 901);
      };

      await pullFromServer(database);

      expect(await runs().count()).toBe(7);
      expect((await runs().get("r1")).notes).toBe("changed after page one");
      expect((await runs().get("r5")).notes).toBe("changed before it was read");
    });

    it("an interrupted pull resumes from the last page it merged", async () => {
      for (let i = 0; i < 8; i += 1) server.store("runs", runOn(i), 100 + i);
      let page = 0;
      const realFetch = server.fetch;
      vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input).includes("table=runs") && ++page === 2) throw new TypeError("Failed to fetch");
        return realFetch(input, init);
      });

      await expect(pullFromServer(database)).rejects.toThrow("Failed to fetch");
      expect(await runs().count()).toBe(3);
      expect(decodePullCursor(loadPullState(database.name).runs?.cursor)).toEqual({ stamp: 102, clientId: "c-r002" });

      server.requests.length = 0;
      await pullFromServer(database);
      expect(await runs().count()).toBe(8);
      // It went on from the third row, not from the start.
      expect(decodePullCursor(runPulls()[0].cursor)).toEqual({ stamp: 102, clientId: "c-r002" });
      expect(loadPullState(database.name).runs?.cursor).toBeUndefined();
    });

    it("a table emptied on this device is read in full again, whatever was recorded", async () => {
      server.clock = () => 1_000_000;
      for (let i = 0; i < 4; i += 1) server.store("runs", runOn(i), 1_000 + i);
      await pullFromServer(database);
      await runs().clear();
      server.requests.length = 0;
      await pullFromServer(database);
      expect(runPulls()[0].since).toBeUndefined();
      expect(await runs().count()).toBe(4);
    });

    it("forgets every table's progress when reset", async () => {
      server.store("runs", runOn(0), 100);
      await pullFromServer(database);
      expect(loadPullState(database.name).runs).toBeDefined();
      resetPullState(database.name);
      expect(loadPullState(database.name)).toEqual({});
    });

    it("stops a table whose server repeats the same page, without looping", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          const table = new URL(url, "http://fake.local").searchParams.get("table");
          if (table !== "runs") return reply({ table, rows: [], nextCursor: null, serverTime: 1 });
          return reply({ table, rows: [runOn(0)], nextCursor: "5:c-r000", serverTime: 1 });
        })
      );
      const result = await pullFromServer(database);
      expect(result.errors.runs).toMatch(/same page twice/);
      expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes("table=runs"))).toHaveLength(2);
    });

    it("a cursor the server refuses is dropped, so the next pull starts over", async () => {
      server.store("runs", runOn(0), 100);
      localStorage.setItem(`recomp-sync-pull:${database.name}`, JSON.stringify({ runs: { cursor: "not-a-cursor" } }));
      await runs().add({ id: "x", clientId: "x", updatedAt: 1 });
      const result = await pullFromServer(database);
      expect(result.errors.runs).toBe("400 bad cursor");
      expect(loadPullState(database.name).runs).toEqual({});
      await pullFromServer(database);
      expect(await runs().get("r0")).toBeDefined();
    });
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
    expect(server.requests.map((r) => r.path)).toEqual([
      "/api/sync/push",
      ...SYNC_REGISTRY.map(() => "/api/sync/pull"),
    ]);
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

    expect(result.errors).toEqual(["Push runs: 500 Boom", "Pull activities: 500 missing", "Rebuild: nope"]);
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
