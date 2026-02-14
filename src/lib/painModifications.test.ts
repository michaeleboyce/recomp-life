import { describe, it, expect } from "vitest";
import {
  generateModifications,
  shouldShowRedFlag,
  formatRegion,
} from "./painModifications";
import { EXERCISES } from "./exercises";
import type { PainSorenessEntry, Exercise } from "@/types";

// Helper to create a pain entry
function makePainEntry(
  overrides: Partial<PainSorenessEntry> = {}
): PainSorenessEntry {
  return {
    id: "test-pain-1",
    date: new Date(),
    region: "lower_back",
    sensation: "pain",
    severity: 3,
    ...overrides,
  } as PainSorenessEntry;
}

// Helper to create an exercise entry for workout plan
function makeExerciseEntry(
  exerciseId: string,
  weight: number,
  tier: string = "T1"
) {
  return {
    exercise: EXERCISES[exerciseId],
    weight,
    tier,
  };
}

describe("generateModifications", () => {
  it("lower back pain severity 3 reduces squat/DL by 20%", () => {
    const painEntries = [makePainEntry({ region: "lower_back", severity: 3 })];
    const exercises = [
      makeExerciseEntry("squat", 200, "T1"),
      makeExerciseEntry("deadlift", 300, "T2"),
    ];

    const mods = generateModifications(painEntries, exercises);

    expect(mods).toHaveLength(2);

    const squatMod = mods.find((m) => m.exerciseId === "squat");
    expect(squatMod).toBeDefined();
    expect(squatMod!.action).toBe("reduce_weight");
    expect(squatMod!.modifiedWeight).toBe(160); // 200 * 0.8 = 160
    expect(squatMod!.originalWeight).toBe(200);

    const dlMod = mods.find((m) => m.exerciseId === "deadlift");
    expect(dlMod).toBeDefined();
    expect(dlMod!.action).toBe("reduce_weight");
    expect(dlMod!.modifiedWeight).toBe(240); // 300 * 0.8 = 240
    expect(dlMod!.originalWeight).toBe(300);
  });

  it("soreness entries generate zero modifications", () => {
    const painEntries = [
      makePainEntry({ sensation: "soreness", severity: 3 }),
    ];
    const exercises = [makeExerciseEntry("squat", 200, "T1")];

    const mods = generateModifications(painEntries, exercises);
    expect(mods).toHaveLength(0);
  });

  it("severity 1 generates zero modifications (informational only)", () => {
    const painEntries = [makePainEntry({ severity: 1 })];
    const exercises = [makeExerciseEntry("squat", 200, "T1")];

    const mods = generateModifications(painEntries, exercises);
    expect(mods).toHaveLength(0);
  });

  it("severity 2 reduces weight by 10%", () => {
    const painEntries = [makePainEntry({ region: "lower_back", severity: 2 })];
    const exercises = [makeExerciseEntry("squat", 200, "T1")];

    const mods = generateModifications(painEntries, exercises);
    expect(mods).toHaveLength(1);
    expect(mods[0].action).toBe("reduce_weight");
    expect(mods[0].modifiedWeight).toBe(180); // 200 * 0.9 = 180
  });

  it("severity 4 skips T1 exercises, reduces others by 50%", () => {
    const painEntries = [makePainEntry({ region: "lower_back", severity: 4 })];
    const exercises = [
      makeExerciseEntry("squat", 200, "T1"),
      makeExerciseEntry("deadlift", 300, "T2"),
    ];

    const mods = generateModifications(painEntries, exercises);
    expect(mods).toHaveLength(2);

    const squatMod = mods.find((m) => m.exerciseId === "squat");
    expect(squatMod!.action).toBe("skip");
    expect(squatMod!.modifiedWeight).toBe(0);

    const dlMod = mods.find((m) => m.exerciseId === "deadlift");
    expect(dlMod!.action).toBe("reduce_weight");
    expect(dlMod!.modifiedWeight).toBe(150); // 300 * 0.5 = 150
  });

  it("severity 5 skips all affected exercises", () => {
    const painEntries = [makePainEntry({ region: "lower_back", severity: 5 })];
    const exercises = [
      makeExerciseEntry("squat", 200, "T1"),
      makeExerciseEntry("deadlift", 300, "T2"),
      makeExerciseEntry("ohp", 100, "T1"),
    ];

    const mods = generateModifications(painEntries, exercises);
    // squat, deadlift, and ohp are all sensitive to lower_back
    expect(mods).toHaveLength(3);
    for (const mod of mods) {
      expect(mod.action).toBe("skip");
      expect(mod.modifiedWeight).toBe(0);
    }
  });

  it("pain skips use correct action types", () => {
    const painEntries = [makePainEntry({ region: "lower_back", severity: 5 })];
    const exercises = [makeExerciseEntry("squat", 200, "T1")];

    const mods = generateModifications(painEntries, exercises);
    expect(mods).toHaveLength(1);
    expect(mods[0].action).toBe("skip");
    expect(mods[0].source).toBe("pain");
    expect(mods[0].userAccepted).toBe(false);
  });

  it("exercises without matching painSensitiveRegions are unaffected", () => {
    const painEntries = [makePainEntry({ region: "lower_back", severity: 5 })];
    // bench press is not sensitive to lower_back
    const exercises = [makeExerciseEntry("bench", 185, "T1")];

    const mods = generateModifications(painEntries, exercises);
    expect(mods).toHaveLength(0);
  });

  it("rounds modified weight to nearest 5", () => {
    // 137 * 0.9 = 123.3 → should round to 125
    const painEntries = [
      makePainEntry({ region: "left_shoulder", severity: 2 }),
    ];
    const exercises = [makeExerciseEntry("bench", 137, "T1")];

    const mods = generateModifications(painEntries, exercises);
    expect(mods).toHaveLength(1);
    expect(mods[0].modifiedWeight).toBe(125); // 137 * 0.9 = 123.3 → 125
  });

  it("lower back pain severity 3 suggests substitutions for squat", () => {
    const painEntries = [makePainEntry({ region: "lower_back", severity: 3 })];
    const exercises = [makeExerciseEntry("squat", 200, "T1")];

    const mods = generateModifications(painEntries, exercises);
    expect(mods).toHaveLength(1);
    const squatMod = mods[0];
    expect(squatMod.substitutionSuggestions).toBeDefined();
    expect(squatMod.substitutionSuggestions).toContain("goblet_squat");
    expect(squatMod.substitutionSuggestions).toContain("box_squat");
  });

  it("lower back pain severity 3 suggests DB RDL for deadlift", () => {
    const painEntries = [makePainEntry({ region: "lower_back", severity: 3 })];
    const exercises = [makeExerciseEntry("deadlift", 300, "T2")];

    const mods = generateModifications(painEntries, exercises);
    expect(mods).toHaveLength(1);
    expect(mods[0].substitutionSuggestions).toContain("db_rdl");
  });

  it("lower back pain severity 3 suggests seated DB press for OHP", () => {
    const painEntries = [makePainEntry({ region: "lower_back", severity: 3 })];
    const exercises = [makeExerciseEntry("ohp", 100, "T1")];

    const mods = generateModifications(painEntries, exercises);
    expect(mods).toHaveLength(1);
    expect(mods[0].substitutionSuggestions).toContain("db_shoulder_press");
  });
});

