import { describe, expect, it } from "vitest";
import { makeSet } from "@/lib/data/testUtils";
import { getRule, type RuleId } from "@/lib/evidence";
import { makeOutcome } from "@/lib/progression";
import type { VariantOutcome, VariantPoint } from "@/types";
import { describeSessionOutcomes, describeVariantOutcome } from "./outcomes";

/** A planned rule is never shown: until it is active, the outcome's own rule is cited. */
const shown = (rule: RuleId, fallback: RuleId) => (getRule(rule).status === "planned" ? fallback : rule);

const point = (weight: number, over: Partial<VariantPoint> = {}): VariantPoint => ({
  exerciseId: "bulgarian_split_squat",
  weight,
  perHand: true,
  stage: "5x3",
  reps: 3,
  ...over,
});

const outcome = (over: Partial<VariantOutcome> = {}): VariantOutcome => ({
  variantId: "squat|bulgarian_split_squat|T1",
  liftId: "squat",
  exerciseId: "bulgarian_split_squat",
  tier: "T1",
  kind: "passed",
  from: point(70),
  to: point(75),
  ruleId: "gzclp-progression",
  ...over,
});

describe("describeVariantOutcome", () => {
  it("gives the home exercise's next weight as lifted, a hand where it is per hand", () => {
    expect(describeVariantOutcome(outcome())).toBe("passed: next 75 lbs a hand 5x3");
    expect(
      describeVariantOutcome(
        outcome({ exerciseId: "goblet_squat", from: point(50, { perHand: false }), to: point(55, { perHand: false }) })
      )
    ).toBe("passed: next 55 lbs 5x3");
  });

  it("names the stage moves and resets", () => {
    expect(describeVariantOutcome(outcome({ kind: "stageDown", to: point(70, { stage: "6x2", reps: 2 }) }))).toBe(
      "missed: moves to 6x2 at 70 lbs a hand"
    );
    expect(describeVariantOutcome(outcome({ kind: "reset", to: point(60) }))).toBe("missed: resets to 60 lbs a hand 5x3");
    expect(describeVariantOutcome(outcome({ kind: "held", to: point(70) }))).toBe("held: no change");
  });

  it("says what the cap policy did at the heaviest dumbbell", () => {
    expect(
      describeVariantOutcome(
        outcome({
          from: point(80),
          to: point(80, { reps: 4 }),
          cap: { policy: "reps", maxDumbbellWeight: 80, repsFrom: 3, repsTo: 4 },
        })
      )
    ).toBe("passed at your heaviest dumbbell (80): next 80 lbs a hand 5x4");
    expect(
      describeVariantOutcome(
        outcome({
          exerciseId: "goblet_squat",
          from: point(80, { exerciseId: "goblet_squat", perHand: false }),
          to: point(80, { exerciseId: "goblet_squat", perHand: false }),
          cap: {
            policy: "harderVariant",
            maxDumbbellWeight: 80,
            to: { variantId: "squat|bulgarian_split_squat|T1", exerciseId: "bulgarian_split_squat", weight: 40 },
          },
        })
      )
    ).toBe("passed at your heaviest dumbbell (80): next Bulgarian split squat at 40 lbs a hand");
  });
});

describe("describeSessionOutcomes", () => {
  const liftOutcome = makeOutcome("squat", "T1", "held", { weight: 245, stage: "5x3" });
  const bench = makeOutcome("bench", "T2", "passed", { weight: 100, stage: "3x10" }, { weight: 105, stage: "3x10" });
  const sets = [makeSet({ exerciseId: "squat", tier: "T1", substituteExerciseId: "bulgarian_split_squat", isSubstituted: true })];

  it("at home puts the home exercise's outcome in its lift's place", () => {
    const rows = describeSessionOutcomes({ sets, location: "home" }, [liftOutcome, bench], [outcome()]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      key: "squat:T1",
      name: "Bulgarian split squat",
      tier: "T1",
      text: "passed: next 75 lbs a hand 5x3",
      from: 70,
      to: 75,
      ruleId: shown("home-progression", "gzclp-progression"),
      raised: true,
    });
    // A lift with no home exercise of its own keeps its own outcome.
    expect(rows[1]).toMatchObject({ key: "bench:T2", name: "Bench Press", text: "passed: next 105 lbs 3x10", ruleId: "gzclp-progression" });
  });

  it("at the gym, every lift's own outcome", () => {
    const rows = describeSessionOutcomes({ sets: [], location: "gym" }, [liftOutcome], []);
    expect(rows).toEqual([
      expect.objectContaining({ key: "squat:T1", name: "Squat", text: "held: no change", from: 245, to: 245 }),
    ]);
  });

  it("cites the cap rule when the cap policy acted (once the rule is active)", () => {
    const capped = outcome({
      from: point(80),
      to: point(80, { reps: 4 }),
      cap: { policy: "reps", maxDumbbellWeight: 80, repsFrom: 3, repsTo: 4 },
    });
    const [row] = describeSessionOutcomes({ sets, location: "home" }, [liftOutcome], [capped]);
    expect(row.ruleId).toBe(shown("cap-progression", "gzclp-progression"));
  });
});
