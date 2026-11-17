import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { NextWorkoutInput, ResolvedNextWorkout } from "@/lib/workout/nextWorkout";

// The hook's one planning call, recorded on its way to the real function.
const calls = vi.hoisted(() => ({ inputs: [] as unknown[] }));
vi.mock("@/lib/workout/nextWorkout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workout/nextWorkout")>();
  return {
    ...actual,
    resolveNextWorkout: (input: NextWorkoutInput): ResolvedNextWorkout => {
      calls.inputs.push(input);
      return actual.resolveNextWorkout(input);
    },
  };
});

import { db } from "@/db/local";
import { strengthSetsOf } from "@/lib/workout/strength";
import { seedVariantState } from "@/lib/workout/variant";
import { useNextWorkout } from "./index";
import { clearDb, makeLiftState, makeProfile, makeWorkout } from "@/lib/data/testUtils";

const lastInput = () => calls.inputs.at(-1) as NextWorkoutInput;

beforeEach(async () => {
  await clearDb();
  calls.inputs = [];
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
    expect(calls.inputs).toHaveLength(0);
  });

  it("resolves the next workout from completed workouts, lift states, evidence and settings", async () => {
    const profile = await seed({ showWarmUps: false });
    const r = renderHook(() => useNextWorkout("home"));
    await waitFor(() => expect(r.result.current).toBeDefined());

    const input = lastInput();
    expect(input.completedWorkouts.map((w) => w.id)).toEqual(["done"]);
    expect(input.liftStates.map((l) => l.exerciseId)).toEqual(["squat"]);
    expect(input.variantStates).toEqual([]);
    // A first home exercise is seeded from the finished workouts' sets (H3).
    const done = (await db.workouts.get("done"))!;
    expect(input.strengthSets).toEqual(strengthSetsOf([done]));
    expect(input.settings).toEqual(profile.settings);
    expect(input.location).toBe("home");
    // Re-entry for the day's lifts (H6), the default.
    expect(input.reentry).toBeUndefined();
    expect(r.result.current!.templateId).toBe("B1");
    expect(r.result.current!.location).toBe("home");
  });

  it("plans from the stored home exercises' states", async () => {
    await seed();
    const split = {
      ...seedVariantState({ liftId: "squat", exerciseId: "bulgarian_split_squat", tier: "T1", liftState: undefined, equipment: makeProfile().settings.equipment }),
      current: true,
    };
    await db.variantStates.put(split);
    const r = renderHook(() => useNextWorkout("home"));
    await waitFor(() => expect(r.result.current).toBeDefined());
    expect(lastInput().variantStates).toEqual([split]);
  });

  it("defaults the location to the profile's default location", async () => {
    await seed({ defaultLocation: "home" });
    const r = renderHook(() => useNextWorkout());
    await waitFor(() => expect(r.result.current).toBeDefined());
    expect(r.result.current!.location).toBe("home");
  });

  it("defaults the location to gym when the profile has none", async () => {
    await seed({ defaultLocation: undefined });
    const r = renderHook(() => useNextWorkout());
    await waitFor(() => expect(r.result.current).toBeDefined());
    expect(r.result.current!.location).toBe("gym");
  });

  it("does not recompute on unrelated re-renders", async () => {
    await seed();
    const r = renderHook(() => useNextWorkout("gym"));
    await waitFor(() => expect(r.result.current).toBeDefined());
    const count = calls.inputs.length;
    r.rerender();
    r.rerender();
    expect(calls.inputs.length).toBe(count);
  });

  it("recomputes when the location changes", async () => {
    await seed();
    const r = renderHook(({ loc }) => useNextWorkout(loc), {
      initialProps: { loc: "gym" as "gym" | "home" },
    });
    await waitFor(() => expect(r.result.current).toBeDefined());
    r.rerender({ loc: "home" });
    await waitFor(() => expect(r.result.current!.location).toBe("home"));
    expect(lastInput().location).toBe("home");
  });
});
