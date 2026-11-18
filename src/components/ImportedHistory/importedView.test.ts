// Made-up imported sessions only: the repository is public.
import { describe, expect, it } from "vitest";
import { makeImportedSession, makeImportedSet } from "@/lib/import/testRecords";
import type { MappingOverrides } from "@/lib/import/mapping";
import {
  importedSessionExercises,
  importedSessionSummary,
  importedSetLoad,
  importedSummaryLine,
  isImportedRow,
} from "./importedView";

const start = new Date("2025-04-02T17:00:00Z");

/** A made-up dumbbell day: warm-up, three working sets, a drop, a row and an unmapped name. */
function dumbbellDay(overrides: Parameters<typeof makeImportedSession>[1] = {}) {
  return makeImportedSession(
    [
      makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 30, reps: 12, role: "warmup", implementCount: 2 }),
      makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 50, reps: 10, setOrder: 2, effort: "Hard", implementCount: 2 }),
      makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 50, reps: 9, setOrder: 3, effort: "Ideal", implementCount: 2 }),
      makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 40, reps: 8, setOrder: 4, role: "drop", implementCount: 2 }),
      makeImportedSet({ exerciseName: "Made-up Cable Row", mappedExerciseId: "lat_pulldown", weightPerImplementLb: 120, reps: 12, implementCount: 1 }),
      makeImportedSet({ exerciseName: "Made-up Cable Row", mappedExerciseId: "lat_pulldown", weightPerImplementLb: 120, reps: 11, setOrder: 2, implementCount: 1 }),
      makeImportedSet({ exerciseName: "Zorbing Twist", mappedExerciseId: null, weightPerImplementLb: null, reps: 15, implementCount: null }),
    ],
    { startedAt: start, endedAt: new Date(start.getTime() + 52 * 60_000), sourceApp: "gravl", ...overrides }
  );
}

describe("importedSessionSummary", () => {
  it("names the session by its title when it has one", () => {
    const summary = importedSessionSummary(dumbbellDay({ title: "Push Day" }));
    expect(summary).toEqual({ title: "Push Day", source: "Gravl", workingSets: 5, durationSec: 52 * 60 });
    expect(importedSummaryLine(summary)).toBe("Gravl · 5 working sets · 52 min");
  });

  it("without a title, names the top exercises by working sets, as the library calls them", () => {
    expect(importedSessionSummary(dumbbellDay()).title).toBe("DB Bench Press, Lat Pulldown, Zorbing Twist");
  });

  it("reads a remapped name as it maps now", () => {
    const overrides: MappingOverrides = { "Made-up Cable Row": { kind: "exercise", exerciseId: "db_row" } };
    expect(importedSessionSummary(dumbbellDay(), overrides).title).toBe("DB Bench Press, Dumbbell Row, Zorbing Twist");
  });

  it("leaves out the duration when the session has no end, and counts no warm-ups or drops", () => {
    const summary = importedSessionSummary(
      makeImportedSession([makeImportedSet({ role: "warmup" }), makeImportedSet({ role: "drop" }), makeImportedSet()], { endedAt: null, sourceApp: "fitbod" })
    );
    expect(summary.durationSec).toBeNull();
    expect(importedSummaryLine(summary)).toBe("Fitbod · 1 working set");
  });
});

describe("importedSetLoad", () => {
  it("shows a dumbbell in each hand per hand, times two", () => {
    expect(importedSetLoad(makeImportedSet({ weightPerImplementLb: 50 }), "db_bench")).toBe("50 lb × 2");
  });
  it("shows a barbell or one dumbbell as the load", () => {
    expect(importedSetLoad(makeImportedSet({ weightPerImplementLb: 135 }), "bench")).toBe("135 lb");
    expect(importedSetLoad(makeImportedSet({ weightPerImplementLb: 60 }), "goblet_squat")).toBe("60 lb");
  });
  it("reads an unmapped name's implements from its words", () => {
    expect(importedSetLoad(makeImportedSet({ exerciseName: "Made-up Dumbbell Fly", weightPerImplementLb: 25.5 }), null)).toBe("25.5 lb × 2");
  });
  it("says bodyweight and assistance in words", () => {
    expect(importedSetLoad(makeImportedSet({ weightPerImplementLb: null }), "squat")).toBe("bodyweight");
    expect(importedSetLoad(makeImportedSet({ weightPerImplementLb: 40, weightCountsAsLoad: false }), "squat")).toBe("40 lb assistance");
  });
});

describe("importedSessionExercises", () => {
  it("lists each exercise in file order with its sets, roles and effort", () => {
    const [press, row, twist] = importedSessionExercises(dumbbellDay());
    expect(press.name).toBe("Made-up DB Press");
    expect(press.countsAs).toBe("DB Bench Press");
    expect(press.sets.map((s) => [s.load, s.amount, s.role, s.effort])).toEqual([
      ["30 lb × 2", "12 reps", "warmup", null],
      ["50 lb × 2", "10 reps", "work", "Hard, about 1-2 reps left"],
      ["50 lb × 2", "9 reps", "work", "Ideal, about 1-2 reps left"],
      ["40 lb × 2", "8 reps", "drop", null],
    ]);
    expect(row.countsAs).toBe("Lat Pulldown");
    expect(row.sets.map((s) => s.load)).toEqual(["120 lb", "120 lb"]);
    expect(twist.countsAs).toBeNull();
    expect(twist.sets[0].load).toBe("bodyweight");
  });

  it("follows a remembered choice over the stored mapping", () => {
    const overrides: MappingOverrides = { "Made-up Cable Row": { kind: "exercise", exerciseId: "db_row" } };
    const row = importedSessionExercises(dumbbellDay(), overrides)[1];
    expect(row.countsAs).toBe("Dumbbell Row");
    // The library's grip for the new exercise: a dumbbell in each hand.
    expect(row.sets[0].load).toBe("120 lb × 2");
  });

  it("keeps the muscles of a name kept under its own name", () => {
    const session = makeImportedSession([
      makeImportedSet({ exerciseName: "Zorbing Curl", mappedExerciseId: null, muscles: ["biceps"] }),
    ]);
    expect(importedSessionExercises(session)[0]).toMatchObject({ countsAs: null, muscles: "Biceps" });
  });

  it("shows a timed hold's time and an unknown effort word as written", () => {
    const session = makeImportedSession([
      makeImportedSet({ exerciseName: "Made-up Plank", mappedExerciseId: null, reps: null, weightPerImplementLb: null, durationSec: 75, effort: "Spicy" }),
    ]);
    expect(importedSessionExercises(session)[0].sets[0]).toMatchObject({ amount: "1:15", effort: "Spicy" });
  });

  it("reads an easy set as 3+ reps left and an all-out one as 0", () => {
    const session = makeImportedSession([
      makeImportedSet({ exerciseName: "Barbell Squat", mappedExerciseId: "squat", effort: "Easy" }),
      makeImportedSet({ exerciseName: "Barbell Squat", mappedExerciseId: "squat", setOrder: 2, effort: "Failure" }),
    ]);
    expect(importedSessionExercises(session)[0].sets.map((s) => s.effort)).toEqual([
      "Easy, about 3+ reps left",
      "Failure, about 0 reps left",
    ]);
  });
});

describe("isImportedRow", () => {
  it("is true for rows from another app's export only", () => {
    expect(isImportedRow({ source: "import" })).toBe(true);
    expect(isImportedRow({ importBatchId: "b1" })).toBe(true);
    expect(isImportedRow({ source: "apple_health" })).toBe(false);
    expect(isImportedRow({})).toBe(false);
  });
});
