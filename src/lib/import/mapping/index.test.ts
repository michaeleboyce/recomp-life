import { describe, expect, it } from "vitest";
import { EXERCISES } from "@/lib/exercises";
import { PROGRAM_LIFT_IDS, mapExercise, rememberMapping, summariseMapping } from "./index";

/** A made-up export: 60 common exercise names in the spellings different apps use. */
const COMMON_NAMES = [
  "Bench Press (Barbell)", "Squat (Barbell)", "Deadlift (Barbell)", "Overhead Press (Barbell)",
  "Lat Pulldown (Cable)", "Seated Row (Cable)", "Bent Over Row (Dumbbell)", "Dumbbell Row",
  "Incline Bench Press (Barbell)", "Bench Press (Dumbbell)", "Incline Bench Press (Dumbbell)",
  "Shoulder Press (Dumbbell)", "Lateral Raise (Dumbbell)", "Front Raise (Dumbbell)",
  "Reverse Fly (Dumbbell)", "Face Pull (Cable)", "Bicep Curl (Dumbbell)", "Bicep Curl (Barbell)",
  "Hammer Curl (Dumbbell)", "Preacher Curl (Machine)", "Triceps Pushdown (Cable - Straight Bar)",
  "Skullcrusher (Dumbbell)", "Triceps Extension (Dumbbell)", "Chest Fly (Dumbbell)",
  "Chest Press (Machine)", "Pec Deck (Machine)", "Leg Press", "Leg Extension (Machine)",
  "Lying Leg Curl (Machine)", "Seated Leg Curl (Machine)", "Standing Calf Raise (Machine)",
  "Goblet Squat (Kettlebell)", "Goblet Squat", "Bulgarian Split Squat (Dumbbell)", "Lunge (Dumbbell)",
  "Walking Lunge", "Romanian Deadlift (Dumbbell)", "Romanian Deadlift (Barbell)", "Hip Thrust (Barbell)",
  "Glute Bridge", "Pull Up", "Chin Up", "Push Up", "Bench Dip", "Plank", "Crunch", "Sit Up",
  "Hanging Leg Raise", "Russian Twist", "Ab Wheel", "Back Extension", "Shrug (Dumbbell)",
  "Upright Row (Barbell)", "Arnold Press (Dumbbell)", "Front Squat (Barbell)", "Hack Squat",
  "Kettlebell Swing", "Farmer’s Walk", "Burpee", "Jump Rope",
];

describe("mapExercise", () => {
  it("maps a name in the table to its library exercise", () => {
    expect(mapExercise("Barbell Bench Press")).toEqual({ kind: "mapped", exerciseId: "bench", confidence: "high" });
    expect(mapExercise("Seated Dumbbell Curl")).toEqual({
      kind: "mapped",
      exerciseId: "bicep_curls",
      confidence: "medium",
    });
  });

  it("maps the library's own names", () => {
    expect(mapExercise("Standing Lateral Raises")).toMatchObject({ exerciseId: "lateral_raises" });
    expect(mapExercise("DB Arnold Press")).toMatchObject({ exerciseId: "db_arnold_press" });
  });

  it("normalises before matching", () => {
    for (const name of [
      "dumbbell bench press",
      "DUMBBELL BENCH PRESS",
      "Dumbbell Bench Press",
      "Bench Press, Dumbbell",
      "DB Bench Press",
      "Dumbbell Bench-Press ",
    ]) {
      expect(mapExercise(name), name).toMatchObject({ kind: "mapped", exerciseId: "db_bench" });
    }
  });

  it("guesses muscles with low confidence for names outside the table", () => {
    expect(mapExercise("Spider Curl")).toEqual({
      kind: "guess",
      muscles: { primary: ["biceps"], secondary: ["forearms"] },
      confidence: "low",
    });
  });

  it("never maps an unmatched name to a program lift", () => {
    for (const name of ["Pause Squat", "Spoto Press", "Deficit Deadlift", "Z Press", "Pendlay Row", "Meadows Row"]) {
      const m = mapExercise(name);
      expect(m.kind, name).not.toBe("mapped");
    }
  });

  it("returns unknown when no word says what the exercise trains", () => {
    expect(mapExercise("Zorblax Twirl")).toEqual({ kind: "unknown" });
    expect(mapExercise("Morning Walk")).toEqual({ kind: "unknown" });
    expect(mapExercise("")).toEqual({ kind: "unknown" });
  });
});

