import { describe, expect, it } from "vitest";
import type { LiftAdjustment } from "@/types";
import { describeAdjustment, weightChangeRows } from "./adjustmentRows";

function adjustment(overrides: Partial<LiftAdjustment>): LiftAdjustment {
  return {
    id: "a1",
    clientId: "a1",
    exerciseId: "squat",
    at: new Date("2026-11-10T09:00:00Z"),
    source: "manual",
    set: {},
    updatedAt: 1,
    deletedAt: null,
    synced: false,
    ...overrides,
  };
}

describe("describeAdjustment", () => {
  it("names a manual change with the tier, weight and stage it set", () => {
    expect(
      describeAdjustment(adjustment({ set: { t1Weight: 205, t1Stage: "6x2" } }))
    ).toEqual({
      id: "a1",
      t: new Date("2026-11-10T09:00:00Z").getTime(),
      source: "Manual change",
      detail: "T1 205 lbs 6x2",
    });
    expect(describeAdjustment(adjustment({ set: { t2Weight: 137.5 } })).detail).toBe("T2 137.5 lbs");
    expect(describeAdjustment(adjustment({ set: { t2Stage: "3x8" } })).detail).toBe("T2 stage 3x8");
    expect(describeAdjustment(adjustment({ set: { t3Weight: 0 } })).detail).toBe("T3 0 lbs");
  });

  it("lists starting weights without a date and without the tiers the lift never uses", () => {
    const row = describeAdjustment(
      adjustment({
        id: "start:squat",
        source: "start",
        at: new Date(0),
        set: {
          t1Weight: 190,
          t1Stage: "5x3",
          t1FailCount: 0,
          t1LastResetWeight: null,
          t2Weight: 135,
          t2Stage: "3x10",
          t2FailCount: 0,
          t2LastResetWeight: null,
          t3Weight: 0,
        },
      })
    );
    expect(row).toEqual({
      id: "start:squat",
      t: null,
      source: "Starting weights",
      detail: "T1 190 lbs 5x3 · T2 135 lbs 3x10",
    });
  });

  it("names a time-off reduction and keeps a note", () => {
    expect(
      describeAdjustment(
        adjustment({ source: "decay", set: { t1Weight: 170, t2Weight: 120 }, note: "3 weeks off" })
      )
    ).toMatchObject({
      source: "Reduced after time off",
      detail: "T1 170 lbs · T2 120 lbs",
      note: "3 weeks off",
    });
  });

  it("says so when only progression counters were set", () => {
    expect(describeAdjustment(adjustment({ set: { t1FailCount: 0 } })).detail).toBe(
      "Progression counters only, no weight change"
    );
  });

  it("keeps the order it is given", () => {
    const rows = weightChangeRows([adjustment({ id: "new" }), adjustment({ id: "old" })]);
    expect(rows.map((r) => r.id)).toEqual(["new", "old"]);
  });
});