describe("shouldShowRedFlag", () => {
  it("shows red flag at severity 5", () => {
    const result = shouldShowRedFlag(5, "lower_back", []);
    expect(result).toBe(true);
  });

  it("shows red flag at severity 4 first time for region", () => {
    const result = shouldShowRedFlag(4, "lower_back", []);
    expect(result).toBe(true);
  });

  it("does not show red flag at severity 4 if dismissed within 30 days", () => {
    const recentFlags = [
      {
        region: "lower_back" as const,
        dismissedAt: new Date(), // just dismissed
      },
    ];
    const result = shouldShowRedFlag(4, "lower_back", recentFlags);
    expect(result).toBe(false);
  });

  it("shows red flag at severity 4 if dismissed more than 30 days ago", () => {
    const thirtyOneDaysAgo = new Date();
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31);
    const recentFlags = [
      {
        region: "lower_back" as const,
        dismissedAt: thirtyOneDaysAgo,
      },
    ];
    const result = shouldShowRedFlag(4, "lower_back", recentFlags);
    expect(result).toBe(true);
  });

  it("does not show red flag at severity 3 or below", () => {
    expect(shouldShowRedFlag(3, "lower_back", [])).toBe(false);
    expect(shouldShowRedFlag(2, "lower_back", [])).toBe(false);
    expect(shouldShowRedFlag(1, "lower_back", [])).toBe(false);
  });

  it("severity 5 always shows red flag even if recently dismissed", () => {
    const recentFlags = [
      {
        region: "lower_back" as const,
        dismissedAt: new Date(), // just dismissed
      },
    ];
    const result = shouldShowRedFlag(5, "lower_back", recentFlags);
    expect(result).toBe(true);
  });

  it("severity 4 dismissal for one region does not affect another", () => {
    const recentFlags = [
      {
        region: "left_shoulder" as const,
        dismissedAt: new Date(),
      },
    ];
    const result = shouldShowRedFlag(4, "lower_back", recentFlags);
    expect(result).toBe(true);
  });
});

describe("formatRegion", () => {
  it('converts "lower_back" to "Lower Back"', () => {
    expect(formatRegion("lower_back")).toBe("Lower Back");
  });

  it('converts "left_shoulder" to "Left Shoulder"', () => {
    expect(formatRegion("left_shoulder")).toBe("Left Shoulder");
  });

  it('converts "neck" to "Neck"', () => {
    expect(formatRegion("neck")).toBe("Neck");
  });

  it('converts "core" to "Core"', () => {
    expect(formatRegion("core")).toBe("Core");
  });

  it('converts "left_knee" to "Left Knee"', () => {
    expect(formatRegion("left_knee")).toBe("Left Knee");
  });
});