describe("summariseMapping", () => {
  it("maps or lists for review every name in a made-up file of 60 common names", () => {
    expect(COMMON_NAMES).toHaveLength(60);
    const summary = summariseMapping(COMMON_NAMES);
    expect(summary.rows).toHaveLength(60);
    for (const row of summary.rows) {
      expect(row.mapping.kind === "mapped" || row.needsReview, row.name).toBe(true);
    }
    expect(summary.toReview.length + summary.totals.mapped + summary.totals.custom).toBe(60);
    // Most of them are in the table.
    expect(summary.totals.mapped).toBeGreaterThanOrEqual(35);
  });

  it("gives every mapped exercise muscles", () => {
    for (const row of summariseMapping(COMMON_NAMES).rows) {
      if (row.mapping.kind === "mapped") {
        expect(EXERCISES[row.mapping.exerciseId].primaryMuscles.length, row.name).toBeGreaterThan(0);
      }
      if (row.mapping.kind === "guess") expect(row.mapping.muscles.primary.length, row.name).toBeGreaterThan(0);
    }
  });

  it("reads the program lifts and their dumbbell versions apart in the made-up file", () => {
    const byName = new Map(summariseMapping(COMMON_NAMES).rows.map((r) => [r.name, r.mapping]));
    expect(byName.get("Bench Press (Barbell)")).toMatchObject({ exerciseId: "bench" });
    expect(byName.get("Bench Press (Dumbbell)")).toMatchObject({ exerciseId: "db_bench" });
    expect(byName.get("Goblet Squat (Kettlebell)")?.kind).toBe("guess");
    for (const name of ["Incline Bench Press (Barbell)", "Romanian Deadlift (Barbell)", "Front Squat (Barbell)"]) {
      const m = byName.get(name)!;
      expect(m.kind === "mapped" && PROGRAM_LIFT_IDS.has(m.exerciseId), name).toBe(false);
    }
  });

  it("merges spellings of one name into one row and counts how often it came in", () => {
    const summary = summariseMapping(["Hammer Curls", "hammer curl", "Hammer Curls", "Zorblax Twirl", "  "]);
    expect(summary.rows.map((r) => r.name)).toEqual(["Hammer Curls", "Zorblax Twirl"]);
    expect(summary.rows[0]).toMatchObject({ spellings: ["Hammer Curls", "hammer curl"], occurrences: 3 });
    expect(summary.totals).toEqual({ mapped: 1, custom: 0, guess: 0, unknown: 1 });
  });

  it("lists which names land on each library exercise", () => {
    const summary = summariseMapping(["Dumbbell Curl", "Seated Dumbbell Curl", "Back Squat", "Spider Curl"]);
    expect(summary.byExercise).toEqual([
      { exerciseId: "bicep_curls", names: ["Dumbbell Curl", "Seated Dumbbell Curl"] },
      { exerciseId: "squat", names: ["Back Squat"] },
    ]);
  });

  it("lists guesses and unknown names for review, sorted by name", () => {
    const summary = summariseMapping(["Zorblax Twirl", "Spider Curl", "Back Squat"]);
    expect(summary.toReview.map((r) => r.name)).toEqual(["Spider Curl", "Zorblax Twirl"]);
  });

  it("re-applies remembered choices, which then need no review", () => {
    const overrides = rememberMapping({}, "Zorblax Twirl", { kind: "custom", primary: ["obliques"] });
    const summary = summariseMapping(["Zorblax Twirl", "zorblax twirls"], overrides);
    expect(summary.rows).toHaveLength(1);
    expect(summary.rows[0].mapping.kind).toBe("custom");
    expect(summary.toReview).toEqual([]);
    expect(summary.totals.custom).toBe(1);
  });

  it("shows how each name's weight reads", () => {
    const rows = summariseMapping(["Dumbbell Bench Press", "Goblet Squat", "Back Squat"]).rows;
    const byName = new Map(rows.map((r) => [r.name, r.implement]));
    expect(byName.get("Dumbbell Bench Press")).toEqual({ weight: "per_implement", implements: 2, perHand: true });
    expect(byName.get("Goblet Squat")).toEqual({ weight: "per_implement", implements: 1, perHand: false });
    expect(byName.get("Back Squat")).toEqual({ weight: "total", implements: 1, perHand: false });
  });
});
