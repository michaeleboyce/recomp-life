import { describe, expect, it } from "vitest";
import {
  STRENGTH_POOLING,
  learnTransferRatio,
  muscleStrengthIndex,
  pooledLiftEstimate,
  sessionEstimates,
} from "@/lib/strength";
import { strengthEvidenceOf, strengthSetsOf } from "@/lib/workout/strength";
import {
  addImportedVolume,
  addMuscleValues,
  effortRpe,
  importedGroupSets,
  importedTonnage,
  importedMuscleLastTrained,
  importedMuscleLoad,
  importedMuscleSets,
  importedStrengthSets,
  latestPerMuscle,
} from "./evidence";
import { importDay, importedSession, importedSet } from "./testRecords";

// Made-up sessions only.

describe("importedStrengthSets", () => {
  it("turns mapped sets into strength sets as lifted, per dumbbell for a two-dumbbell exercise", () => {
    const session = importedSession([
      importedSet({ id: "a", exerciseName: "Dumbbell Bench Press", mappedExerciseId: "db_bench", weightPerImplementLb: 50.00003, implementCount: 2, reps: 8 }),
      importedSet({ id: "b", exerciseName: "Barbell Squat", mappedExerciseId: "squat", weightPerImplementLb: 185, reps: 5 }),
    ]);
    const [db, squat] = importedStrengthSets([session]);
    expect(db).toMatchObject({ id: "a", exerciseId: "db_bench", weight: 50, perHand: true, reps: 8, tier: "T1", isAMRAP: true, role: "working" });
    expect(squat).toMatchObject({ exerciseId: "squat", weight: 185, perHand: false });
    expect(db.sessionId).toBe(session.id);
    expect(new Date(squat.date).getTime()).toBeGreaterThan(new Date(db.date).getTime());
  });

  it("never turns a muscle-guessed or unknown name into evidence about a lift", () => {
    const session = importedSession([
      importedSet({ exerciseName: "Wobbly Bench Thing", mappedExerciseId: null, muscles: ["chest"] }),
      importedSet({ exerciseName: "Zorblax", mappedExerciseId: null }),
    ]);
    expect(importedStrengthSets([session])).toEqual([]);
  });

  it("keeps warm-ups as warm-ups, links a drop to the set before it, and reads effort words", () => {
    const session = importedSession([
      importedSet({ id: "w", role: "warmup", weightPerImplementLb: 95 }),
      importedSet({ id: "x", role: "work", weightPerImplementLb: 185, effort: "Hard" }),
      importedSet({ id: "d1", role: "drop", weightPerImplementLb: 135, reps: 8 }),
      importedSet({ id: "d2", role: "drop", weightPerImplementLb: 95, reps: 10 }),
    ]);
    const sets = importedStrengthSets([session]);
    expect(sets.map((s) => s.role)).toEqual(["warmup", "working", "drop", "drop"]);
    expect(sets[1].rpe).toBe(9);
    expect(sets[2].dropOf).toBe("x");
    expect(sets[3].dropOf).toBe("d1");
    // The estimated max is the working set's; drops never set it.
    const [estimate] = sessionEstimates(sets, "squat");
    expect(estimate.bestSet.id).toBe("x");
    expect(estimate.dropsCounted).toBe(1);
  });

  it("gives no estimate for a set with no load (bodyweight, assistance or a timed hold)", () => {
    const session = importedSession([
      importedSet({ id: "bw", weightPerImplementLb: 0, reps: 10 }),
      importedSet({ id: "assist", weightPerImplementLb: 40, weightCountsAsLoad: false, reps: 8 }),
      importedSet({ id: "hold", weightPerImplementLb: 20, reps: null, durationSec: 30 }),
    ]);
    const sets = importedStrengthSets([session]);
    expect(sets.every((s) => !s.isAMRAP)).toBe(true);
    expect(sessionEstimates(sets, "squat")).toEqual([]);
  });

  it("leaves out soft-deleted sessions (an undone import)", () => {
    expect(importedStrengthSets([importedSession([importedSet()], { deletedAt: 5 })])).toEqual([]);
  });
});

