import { describe, it, expect } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { EXERCISES } from "@/lib/exercises";
import { applyPlanEdits } from "@/lib/workout/planEdits";
import { makeEntry } from "@/lib/workout/testFixtures";
import {
  SWAP_PAIR_OVERLAP_PENALTY,
  SWAP_SET_LIMIT,
  recommendSwapSets,
  singleCovers,
  swapEdits,
} from "./combos";
import { recommendSwaps, type SwapContext } from "./recommend";

const NOW = new Date(2026, 10, 18, 9, 0, 0);
const ctx = (overrides: Partial<SwapContext> = {}): SwapContext => ({
  location: "gym",
  equipment: DEFAULT_USER_PROFILE.settings.equipment,
  slot: { tier: "T2", sets: 3, reps: 10, isAMRAP: true, weight: 185 },
  now: NOW,
  ...overrides,
});

describe("recommendSwapSets", () => {
  it("offers pairs that together cover every main muscle when no single exercise does", () => {
    // Only the deadlift itself has the low back as a main muscle, besides back extensions.
    const singles = recommendSwaps("deadlift", ctx());
    expect(singleCovers(singles)).toBe(false);
    const sets = recommendSwapSets("deadlift", ctx());
    expect(sets.length).toBeGreaterThan(0);
    expect(sets.length).toBeLessThanOrEqual(SWAP_SET_LIMIT);
    for (const set of sets) {
      const covered = new Set(set.members.flatMap((m) => m.covers));
      expect(EXERCISES.deadlift.primaryMuscles.every((m) => covered.has(m))).toBe(true);
      // Each member brings a main muscle the other does not.
      const [a, b] = set.members;
      expect(a.covers.some((m) => !b.covers.includes(m))).toBe(true);
      expect(b.covers.some((m) => !a.covers.includes(m))).toBe(true);
      expect(a.covers).toEqual(a.candidate.coverage.primary);
      expect(set.score).toBeCloseTo(
        a.candidate.score + b.candidate.score - SWAP_PAIR_OVERLAP_PENALTY * set.overlap.length,
        6
      );
      expect(a.candidate.score).toBeGreaterThanOrEqual(b.candidate.score);
    }
    expect(sets.flatMap((s) => s.members.map((m) => m.candidate.exerciseId))).toContain("back_extensions");
  });

  it("is ranked by combined score, and stable", () => {
    const sets = recommendSwapSets("deadlift", ctx());
    for (let i = 1; i < sets.length; i++) expect(sets[i - 1].score).toBeGreaterThanOrEqual(sets[i].score);
    expect(recommendSwapSets("deadlift", ctx())).toEqual(sets);
  });

  it("offers none when a single exercise covers everything, unless asked", () => {
    expect(recommendSwapSets("bench", ctx())).toEqual([]);
    const asked = recommendSwapSets("bench", ctx(), { force: true });
    expect(asked.length).toBe(SWAP_SET_LIMIT);
    // Both cover chest: the overlap is penalised.
    expect(asked[0].overlap).toEqual(["chest"]);
  });

  it("offers none when nothing covers a main muscle (no low back work at home)", () => {
    expect(recommendSwapSets("deadlift", ctx({ location: "home" }))).toEqual([]);
  });

  it("never pairs a blocked exercise", () => {
    const sets = recommendSwapSets("deadlift", ctx({ preferences: { back_extensions: "blocked" } }));
    expect(sets).toEqual([]);
  });
});

describe("swapEdits", () => {
  const prescription = (weight: number, sets = 3, reps = 10) => ({
    weight,
    sets,
    reps,
    isAMRAP: true,
    basis: "history" as const,
    note: "",
  });

  it("is a swap for the first replacement and an add for each further one", () => {
    const edits = swapEdits("bench", "T2", [
      { exerciseId: "db_bench", prescription: prescription(55) },
      { exerciseId: "tricep_pushdowns", prescription: prescription(40, 3, 15) },
    ]);
    expect(edits).toEqual([
      { kind: "swap", exerciseId: "bench", tier: "T2", replacementId: "db_bench" },
      { kind: "weight", exerciseId: "db_bench", tier: "T2", weight: 55 },
      { kind: "add", exerciseId: "tricep_pushdowns", sets: 3, reps: 15, weight: 40, isAMRAP: true },
    ]);
    expect(edits.filter((e) => e.kind === "swap")).toHaveLength(1);
    expect(edits.filter((e) => e.kind === "add")).toHaveLength(1);
  });

  it("puts the replacements in the plan at their prescriptions", () => {
    const plan = [
      makeEntry({ exerciseId: "squat", tier: "T1" }),
      makeEntry({ exerciseId: "bench", tier: "T2", targetSets: 3, targetReps: 10, weight: 135 }),
    ];
    const next = applyPlanEdits(
      plan,
      swapEdits("bench", "T2", [
        { exerciseId: "db_bench", prescription: prescription(55) },
        { exerciseId: "tricep_pushdowns", prescription: prescription(40, 3, 15) },
      ])
    );
    expect(next.map((e) => [e.exerciseId, e.tier, e.targetSets, e.targetReps, e.weight])).toEqual([
      ["squat", "T1", 5, 3, 190],
      ["db_bench", "T2", 3, 10, 55],
      ["tricep_pushdowns", "accessory", 3, 15, 40],
    ]);
  });

  it("an accessory entry takes the replacement's own scheme; no weight edit when the default is right", () => {
    const edits = swapEdits("face_pulls", "accessory", [
      { exerciseId: "reverse_fly", prescription: prescription(12, 3, 20) },
    ]);
    expect(edits).toEqual([
      { kind: "swap", exerciseId: "face_pulls", tier: "accessory", replacementId: "reverse_fly" },
      { kind: "scheme", exerciseId: "reverse_fly", tier: "accessory", sets: 3, reps: 20 },
    ]);
  });

  it("is empty with no replacement", () => {
    expect(swapEdits("bench", "T2", [])).toEqual([]);
  });
});
