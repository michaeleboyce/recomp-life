import { describe, it, expect } from "vitest";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { EXERCISES } from "@/lib/exercises";
import { importedStrengthSets } from "@/lib/import/evidence";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import type { StrengthSet } from "@/lib/strength";
import {
  SWAP_HISTORY_WEIGHT,
  SWAP_KNOWN_WEIGHT_POINTS,
  SWAP_PAIN_PENALTY,
  SWAP_PREFERRED_POINTS,
  SWAP_PRIMARY_WEIGHT,
  SWAP_RECOVERY_PENALTY,
  SWAP_SAME_MOVEMENT_POINTS,
  SWAP_SCORE_PART_IDS,
  SWAP_SECONDARY_WEIGHT,
  SWAP_TIER_FIT_POINTS,
  recommendSwaps,
  type SwapCandidate,
  type SwapContext,
} from "./recommend";

const EQUIPMENT = DEFAULT_USER_PROFILE.settings.equipment;
const NOW = new Date(2026, 10, 18, 9, 0, 0);

function daysBefore(days: number, hour = 9): Date {
  const d = new Date(NOW);
  d.setDate(d.getDate() - days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

let n = 0;
/** A made-up working set. */
function set(exerciseId: string, date: Date, overrides: Partial<StrengthSet> = {}): StrengthSet {
  n += 1;
  return {
    id: `s${n}`,
    sessionId: `w-${exerciseId}-${date.getTime()}`,
    exerciseId,
    weight: 50,
    perHand: EXERCISES[exerciseId]?.grip === "per_hand",
    reps: 10,
    repsInReserve: null,
    role: "working",
    tier: "accessory",
    isAMRAP: false,
    date,
    ...overrides,
  };
}

const T2_BENCH = { tier: "T2" as const, sets: 3, reps: 10, isAMRAP: true, weight: 135 };

function ctx(overrides: Partial<SwapContext> = {}): SwapContext {
  return { location: "gym", equipment: EQUIPMENT, slot: T2_BENCH, now: NOW, ...overrides };
}

const find = (list: SwapCandidate[], id: string) => {
  const found = list.find((c) => c.exerciseId === id);
  if (!found) throw new Error(`${id} not offered`);
  return found;
};
const points = (c: SwapCandidate, id: string) => c.parts.find((p) => p.id === id)!.points;

describe("recommendSwaps: score parts", () => {
  it("primary: full when every main muscle is covered, in proportion otherwise", () => {
    const list = recommendSwaps("squat", ctx({ slot: { ...T2_BENCH, tier: "T1", sets: 5, reps: 3 } }));
    expect(points(find(list, "leg_press"), "primary")).toBe(SWAP_PRIMARY_WEIGHT);
    expect(points(find(list, "leg_extensions"), "primary")).toBe(SWAP_PRIMARY_WEIGHT / 2);
    expect(find(list, "leg_extensions").coverage).toEqual({
      primary: ["quads"],
      missingPrimary: ["glutes"],
      secondary: [],
    });
  });

  it("secondary: full when every helper muscle is worked", () => {
    const list = recommendSwaps("bench", ctx());
    expect(points(find(list, "incline_db_press"), "secondary")).toBe(SWAP_SECONDARY_WEIGHT);
    expect(points(find(list, "incline_db_fly"), "secondary")).toBe(SWAP_SECONDARY_WEIGHT / 2);
  });

  it("movement: the same lift scores most, a compound fits a T2, an isolation does not", () => {
    const list = recommendSwaps("bench", ctx());
    expect(points(find(list, "db_bench"), "movement")).toBe(SWAP_SAME_MOVEMENT_POINTS);
    expect(points(find(list, "db_floor_press"), "movement")).toBe(SWAP_SAME_MOVEMENT_POINTS);
    expect(points(find(list, "incline_db_press"), "movement")).toBe(SWAP_TIER_FIT_POINTS);
    expect(points(find(list, "incline_db_fly"), "movement")).toBe(0);
    // Any candidate fits an accessory slot.
    const accessory = recommendSwaps("bench", ctx({ slot: undefined }));
    expect(points(find(accessory, "incline_db_fly"), "movement")).toBe(SWAP_TIER_FIT_POINTS);
  });

  it("preferred: overall or at this location", () => {
    const overall = recommendSwaps("bench", ctx({ preferences: { incline_db_fly: "preferred" } }));
    expect(points(find(overall, "incline_db_fly"), "preferred")).toBe(SWAP_PREFERRED_POINTS);
    expect(points(find(overall, "push_up"), "preferred")).toBe(0);
    const here = recommendSwaps(
      "bench",
      ctx({ location: "home", preferencesByLocation: { home: { push_up: "preferred" } } })
    );
    expect(points(find(here, "push_up"), "preferred")).toBe(SWAP_PREFERRED_POINTS);
  });

  it("history: more and more recent sessions score more, imported ones count", () => {
    const once = recommendSwaps("bench", ctx({ strengthSets: [set("incline_db_press", daysBefore(40))] }));
    const often = recommendSwaps(
      "bench",
      ctx({ strengthSets: [1, 4, 8, 12, 20].map((d) => set("incline_db_press", daysBefore(d))) })
    );
    const a = points(find(once, "incline_db_press"), "history");
    const b = points(find(often, "incline_db_press"), "history");
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(b).toBeLessThanOrEqual(SWAP_HISTORY_WEIGHT);
    expect(points(find(once, "push_up"), "history")).toBe(0);
    expect(find(often, "incline_db_press").history).toEqual({
      timesDone: 5,
      lastDone: daysBefore(1),
      imported: false,
    });

    const imported = importedStrengthSets([
      importedSession([importedSet({ mappedExerciseId: "incline_db_press", exerciseName: "Incline DB" })], {
        startedAt: daysBefore(21),
      }),
    ]);
    const fromImport = find(recommendSwaps("bench", ctx({ strengthSets: imported })), "incline_db_press");
    expect(fromImport.history?.imported).toBe(true);
    expect(fromImport.history?.timesDone).toBe(1);
    expect(fromImport.parts.find((p) => p.id === "history")!.detail).toBe("Done 1 time, last 3 weeks ago (imported)");
  });

  it("history: warm-ups, weights set by hand and sets after now are not history", () => {
    const list = recommendSwaps(
      "bench",
      ctx({
        strengthSets: [
          set("incline_db_press", daysBefore(3), { role: "warmup" }),
          set("incline_db_press", daysBefore(2), { provisional: true }),
          set("incline_db_press", daysBefore(-2)),
        ],
      })
    );
    expect(find(list, "incline_db_press").history).toBeUndefined();
  });

  it("weight: points when the prescription comes from the lifter's sets or the strength model", () => {
    const list = recommendSwaps("bench", ctx({ strengthSets: [set("incline_db_press", daysBefore(5), { weight: 40 })] }));
    const done = find(list, "incline_db_press");
    expect(done.prescription.basis).toBe("history");
    expect(points(done, "weight")).toBe(SWAP_KNOWN_WEIGHT_POINTS);
    const never = find(list, "incline_db_fly");
    expect(never.prescription.basis).toBe("default");
    expect(points(never, "weight")).toBe(0);
  });

  it("recovery: a penalty when a main muscle the candidate adds is still recovering", () => {
    // Squat works quads, glutes, adductors and the low back; a Romanian deadlift adds hamstrings.
    const slot = { tier: "T2" as const, sets: 3, reps: 10, isAMRAP: true, weight: 135 };
    const tired = recommendSwaps("squat", ctx({ slot, recovery: { hamstrings: "recovering", quads: "recovering" } }));
    const rdl = find(tired, "barbell_rdl");
    expect(EXERCISES.barbell_rdl.primaryMuscles).toContain("hamstrings");
    expect(points(rdl, "recovery")).toBe(-SWAP_RECOVERY_PENALTY);
    expect(rdl.parts.find((p) => p.id === "recovery")!.detail).toBe("Adds hamstrings, still recovering");
    // Quads are the squat's own: a recovering quad costs a replacement nothing extra.
    expect(points(find(tired, "leg_extensions"), "recovery")).toBe(0);
    expect(points(find(recommendSwaps("squat", ctx({ slot })), "barbell_rdl"), "recovery")).toBe(0);
  });

  it("pain: a penalty for a pain entry on a joint it loads; soreness and severity 1 do not count", () => {
    const pain = (severity: 1 | 2 | 3 | 4 | 5, sensation: "pain" | "soreness" = "pain") =>
      recommendSwaps("bench", ctx({ painEntries: [{ region: "left_wrist", sensation, severity }] }));
    expect(points(find(pain(3), "push_up"), "pain")).toBe(-SWAP_PAIN_PENALTY);
    expect(points(find(pain(3), "incline_db_press"), "pain")).toBe(0);
    expect(points(find(pain(1), "push_up"), "pain")).toBe(0);
    expect(points(find(pain(4, "soreness"), "push_up"), "pain")).toBe(0);
    expect(find(pain(3), "push_up").reason).toMatch(/but loads your left wrist, where you logged pain/);
  });
});

describe("recommendSwaps: properties", () => {
  const contexts: [string, SwapContext][] = [
    ["bench", ctx()],
    ["squat", ctx({ location: "home", slot: { tier: "T1", sets: 5, reps: 3, isAMRAP: true, weight: 50, originalWeight: 185 } })],
    ["deadlift", ctx({ recovery: { hamstrings: "recovering" }, painEntries: [{ region: "lower_back", sensation: "pain", severity: 2 }] })],
    ["face_pulls", ctx({ slot: undefined, preferences: { reverse_fly: "preferred" } })],
    ["lat_pulldown", ctx({ slot: { tier: "T3", sets: 3, reps: 15, isAMRAP: true, weight: 100 } })],
  ];

  it.each(contexts)("%s: the parts sum to the score, in the fixed order", (id, context) => {
    for (const c of recommendSwaps(id, context)) {
      expect(c.parts.map((p) => p.id)).toEqual([...SWAP_SCORE_PART_IDS]);
      expect(c.parts.reduce((s, p) => s + p.points, 0)).toBeCloseTo(c.score, 6);
      expect(c.reason.length).toBeGreaterThan(0);
    }
  });

  it.each(contexts)("%s: ranked by score, ties by name", (id, context) => {
    const list = recommendSwaps(id, context);
    for (let i = 1; i < list.length; i++) {
      const [a, b] = [list[i - 1], list[i]];
      expect(a.score > b.score || (a.score === b.score && EXERCISES[a.exerciseId].name.localeCompare(EXERCISES[b.exerciseId].name) <= 0)).toBe(true);
    }
    expect(recommendSwaps(id, context)).toEqual(list);
  });

  it("never offers a blocked exercise, at either scope", () => {
    const list = recommendSwaps(
      "bench",
      ctx({ preferences: { db_bench: "blocked" }, preferencesByLocation: { gym: { push_up: "blocked" } } })
    ).map((c) => c.exerciseId);
    expect(list).not.toContain("db_bench");
    expect(list).not.toContain("push_up");
  });

  it("offers nothing that needs a gym at home", () => {
    for (const id of ["squat", "bench", "deadlift", "ohp", "lat_pulldown"]) {
      const list = recommendSwaps(id, ctx({ location: "home" }));
      expect(list.length).toBeGreaterThan(0);
      expect(list.every((c) => !EXERCISES[c.exerciseId].requiresGym)).toBe(true);
    }
  });

  it("leaves out the original and the exercises already in the workout; nothing for an unknown id", () => {
    const list = recommendSwaps("bench", ctx({ exclude: ["db_bench"] })).map((c) => c.exerciseId);
    expect(list).not.toContain("bench");
    expect(list).not.toContain("db_bench");
    expect(recommendSwaps("not_an_exercise", ctx())).toEqual([]);
  });

  it("every candidate shares a main muscle with the original", () => {
    for (const c of recommendSwaps("squat", ctx())) {
      expect(c.coverage.primary.length).toBeGreaterThan(0);
    }
  });
});

describe("recommendSwaps: prescription", () => {
  it("keeps a program slot's sets, reps and AMRAP", () => {
    for (const c of recommendSwaps("bench", ctx())) {
      expect([c.prescription.sets, c.prescription.reps, c.prescription.isAMRAP]).toEqual([3, 10, true]);
    }
  });

  it("seeds a home version of the lift the way a home exercise is seeded, uncapped at the gym", () => {
    const heavy = { tier: "T1" as const, sets: 5, reps: 3, isAMRAP: true, weight: 315 };
    const gym = find(recommendSwaps("bench", ctx({ slot: heavy })), "db_bench").prescription;
    const home = find(recommendSwaps("bench", ctx({ slot: heavy, location: "home" })), "db_bench").prescription;
    expect(gym.basis).toBe("ratio");
    expect(gym.weight).toBeGreaterThan(EQUIPMENT.maxDumbbellWeight);
    expect(home.weight).toBe(EQUIPMENT.maxDumbbellWeight);
  });

  it("an accessory slot takes the candidate's accessory prescription", () => {
    const list = recommendSwaps("face_pulls", ctx({ slot: undefined }));
    const reverse = find(list, "reverse_fly").prescription;
    expect(reverse.isAMRAP).toBe(true);
    expect(reverse.basis).toBe("none");
    expect(reverse.weight).toBe(0);
  });

  it("an accessory slot uses a weight set by hand", () => {
    const list = recommendSwaps(
      "face_pulls",
      ctx({ slot: undefined, accessoryWeights: { reverse_fly: { weight: 17.5, setAt: daysBefore(2).getTime() } } })
    );
    expect(find(list, "reverse_fly").prescription).toMatchObject({ weight: 17.5, basis: "hand" });
  });
});
