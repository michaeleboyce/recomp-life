import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/local";
import { clearDb, makeProfile, makeSet, makeWorkout } from "@/lib/data/testUtils";
import { pullFromServer, pushUnsynced } from "./sync";

describe("pushUnsynced", () => {
  beforeEach(async () => {
    await clearDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pushes rows stored with synced: false and marks them synced", async () => {
    // Every writer in the app stores the boolean `false`. Booleans are not valid
    // IndexedDB keys, so these rows never appear in the `synced` index.
    await db.workouts.add(makeWorkout({ id: "w1", synced: false }));
    await db.sets.add(makeSet({ id: "s1", synced: false }));
    await db.sets.add(makeSet({ id: "s2", synced: true }));

    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const pushed = await pushUnsynced();

    expect(pushed).toBe(2);
    const bodies = fetchMock.mock.calls.map(
      (call) => JSON.parse((call as unknown as [string, RequestInit])[1].body as string)
    );
    expect(bodies.find((b) => b.table === "workouts").rows.map((r: { id: string }) => r.id)).toEqual(["w1"]);
    expect(bodies.find((b) => b.table === "sets").rows.map((r: { id: string }) => r.id)).toEqual(["s1"]);
    expect((await db.workouts.get("w1"))?.synced).toBe(true);
    expect((await db.sets.get("s1"))?.synced).toBe(true);
  });

  it("makes no request when everything is already synced", async () => {
    await db.sets.add(makeSet({ id: "s1", synced: true }));
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    expect(await pushUnsynced()).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("pullFromServer", () => {
  beforeEach(async () => {
    await clearDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores pulled timestamps as Date objects, including those nested in a workout's sets", async () => {
    const pulled = {
      ...makeWorkout({ id: "w9", clientId: "c-w9" }),
      startedAt: "2026-11-10T09:00:00.000Z",
      completedAt: "2026-11-10T09:45:00.000Z",
      sets: [{ ...makeSet({ id: "s9" }), completedAt: "2026-11-10T09:10:00.000Z" }],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ workouts: [pulled] }), { status: 200 }))
    );

    expect(await pullFromServer()).toBe(1);

    const stored = await db.workouts.get("w9");
    expect(stored?.startedAt).toBeInstanceOf(Date);
    expect(stored?.completedAt).toBeInstanceOf(Date);
    expect(stored?.sets[0].completedAt).toBeInstanceOf(Date);
    expect(stored?.startedAt.toISOString()).toBe("2026-11-10T09:00:00.000Z");
    expect(stored?.synced).toBe(true);
  });

  it("leaves ordinary strings alone", async () => {
    const pulled = { ...makeWorkout({ id: "w8", clientId: "c-w8", templateId: "A1" }) };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ workouts: [pulled] }), { status: 200 }))
    );
    await pullFromServer();
    expect((await db.workouts.get("w8"))?.templateId).toBe("A1");
  });
});

describe("pullFromServer: the profile is a single row", () => {
  beforeEach(async () => {
    await clearDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const stubPull = (data: Record<string, unknown[]>) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(data), { status: 200 }))
    );

  it("does not add another device's profile next to the local one", async () => {
    const mine = makeProfile();
    await db.userProfile.put(mine);
    stubPull({
      userProfile: [{ ...makeProfile(), id: "other-id", clientId: "other-client", name: "Other device" }],
    });

    expect(await pullFromServer()).toBe(0);

    expect(await db.userProfile.toArray()).toEqual([mine]);
  });

  it("takes one profile from the server when there is none locally, and only one", async () => {
    stubPull({
      userProfile: [
        { ...makeProfile(), id: "p-a", clientId: "c-a", name: "A", createdAt: "2026-11-01T08:00:00.000Z" },
        { ...makeProfile(), id: "p-b", clientId: "c-b", name: "B", createdAt: "2026-11-02T08:00:00.000Z" },
      ],
    });

    expect(await pullFromServer()).toBe(1);

    const profiles = await db.userProfile.toArray();
    expect(profiles.map((p) => p.id)).toEqual(["p-a"]);
    expect(profiles[0].createdAt).toBeInstanceOf(Date);
    expect(profiles[0].synced).toBe(true);
  });

  it("still pulls other tables in the same response", async () => {
    await db.userProfile.put(makeProfile());
    stubPull({
      userProfile: [{ ...makeProfile(), id: "other-id", clientId: "other-client" }],
      workouts: [makeWorkout({ id: "w7", clientId: "c-w7" })],
    });

    expect(await pullFromServer()).toBe(1);
    expect(await db.workouts.get("w7")).toBeDefined();
    expect(await db.userProfile.count()).toBe(1);
  });
});
