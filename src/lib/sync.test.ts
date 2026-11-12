import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db/local";
import { clearDb, makeSet, makeWorkout } from "@/lib/data/testUtils";
import { pushUnsynced } from "./sync";

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
