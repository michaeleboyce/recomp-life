import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile, makeWorkout } from "@/lib/data/testUtils";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import { useInsights } from "./index";

const HOUR = 60 * 60 * 1000;

beforeEach(clearDb);

describe("useInsights", () => {
  it("is undefined while loading, then an empty list for an empty database", async () => {
    const r = renderHook(() => useInsights());
    expect(r.result.current).toBeUndefined();
    await waitFor(() => expect(r.result.current).toEqual([]));
  });

  it("includes an unfinished workout started in the last day, with a Resume action", async () => {
    await db.userProfile.put(makeProfile());
    await db.workouts.add(makeWorkout({ id: "w1", startedAt: new Date(Date.now() - HOUR) }));
    const r = renderHook(() => useInsights());
    await waitFor(() => expect(r.result.current).not.toBeUndefined());
    await waitFor(() =>
      expect(r.result.current!.map((i) => i.kind)).toContain("unfinished-workout")
    );
    const unfinished = r.result.current!.find((i) => i.kind === "unfinished-workout")!;
    expect(unfinished.action).toEqual({
      label: "Resume",
      href: "/workout/active?sessionId=w1",
    });
  });

  it("counts a made-up imported session as the last workout", async () => {
    const old = new Date();
    old.setDate(old.getDate() - 10);
    await db.workouts.add(makeWorkout({ id: "w1", startedAt: old, completedAt: old }));
    const r = renderHook(() => useInsights());
    await waitFor(() => expect(r.result.current?.map((i) => i.kind)).toContain("inactivity"));
    const recent = new Date();
    recent.setDate(recent.getDate() - 1);
    await db.importedSessions.put(importedSession([importedSet()], { startedAt: recent }));
    await waitFor(() => expect(r.result.current?.map((i) => i.kind)).not.toContain("inactivity"));
  });

  it("stays live: a new pain entry older than a week adds a pain check", async () => {
    const r = renderHook(() => useInsights());
    await waitFor(() => expect(r.result.current).toEqual([]));
    await db.painEntries.add({
      id: "p1",
      clientId: "c-p1",
      region: "lower_back",
      severity: 3,
      sensation: "pain",
      date: new Date(Date.now() - 9 * 24 * HOUR),
      synced: false,
    });
    await waitFor(() =>
      expect(r.result.current!.map((i) => i.id)).toContain("pain-check:p1")
    );
  });
});
