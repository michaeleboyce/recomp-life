import { describe, expect, it } from "vitest";
import { startAdjustmentId } from "@/db/seed";
import type { StartingWeightSuggestion } from "@/lib/import/startingWeights";
import type { LiftAdjustment } from "@/types";
import {
  IMPORT_HISTORY_HREF,
  importedExerciseIds,
  startingWeightReason,
  startingWeightsAttention,
  unconfirmedStartingWeights,
} from "./startingWeightsModel";
import { reasonText } from "./todayModel";

// Made-up suggestions only.
function suggestion(over: Partial<StartingWeightSuggestion>): StartingWeightSuggestion {
  return {
    id: "db_row|T3|gym",
    liftId: "db_row",
    tier: "T3",
    location: "gym",
    exerciseId: "db_row",
    exerciseName: "Dumbbell Row",
    perHand: true,
    current: 35,
    suggested: 65,
    ...over,
  } as StartingWeightSuggestion;
}
const start = (over: Partial<LiftAdjustment>) =>
  ({ id: "confirmed-1", exerciseId: "db_row", source: "start", set: { t3Weight: 60 }, variant: null, deletedAt: null, ...over }) as LiftAdjustment;

describe("unconfirmedStartingWeights", () => {
  it("keeps a suggestion that differs from the plan and was never confirmed", () => {
    const row = suggestion({});
    expect(unconfirmedStartingWeights([row], [])).toEqual([row]);
  });

  it("drops one already planned at its weight, or confirmed at any weight for that lift, tier and exercise", () => {
    const row = suggestion({});
    expect(unconfirmedStartingWeights([suggestion({ current: 65 })], [])).toEqual([]);
    expect(unconfirmedStartingWeights([row], [start({})])).toEqual([]);
    // Another tier, a deleted one, a manual change or a home version's do not confirm it.
    expect(unconfirmedStartingWeights([row], [start({ set: { t1Weight: 60 } })])).toEqual([row]);
    expect(unconfirmedStartingWeights([row], [start({ deletedAt: 5 })])).toEqual([row]);
    expect(unconfirmedStartingWeights([row], [start({ source: "manual" })])).toEqual([row]);
    // Nor does the program's own default starting weight, which every device records.
    expect(unconfirmedStartingWeights([row], [start({ id: startAdjustmentId("db_row") })])).toEqual([row]);
    expect(unconfirmedStartingWeights([row], [start({ variant: { exerciseId: "db_row", tier: "T3" } })])).toEqual([row]);
    // A home suggestion is confirmed by its own exercise's starting weight.
    const home = suggestion({ id: "squat|T1|home", liftId: "squat", tier: "T1", location: "home", exerciseId: "goblet_squat" });
    expect(
      unconfirmedStartingWeights([home], [start({ exerciseId: "squat", set: { t1Weight: 50 }, variant: { exerciseId: "goblet_squat", tier: "T1" } })])
    ).toEqual([]);
  });
});

describe("startingWeightsAttention", () => {
  it("asks to confirm them in Import history while any waits, naming how many lifts", () => {
    expect(startingWeightsAttention([])).toBeNull();
    const item = startingWeightsAttention([suggestion({}), suggestion({ id: "x", exerciseName: "Barbell Squat" })])!;
    expect(item.title).toBe("Confirm your starting weights");
    expect(item.body).toMatch(/for 2 lifts/);
    expect(item.action).toEqual({ label: "Review", href: IMPORT_HISTORY_HREF });
  });
});

describe("startingWeightReason", () => {
  const entry = { exerciseId: "db_row", tier: "T3" as const };
  it("says the default weight and the history's suggestion while it waits for confirmation", () => {
    const reason = startingWeightReason(entry, { kind: "first" }, [suggestion({})], new Set(["db_row"]));
    expect(reasonText(reason)).toBe("Default starting weight. Your history suggests 65 a hand: confirm it in Import history");
  });

  it("never says First time for an exercise the imported history contains", () => {
    const reason = startingWeightReason(entry, { kind: "first" }, [], new Set(["db_row"]));
    expect(reasonText(reason)).toBe("First time in the app; it is in your imported history");
    expect(reasonText(startingWeightReason(entry, { kind: "first" }, [], new Set()))).toBe("First time");
  });

  it("leaves any other reason, and a suggestion for another place, alone", () => {
    expect(startingWeightReason(entry, { kind: "held", weight: 35 }, [suggestion({})], new Set())).toEqual({ kind: "held", weight: 35 });
    const home = { exerciseId: "db_row", substituteExerciseId: "db_row", tier: "T3" as const };
    expect(startingWeightReason(home, { kind: "first" }, [suggestion({})], new Set()).kind).toBe("first");
  });

  it("reads the exercises the imported history has", () => {
    expect([...importedExerciseIds([{ exerciseId: "a", imported: true }, { exerciseId: "b" }])]).toEqual(["a"]);
  });
});
