import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb } from "@/lib/data/testUtils";
import { useTrainingLocation } from "./useTrainingLocation";
import { useUpcomingWorkouts } from "./useUpcomingWorkouts";

beforeEach(async () => {
  await clearDb();
  await initializeDatabase();
});

describe("useTrainingLocation", () => {
  it("defaults to the gym and saves a switch to settings", async () => {
    const { result } = renderHook(() => useTrainingLocation());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.location).toBe("gym");

    await act(() => result.current.setLocation("home"));
    await waitFor(() => expect(result.current.location).toBe("home"));
    const profile = await db.userProfile.toCollection().first();
    expect(profile?.settings.defaultLocation).toBe("home");
  });
});

describe("useUpcomingWorkouts", () => {
  it("projects five workouts from the seeded database", async () => {
    const { result } = renderHook(() => useUpcomingWorkouts("gym"));
    await waitFor(() => expect(result.current).toBeDefined());
    expect(result.current!.map((w) => w.templateId)).toEqual(["A1", "B1", "A2", "B2", "A1"]);
  });
});
