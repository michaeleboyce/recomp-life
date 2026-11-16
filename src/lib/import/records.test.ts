import { describe, expect, it } from "vitest";
import { buildFitbodFile, buildGravlFile, fRow, gRow } from "./parse/fixtures";
import { parseExport } from "./parse";
import { buildCardioRows, buildSessionRecords, cardioRow } from "./records";

// Every file here is made up: invented names, dates and weights in the real column layout.

describe("buildSessionRecords", () => {
  it("stores each set with the library exercise its name maps to", () => {
    const parsed = parseExport(
      buildFitbodFile([
        fRow({ Exercise: "Dumbbell Bench Press", "Weight(kg)": 20 }),
        fRow({ Exercise: "Spider Wobble", "Weight(kg)": 5 }),
        fRow({ Exercise: "Zorblax", "Weight(kg)": 5 }),
      ])
    );
    const [session] = buildSessionRecords(parsed, "batch-1");
    expect(session.importBatchId).toBe("batch-1");
    expect(session.clientId).toBe(session.id);
    expect(session.startedAt).toBeInstanceOf(Date);
    const byName = Object.fromEntries(session.sets.map((s) => [s.exerciseName, s]));
    expect(byName["Dumbbell Bench Press"].mappedExerciseId).toBe("db_bench");
    expect(byName["Dumbbell Bench Press"].muscles).toBeUndefined();
    expect(byName["Zorblax"].mappedExerciseId).toBeNull();
    expect(byName["Zorblax"].muscles).toBeUndefined();
  });

  it("keeps a guessed name under its own name with its guessed primary muscles", () => {
    const parsed = parseExport(buildFitbodFile([fRow({ Exercise: "Wobbly Hammer Curl" })]));
    const [set] = buildSessionRecords(parsed, "b").flatMap((s) => s.sets);
    expect(set.mappedExerciseId).toBeNull();
    expect(set.muscles).toContain("biceps");
  });

  it("applies a remembered choice before the table", () => {
    const parsed = parseExport(buildFitbodFile([fRow({ Exercise: "Zorblax" })]));
    const overrides = { zorblax: { kind: "exercise" as const, exerciseId: "bicep_curls" } };
    const [set] = buildSessionRecords(parsed, "b", overrides).flatMap((s) => s.sets);
    expect(set.mappedExerciseId).toBe("bicep_curls");
  });

  it("keeps per-implement weights, implement counts, roles and effort words", () => {
    const parsed = parseExport(
      buildGravlFile([
        gRow({ Exercise: "Barbell Squat", Set: 1, "Set Type": "Warmup", Reps: 5, "Weight (lb)": 95, Effort: "" }),
        gRow({ Exercise: "Barbell Squat", Set: 2, "Set Type": "Normal", Reps: 5, "Weight (lb)": 185, Effort: "Hard" }),
        gRow({ Exercise: "Barbell Squat", Set: 3, "Set Type": "Dropset", Reps: 8, "Weight (lb)": 135, Effort: "" }),
      ])
    );
    const [session] = buildSessionRecords(parsed, "b");
    expect(session.startIsLocal).toBe(true);
    expect(session.sets.map((s) => s.role)).toEqual(["warmup", "work", "drop"]);
    expect(session.sets[1]).toMatchObject({ weightPerImplementLb: 185, reps: 5, effort: "Hard", mappedExerciseId: "squat" });
  });

  it("returns sessions oldest first with the parser's ids, so a second build is identical", () => {
    const text = buildFitbodFile([
      fRow({ Date: "2021-03-05 10:00:00 +0000" }),
      fRow({ Date: "2021-03-04 10:00:00 +0000" }),
    ]);
    const a = buildSessionRecords(parseExport(text), "b1");
    const b = buildSessionRecords(parseExport(text), "b2");
    expect(a.map((s) => s.startedAt.toISOString())).toEqual(["2021-03-04T10:00:00.000Z", "2021-03-05T10:00:00.000Z"]);
    expect(a.map((s) => s.id)).toEqual(b.map((s) => s.id));
  });
});

describe("cardio rows", () => {
  const cardio = (over: Partial<Parameters<typeof cardioRow>[0]> = {}) => ({
    id: "gravl-cardio-1",
    sourceApp: "gravl" as const,
    kind: "walk" as const,
    name: "Walking",
    start: "2022-05-06T07:00:00",
    startIsLocal: true,
    durationSec: 1800,
    distanceM: 3218.688,
    rowNumber: 2,
    ...over,
  });

  it("makes a walk an activity and a run a run, in the app's units", () => {
    const walk = cardioRow(cardio());
    expect(walk).toMatchObject({
      table: "activities",
      row: { kind: "walking", durationMinutes: 30, distanceMiles: 2, perceivedEffort: null, sourceName: "Gravl", style: null },
    });
    const run = cardioRow(cardio({ kind: "run", name: "Treadmill Run", durationSec: 1500, distanceM: null }));
    expect(run).toMatchObject({ table: "runs", row: { type: "treadmill", category: "other", durationMinutes: 25, distanceMiles: null } });
    expect(cardioRow(cardio({ kind: "run", name: "Running" }))?.row).toMatchObject({ type: "outdoor" });
  });

  it("keeps the exported name as the note of an activity of another kind", () => {
    expect(cardioRow(cardio({ kind: "elliptical", name: "Elliptical Trainer" }))?.row).toMatchObject({
      kind: "other",
      notes: "Elliptical Trainer",
    });
  });

  it("leaves out an entry with no duration and counts it", () => {
    expect(cardioRow(cardio({ durationSec: null }))).toBeNull();
    const parsed = { cardio: [cardio(), cardio({ id: "x", durationSec: null })] };
    const built = buildCardioRows(parsed);
    expect(built.rows).toHaveLength(1);
    expect(built.noDuration).toBe(1);
  });

  it("never sets an external id, so Apple Health can link to the row later", () => {
    const row = cardioRow(cardio())!.row as unknown as Record<string, unknown>;
    expect("externalId" in row).toBe(false);
    expect(row.id).toBe("gravl-cardio-1");
    expect(row.clientId).toBe("gravl-cardio-1");
  });
});