describe("effortRpe", () => {
  it("maps the apps' effort words and nothing else", () => {
    expect(effortRpe("Easy")).toBe(7);
    expect(effortRpe("Ideal")).toBe(8);
    expect(effortRpe(" hard ")).toBe(9);
    expect(effortRpe("Spicy")).toBeNull();
    expect(effortRpe(null)).toBeNull();
  });
});

describe("imported history in the strength model (I9)", () => {
  const bench = (day: number, weight: number, reps = 5) =>
    importedSession(
      [importedSet({ exerciseName: "Barbell Bench Press", mappedExerciseId: "bench", weightPerImplementLb: weight, reps })],
      { startedAt: importDay(day) }
    );
  const dbBench = (day: number, perHand: number, reps = 8) =>
    importedSession(
      [importedSet({ exerciseName: "Dumbbell Bench Press", mappedExerciseId: "db_bench", weightPerImplementLb: perHand, reps, implementCount: 2 })],
      { startedAt: importDay(day) }
    );

  it("moves the pooled estimate: none from the app's log alone, one with imported history", () => {
    expect(pooledLiftEstimate("bench", strengthEvidenceOf([], []))).toBeNull();
    const estimate = pooledLiftEstimate("bench", strengthEvidenceOf([], [bench(0, 150)]));
    // 150 × (1 + 5/30) = 175.
    expect(estimate?.value).toBe(175);
  });

  it("weights an older imported session by the library's half-life (pins the weighting)", () => {
    const halfLife = STRENGTH_POOLING.evidenceHalfLifeDays;
    const sets = strengthEvidenceOf([], [bench(0, 150), dbBench(2 * halfLife, 60)]);
    const estimate = pooledLiftEstimate("bench", sets)!;
    expect(estimate.basis).toBe("pooled");
    // The bench session is two half-lives older than the newest session pooled.
    expect(estimate.ownWeight).toBeCloseTo(0.25, 10);
    const [related] = estimate.related;
    expect(related.weight).toBeCloseTo(STRENGTH_POOLING.transferWeight, 10);
    const own = 175;
    const expected = (0.25 * own + related.weight * related.liftEquivalent) / (0.25 + related.weight);
    expect(estimate.value).toBe(Math.round(expected));
  });

  it("lets a newer session supersede imported history of the same lift", () => {
    const old = bench(0, 150);
    const recent = bench(10, 160);
    expect(pooledLiftEstimate("bench", strengthEvidenceOf([], [old, recent]))?.value).toBe(Math.round(160 * (1 + 5 / 30)));
  });

  it("learns a ratio from imported barbell and dumbbell sessions close in time", () => {
    const sets = strengthEvidenceOf([], [bench(0, 150), dbBench(3, 60), bench(14, 155), dbBench(17, 62)]);
    const ratio = learnTransferRatio("bench", "db_bench", sets)!;
    expect(ratio.pairs).toBeGreaterThan(0);
    expect(ratio.basis).toBe("learned");
  });

  it("adds to the log's own sets (strengthSetsOf), marked imported", () => {
    expect(strengthSetsOf([])).toEqual([]);
    const sets = strengthEvidenceOf([], [bench(0, 150)]);
    expect(sets).toHaveLength(1);
    expect(sets[0].imported).toBe(true);
  });

  it("is worked out once per list of sessions and remembered choices", () => {
    const sessions = [bench(0, 150)];
    const overrides = {};
    expect(importedStrengthSets(sessions, overrides)).toBe(importedStrengthSets(sessions, overrides));
    expect(importedStrengthSets(sessions)).toBe(importedStrengthSets(sessions));
    expect(importedStrengthSets([...sessions])).not.toBe(importedStrengthSets(sessions));
  });

  it("feeds the muscle strength index", () => {
    const index = muscleStrengthIndex(strengthEvidenceOf([], [bench(0, 150), bench(7, 155)]));
    expect(index.chest?.length).toBeGreaterThan(0);
  });
});

