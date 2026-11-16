import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import { INITIAL_LIFT_STATES } from "@/db/seed";
import { EQUIPMENT } from "@/lib/workout/testFixtures";
import { seedVariantState } from "@/lib/workout/variant";
import { useVariantStates } from "./index";

beforeEach(clearDb);

const variant = (exerciseId: string, tier: "T1" | "T2" | "T3") =>
  seedVariantState({ liftId: "squat", exerciseId, tier, liftState: INITIAL_LIFT_STATES.squat, equipment: EQUIPMENT });

describe("useVariantStates", () => {
  it("is undefined while loading, then every variant state sorted by id, and stays live", async () => {
    const r = renderHook(() => useVariantStates());
    expect(r.result.current).toBeUndefined();
    await waitFor(() => expect(r.result.current).toEqual([]));

    await act(() =>
      db.variantStates.bulkPut([variant("goblet_squat", "T2"), variant("bulgarian_split_squat", "T1")])
    );
    await waitFor(() =>
      expect(r.result.current!.map((v) => v.id)).toEqual([
        "squat|bulgarian_split_squat|T1",
        "squat|goblet_squat|T2",
      ])
    );
  });
});
