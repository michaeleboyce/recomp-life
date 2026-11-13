import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { previousWeek, weekOf } from "@/lib/review";
import { WEEKLY_SESSION_TARGET } from "@/components/Today/GlanceTiles";
import { useWeeklyReview } from "./index";

beforeEach(clearDb);

describe("useWeeklyReview", () => {
  it("is undefined while loading, then the last completed week of an empty database", async () => {
    const r = renderHook(() => useWeeklyReview());
    expect(r.result.current).toBeUndefined();
    await waitFor(() => expect(r.result.current).not.toBeUndefined());
    const { review, thisWeek, lastWeek, weeks } = r.result.current!;
    expect(thisWeek).toEqual(weekOf(new Date()));
    expect(lastWeek).toEqual(previousWeek(thisWeek));
    expect(review.weekStart).toEqual(lastWeek);
    expect(review.isEmpty).toBe(true);
    expect(weeks).toEqual([thisWeek]);
  });

  it("reviews demo data for the chosen week against Today's target", async () => {
    const demo = generateDemoData(new Date());
    await db.workouts.bulkPut(demo.workouts);
    await db.estimated1RMs.bulkPut(demo.estimated1RMs);
    await db.bodyweight.bulkPut(demo.bodyweight);
    await db.userProfile.put(makeProfile());
    const week = previousWeek(previousWeek(weekOf(new Date())));
    const r = renderHook(() => useWeeklyReview(week));
    await waitFor(() => expect(r.result.current?.review.isEmpty).toBe(false));
    const { review } = r.result.current!;
    expect(review.weekStart).toEqual(week);
    expect(review.sessions.target).toBe(WEEKLY_SESSION_TARGET);
    expect(review.sessions.count).toBeGreaterThan(0);
  });
});