describe("imported muscle work", () => {
  const monday = new Date("2024-03-04T00:00:00Z");
  const nextMonday = new Date("2024-03-11T00:00:00Z");

  it("counts guessed names for muscle volume, by their guessed muscles", () => {
    const session = importedSession([
      importedSet({ exerciseName: "Wobbly Bench Thing", mappedExerciseId: null, muscles: ["chest"] }),
      importedSet({ exerciseName: "Zorblax", mappedExerciseId: null }),
    ]);
    expect(importedMuscleLoad([session], monday, nextMonday)).toEqual({ chest: 1 });
  });

  it("counts mapped sets by the library's muscles, warm-ups for nothing and drops at half a set", () => {
    const session = importedSession([
      importedSet({ id: "w", role: "warmup", mappedExerciseId: "bicep_curls", exerciseName: "Curl" }),
      importedSet({ id: "x", role: "work", mappedExerciseId: "bicep_curls", exerciseName: "Curl" }),
      importedSet({ id: "d", role: "drop", mappedExerciseId: "bicep_curls", exerciseName: "Curl" }),
    ]);
    const credits = Object.fromEntries(importedMuscleSets([session]).map((s) => [s.id, s.credit]));
    expect(credits).toEqual({ w: 0, x: 1, d: 0.5 });
    expect(importedMuscleLoad([session], monday, nextMonday).biceps).toBe(1.5);
  });

  it("counts only sessions in the week asked for", () => {
    const outside = importedSession([importedSet({ mappedExerciseId: "bicep_curls" })], {
      startedAt: new Date("2024-02-20T10:00:00Z"),
    });
    expect(importedMuscleLoad([outside], monday, nextMonday)).toEqual({});
  });

  it("gives each muscle the start of the last imported session that worked it", () => {
    const early = importedSession([importedSet({ mappedExerciseId: "bicep_curls" })], { startedAt: new Date("2024-03-01T10:00:00Z") });
    const late = importedSession([importedSet({ mappedExerciseId: "bicep_curls" })], { startedAt: new Date("2024-03-05T10:00:00Z") });
    const warmOnly = importedSession([importedSet({ mappedExerciseId: "calf_raises", role: "warmup" })]);
    const last = importedMuscleLastTrained([early, late, warmOnly]);
    expect(last.biceps?.toISOString()).toBe("2024-03-05T10:00:00.000Z");
    expect(last.calves).toBeUndefined();
  });

  it("adds imported sets to the app's direct and indirect sets per muscle, in the week only", () => {
    const own = { chest: { directSets: 2, indirectSets: 0, totalFractional: 2 } };
    const week = importedSession(
      [
        importedSet({ id: "b1", mappedExerciseId: "bench", exerciseName: "Bench" }),
        importedSet({ id: "b2", mappedExerciseId: "bench", exerciseName: "Bench" }),
        importedSet({ id: "bw", mappedExerciseId: "bench", exerciseName: "Bench", role: "warmup" }),
      ],
      { startedAt: new Date("2024-03-05T10:00:00Z") }
    );
    const before = importedSession([importedSet({ mappedExerciseId: "bench" })], {
      startedAt: new Date("2024-02-20T10:00:00Z"),
    });
    const sum = addImportedVolume(own, [week, before], monday, nextMonday);
    expect(sum.chest).toEqual({ directSets: 4, indirectSets: 0, totalFractional: 4 });
    expect(sum.triceps).toEqual({ directSets: 0, indirectSets: 2, totalFractional: 1 });
    // The app's own numbers are not changed in place.
    expect(own.chest.directSets).toBe(2);
    expect(addImportedVolume(own, [], monday, nextMonday)).toEqual(own);
  });

  it("gives direct sets per display group, once per set per group, as the app counts its own", () => {
    const from = new Date(2024, 2, 4);
    const to = new Date(2024, 2, 11);
    const at = new Date(2024, 2, 5, 10);
    const session = importedSession(
      [
        importedSet({ id: "b1", mappedExerciseId: "bench", exerciseName: "Bench" }),
        importedSet({ id: "bw", mappedExerciseId: "bench", exerciseName: "Bench", role: "warmup" }),
        importedSet({ id: "c1", mappedExerciseId: "bicep_curls", exerciseName: "Curl" }),
        importedSet({ id: "cd", mappedExerciseId: "bicep_curls", exerciseName: "Curl", role: "drop" }),
        importedSet({ id: "g", exerciseName: "Wobbly Thing", mappedExerciseId: null, muscles: ["lats", "mid_back"] }),
      ],
      { startedAt: at }
    );
    const groups = importedGroupSets([session], from, to);
    expect(groups.Chest).toBe(1);
    // Triceps are secondary on the bench: no direct set.
    expect(groups.Triceps).toBeUndefined();
    expect(groups.Biceps).toBe(1.5);
    // Two back muscles in one set still make one set for Back.
    expect(groups.Back).toBe(1);
    const outside = new Date(to);
    outside.setDate(outside.getDate() + 1);
    expect(importedGroupSets([{ ...session, startedAt: outside }], from, to)).toEqual({});
  });

  it("sums weight x reps over the sets that are not warm-ups, as lifted, in the window", () => {
    const from = new Date(2024, 2, 4);
    const to = new Date(2024, 2, 11);
    const session = importedSession(
      [
        importedSet({ weightPerImplementLb: 100, reps: 5 }),
        importedSet({ weightPerImplementLb: 45, reps: 10, role: "warmup" }),
        importedSet({ weightPerImplementLb: 80, reps: 8, role: "drop" }),
        importedSet({ weightPerImplementLb: 50, reps: 10, weightCountsAsLoad: false }),
        importedSet({ exerciseName: "Zorblax", mappedExerciseId: null, weightPerImplementLb: 10, reps: 10 }),
      ],
      { startedAt: new Date(2024, 2, 6, 9) }
    );
    expect(importedTonnage([session], from, to)).toBe(500 + 640 + 100);
    expect(importedTonnage([{ ...session, deletedAt: 1 }], from, to)).toBe(0);
  });

  it("merges with the app's own muscle values and dates", () => {
    expect(addMuscleValues({ chest: 2 }, { chest: 1, quads: 3 })).toEqual({ chest: 3, quads: 3 });
    const a = new Date("2024-03-01T00:00:00Z");
    const b = new Date("2024-03-02T00:00:00Z");
    expect(latestPerMuscle({ chest: a }, { chest: b, quads: a })).toEqual({ chest: b, quads: a });
  });
});

