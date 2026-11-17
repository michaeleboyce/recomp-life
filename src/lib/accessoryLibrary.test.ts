import { describe, expect, it } from "vitest";
import { ACCESSORY_IDS, DEFAULT_ACCESSORY_WEIGHTS, EXERCISES } from "./exercises";
import { getAccessoryRepRange } from "./accessories";
import { HOME_ACCESSORY_ALTERNATIVES } from "./workoutTemplates";
import { MOTIONS } from "./motion/motions";

/** Exercises added to the library for accessory selection (A1). */
const ADDED = [
  "hack_squat",
  "glute_kickback_machine",
  "barbell_incline_bench",
  "barbell_rdl",
  "machine_chest_fly",
  "machine_row",
  "incline_db_curl",
  "incline_hammer_curl",
];
/** Exercises first added for imported history and now also selectable as accessories. */
const PROMOTED = ["db_lunge", "leg_press", "db_fly", "db_bent_over_row", "cable_row"];

describe("accessory library additions (A1)", () => {
  it("adds each exercise as a selectable accessory with a starting weight and a figure", () => {
    for (const id of [...ADDED, ...PROMOTED]) {
      expect(EXERCISES[id], id).toBeDefined();
      expect(ACCESSORY_IDS, id).toContain(id);
      expect(DEFAULT_ACCESSORY_WEIGHTS[id], id).toBeGreaterThan(0);
      expect(MOTIONS[id], id).toBeDefined();
    }
  });

  it("gives dumbbell exercises a grip and others none", () => {
    for (const id of ADDED) {
      const e = EXERCISES[id];
      if (e.type === "dumbbell") expect(e.grip, id).toBeDefined();
      else expect(e.grip, id).toBeUndefined();
    }
  });

  it("names the specific muscles and equipment", () => {
    expect(EXERCISES.hack_squat).toMatchObject({ type: "machine", requiresGym: true, primaryMuscles: ["quads"] });
    expect(EXERCISES.glute_kickback_machine).toMatchObject({ type: "machine", primaryMuscles: ["glutes"] });
    expect(EXERCISES.barbell_incline_bench).toMatchObject({ type: "barbell", primaryMuscles: ["chest"] });
    expect(EXERCISES.barbell_rdl).toMatchObject({ type: "barbell", primaryMuscles: ["hamstrings", "glutes"] });
    expect(EXERCISES.machine_chest_fly).toMatchObject({ type: "machine", primaryMuscles: ["chest"] });
    expect(EXERCISES.machine_row).toMatchObject({ type: "machine", primaryMuscles: ["mid_back", "lats"] });
    expect(EXERCISES.incline_db_curl).toMatchObject({ type: "dumbbell", requiresGym: false, primaryMuscles: ["biceps"] });
    expect(EXERCISES.incline_hammer_curl.primaryMuscles).toEqual(["biceps", "forearms"]);
  });

  it("keeps the bodyweight exercises out of the accessory list", () => {
    for (const id of ["push_up", "bench_dip", "sit_up", "crunch"]) expect(ACCESSORY_IDS, id).not.toContain(id);
  });

  it("lists each accessory once", () => {
    expect(new Set(ACCESSORY_IDS).size).toBe(ACCESSORY_IDS.length);
  });
});

describe("home alternatives", () => {
  it("replace a gym-only accessory with an accessory that needs no gym", () => {
    for (const [gym, home] of Object.entries(HOME_ACCESSORY_ALTERNATIVES)) {
      expect(EXERCISES[gym].requiresGym, gym).toBe(true);
      expect(EXERCISES[home].requiresGym, home).toBe(false);
      expect(ACCESSORY_IDS, home).toContain(home);
    }
  });

  it("covers the new gym-only additions where one makes sense", () => {
    expect(HOME_ACCESSORY_ALTERNATIVES.hack_squat).toBe("db_lunge");
    expect(HOME_ACCESSORY_ALTERNATIVES.glute_kickback_machine).toBe("hip_thrust");
    expect(HOME_ACCESSORY_ALTERNATIVES.barbell_incline_bench).toBe("incline_db_press");
    expect(HOME_ACCESSORY_ALTERNATIVES.machine_chest_fly).toBe("db_fly");
    expect(HOME_ACCESSORY_ALTERNATIVES.machine_row).toBe("db_bent_over_row");
    expect(HOME_ACCESSORY_ALTERNATIVES.barbell_rdl).toBeUndefined();
  });
});

describe("getAccessoryRepRange for the library additions", () => {
  it("gives compound leg and barbell work 8-12", () => {
    for (const id of ["hack_squat", "pendulum_squat", "leg_press", "db_lunge", "barbell_rdl", "barbell_incline_bench"]) {
      expect(getAccessoryRepRange(id), id).toEqual({ min: 8, max: 12, sets: 3 });
    }
  });

  it("gives compound rows 10-12", () => {
    for (const id of ["machine_row", "cable_row", "db_bent_over_row", "incline_db_row"]) {
      expect(getAccessoryRepRange(id), id).toEqual({ min: 10, max: 12, sets: 3 });
    }
  });

  it("gives isolation work 12-15", () => {
    for (const id of ["machine_chest_fly", "db_fly", "incline_db_curl", "incline_hammer_curl", "glute_kickback_machine"]) {
      expect(getAccessoryRepRange(id), id).toEqual({ min: 12, max: 15, sets: 3 });
    }
  });
});
