import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { NextWorkoutDescription } from "@/lib/workout/types";

const describeNextWorkout = vi.fn();
vi.mock("@/lib/workout/buildPlan", () => ({
  describeNextWorkout: (input: unknown) => describeNextWorkout(input),
}));

import { db } from "@/db/local";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { useNextWorkout } from "./index";
import { clearDb, makeLiftState, makeProfile, makeWorkout } from "@/lib/data/testUtils";

const DESCRIPTION = { templateId: "B1", template: {}, plan: [] } as unknown as NextWorkoutDescription;

beforeEach(async () => {
  await clearDb();
  describeNextWorkout.mockReset();
  describeNextWorkout.mockReturnValue(DESCRIPTION);
});

async function seed(settingsPatch: Record<string, unknown> = {}) {
  const profile = makeProfile();
  profile.settings = { ...profile.settings, ...settingsPatch };
  await db.userProfile.put(profile);
  await db.liftStates.put(makeLiftState({ exerciseId: "squat" }));
  await db.workouts.bulkPut([
    makeWorkout({ id: "done", templateId: "A1", completedAt: new Date("2026-11-10") }),
    makeWorkout({ id: "open", templateId: "B1", completedAt: null }),
  ]);
  return profile;
}

describe("useNextWorkout", () => {
  it("is undefined while its inputs load", () => {
    const r = renderHook(() => useNextWorkout());
    expect(r.result.current).toBeUndefined();
    expect(describeNextWorkout).not.toHaveBeenCalled();
  });

  it("describes the next workout from completed workouts, lift states and settings", async () => {
    const profile = await seed({ showWarmUps: false });
    const r = renderHook(() => useNextWorkout("home"));
    await waitFor(() => expect(r.result.current).toBe(DESCRIPTION));

    const input = describeNextWorkout.mock.calls.at(-1)![0];
    expect(input.templates).toBe(WORKOUT_TEMPLATES);
    expect(input.completedWorkouts.map((w: { id: string }) => w.id)).toEqual(["done"]);
    expect(input.liftStates.map((l: { exerciseId: string }) => l.exerciseId)).toEqual(["squat"]);
    expect(input.plan).toEqual({
      location: "home",
      equipment: profile.settings.equipment,
      includeWarmUps: false,
      selectedAccessories: [],
    });
  });

  it("defaults the location to the profile's default location", async () => {
    await seed({ defaultLocation: "home" });
    const r = renderHook(() => useNextWorkout());
    await waitFor(() => expect(r.result.current).toBe(DESCRIPTION));
    expect(describeNextWorkout.mock.calls.at(-1)![0].plan.location).toBe("home");
  });

  it("defaults the location to gym when the profile has none", async () => {
    await seed({ defaultLocation: undefined });
    const r = renderHook(() => useNextWorkout());
    await waitFor(() => expect(r.result.current).toBe(DESCRIPTION));
    expect(describeNextWorkout.mock.calls.at(-1)![0].plan.location).toBe("gym");
  });

  it("does not recompute on unrelated re-renders", async () => {
    await seed();
    const r = renderHook(() => useNextWorkout("gym"));
    await waitFor(() => expect(r.result.current).toBe(DESCRIPTION));
    const calls = describeNextWorkout.mock.calls.length;
    r.rerender();
    r.rerender();
    expect(describeNextWorkout.mock.calls.length).toBe(calls);
  });

  it("recomputes when the location changes", async () => {
    await seed();
    const r = renderHook(({ loc }) => useNextWorkout(loc), {
      initialProps: { loc: "gym" as "gym" | "home" },
    });
    await waitFor(() => expect(r.result.current).toBe(DESCRIPTION));
    r.rerender({ loc: "home" });
    await waitFor(() =>
      expect(describeNextWorkout.mock.calls.at(-1)![0].plan.location).toBe("home")
    );
  });
});