describe("a name remapped after the import", () => {
  const session = () =>
    importedSession([
      importedSet({ exerciseName: "Made-up Press", mappedExerciseId: null, muscles: ["chest"], weightPerImplementLb: 40 }),
      importedSet({ exerciseName: "Test Squat", mappedExerciseId: "squat" }),
    ]);

  it("changes the strength evidence without a re-import", () => {
    expect(importedStrengthSets([session()]).map((s) => s.exerciseId)).toEqual(["squat"]);
    const remapped = importedStrengthSets([session()], { "made-up press": { kind: "exercise", exerciseId: "db_bench" } });
    expect(remapped.map((s) => s.exerciseId)).toEqual(["db_bench", "squat"]);
    expect(remapped[0]).toMatchObject({ weight: 40, perHand: true });
  });

  it("a name kept under its own name since is no longer evidence about a lift, and works its chosen muscles", () => {
    const overrides = { "Test Squat": { kind: "custom" as const, primary: ["glutes" as const] } };
    expect(importedStrengthSets([session()], overrides)).toEqual([]);
    const squatSet = importedMuscleSets([session()], overrides).find((m) => m.primary.includes("glutes"));
    expect(squatSet).toBeDefined();
  });

  it("strengthEvidenceOf reads the remembered choices too", () => {
    const sets = strengthEvidenceOf([], [session()], { "Made-up Press": { kind: "exercise", exerciseId: "db_bench" } });
    expect(sets.map((s) => s.exerciseId)).toContain("db_bench");
  });
});
