import { describe, expect, it } from "vitest";
import { ACCESSORY_IDS, EXERCISES } from "@/lib/exercises";
import { isMuscleId } from "@/lib/muscles";
import { MOTIONS } from "@/lib/motion/motions";
import { mapExercise } from "./index";
import { AMBIGUOUS_OWN_NAMES, NAME_TABLE, PROGRAM_LIFT_IDS, lookupName, tableKeys } from "./table";

/** Library entries added for imported history. */
const ADDED_IDS = [
  "db_fly",
  "db_bent_over_row",
  "incline_db_row",
  "cable_row",
  "db_squat",
  "leg_press",
  "lunge",
  "barbell_curl",
  "push_up",
  "bench_dip",
  "sit_up",
  "crunch",
];

describe("NAME_TABLE", () => {
  it("points only at exercises in the library", () => {
    for (const entry of NAME_TABLE) expect(EXERCISES[entry.exerciseId], entry.exerciseId).toBeDefined();
  });

  it("never gives one name two exercises, counting the library's own names", () => {
    const seen = new Map<string, { id: string; name: string }>();
    for (const row of tableKeys()) {
      expect(row.key, row.name).not.toBe("");
      const before = seen.get(row.key);
      if (before) expect(row.match.exerciseId, `${row.name} vs ${before.name}`).toBe(before.id);
      else seen.set(row.key, { id: row.match.exerciseId, name: row.name });
    }
  });

  it("uses medium confidence only for exercises that are not program lifts", () => {
    for (const entry of NAME_TABLE) {
      if (entry.confidence === "medium") expect(PROGRAM_LIFT_IDS.has(entry.exerciseId), entry.exerciseId).toBe(false);
    }
  });

  it("maps every library exercise's own name to itself, except the ambiguous ones", () => {
    for (const exercise of Object.values(EXERCISES)) {
      const expected = AMBIGUOUS_OWN_NAMES.has(exercise.id) ? undefined : exercise.id;
      expect(lookupName(exercise.name)?.exerciseId, exercise.name).toBe(expected);
    }
  });

  it("leaves a bare name that could be a barbell or machine version to review", () => {
    expect(mapExercise("Bulgarian Split Squat").kind).toBe("guess");
    expect(mapExercise("Calf Raise").kind).toBe("guess");
    expect(mapExercise("Dumbbell Bulgarian Split Squat")).toMatchObject({ exerciseId: "bulgarian_split_squat" });
    expect(mapExercise("Dumbbell Calf Raise")).toMatchObject({ exerciseId: "calf_raises" });
  });
});

describe("PROGRAM_LIFT_IDS", () => {
  it("holds the program lifts and every home substitute", () => {
    expect([...PROGRAM_LIFT_IDS].sort()).toEqual(
      [
        "squat", "bench", "deadlift", "ohp", "lat_pulldown", "db_row",
        "goblet_squat", "bulgarian_split_squat", "db_lunge",
        "db_bench", "db_floor_press",
        "db_rdl", "single_leg_db_rdl",
        "db_shoulder_press", "db_arnold_press",
      ].sort()
    );
  });
});

describe("the program-lift rule", () => {
  const mappedTo = (name: string) => {
    const m = mapExercise(name);
    return m.kind === "mapped" ? m.exerciseId : null;
  };

  it("maps a program lift's own names to it", () => {
    expect(mappedTo("Barbell Bench Press")).toBe("bench");
    expect(mappedTo("Bench Press (Barbell)")).toBe("bench");
    expect(mappedTo("Back Squat")).toBe("squat");
    expect(mappedTo("Squat (Barbell)")).toBe("squat");
    expect(mappedTo("Deadlift")).toBe("deadlift");
    expect(mappedTo("Overhead Press")).toBe("ohp");
    expect(mappedTo("Lat Pulldown")).toBe("lat_pulldown");
    expect(mappedTo("Dumbbell Row")).toBe("db_row");
  });

  it("maps a dumbbell substitute to the substitute, never to the barbell lift", () => {
    expect(mappedTo("Dumbbell Bench Press")).toBe("db_bench");
    expect(mappedTo("Bench Press (Dumbbell)")).toBe("db_bench");
    expect(mappedTo("Dumbbell Goblet Squat")).toBe("goblet_squat");
    expect(mappedTo("Dumbbell Bulgarian Split Squat")).toBe("bulgarian_split_squat");
    expect(mappedTo("Dumbbell Romanian Deadlift")).toBe("db_rdl");
    expect(mappedTo("Dumbbell Lunge")).toBe("db_lunge");
    expect(mappedTo("Dumbbell Shoulder Press")).toBe("db_shoulder_press");
  });

  it("does not count a variation as the program lift", () => {
    for (const name of [
      "Pause Squat",
      "Front Squat",
      "Box Squat",
      "Smith Machine Squat",
      "Squat",
      "Close-Grip Bench Press",
      "Incline Bench Press",
      "Paused Bench Press",
      "Romanian Deadlift",
      "Sumo Deadlift",
      "Trap Bar Deadlift",
      "Seated Barbell Shoulder Press",
      "Push Press",
      "Shoulder Press",
      "Reverse Grip Lat Pulldown",
      "Dumbbell Split Squat",
      "Single Leg Romanian Deadlift",
      "Kettlebell Goblet Squat",
    ]) {
      const id = mappedTo(name);
      expect(id === null || !PROGRAM_LIFT_IDS.has(id), `${name} -> ${id}`).toBe(true);
    }
  });

  it("only ever maps to a program lift with high confidence", () => {
    for (const row of tableKeys()) {
      if (PROGRAM_LIFT_IDS.has(row.match.exerciseId)) expect(row.match.confidence, row.name).toBe("high");
    }
  });
});

describe("library entries added for imported history", () => {
  it("have muscles, equipment, a motion and at least one exported name", () => {
    const targets = new Set(NAME_TABLE.map((e) => e.exerciseId));
    for (const id of ADDED_IDS) {
      const exercise = EXERCISES[id];
      expect(exercise, id).toBeDefined();
      expect(exercise.primaryMuscles.length, id).toBeGreaterThan(0);
      for (const m of [...exercise.primaryMuscles, ...exercise.secondaryMuscles, ...exercise.stabilizerMuscles]) {
        expect(isMuscleId(m), `${id}: ${m}`).toBe(true);
      }
      expect(exercise.type, id).toBeTruthy();
      if (exercise.type === "dumbbell") expect(exercise.grip, id).toBeDefined();
      else expect(exercise.grip, id).toBeUndefined();
      expect(MOTIONS[id], id).toBeDefined();
      expect(targets.has(id), id).toBe(true);
    }
  });

  it("are not program lifts or substitutes; only the loaded ones a lifter does as accessories are accessories", () => {
    const selectable = new Set(["db_fly", "db_bent_over_row", "cable_row", "leg_press", "incline_db_row"]);
    for (const id of ADDED_IDS) {
      expect(PROGRAM_LIFT_IDS.has(id), id).toBe(false);
      expect(EXERCISES[id].barbellEquivalent, id).toBeUndefined();
      expect(EXERCISES[id].dumbbellAlternative, id).toBeUndefined();
      expect(ACCESSORY_IDS.includes(id), id).toBe(selectable.has(id));
    }
  });
});
