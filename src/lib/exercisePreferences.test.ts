import { describe, it, expect } from "vitest";
import {
  applyPreferences,
  withPreferredAccessories,
  getPreference,
  resolvePreferences,
  getScopedPreference,
  setScopedPreference,
  isLocationOverride,
} from "./exercisePreferences";
import type { ExercisePreferences, LocationExercisePreferences } from "@/types";

const DAY = ["face_pulls", "lateral_raises", "leg_curls", "ab_rollout"];
const ALL = [...DAY, "incline_db_press", "pendulum_squat", "glute_drive", "bicep_curls"];

describe("applyPreferences", () => {
  it("drops blocked exercises and moves preferred ones to the front", () => {
    expect(
      applyPreferences(DAY, { leg_curls: "blocked", ab_rollout: "preferred" })
    ).toEqual(["ab_rollout", "face_pulls", "lateral_raises"]);
  });
});

describe("withPreferredAccessories", () => {
  it("returns the day's list unchanged when nothing is preferred", () => {
    expect(withPreferredAccessories(DAY, {}, ALL)).toEqual(DAY);
    expect(withPreferredAccessories(DAY, undefined, ALL)).toEqual(DAY);
  });

  it("offers preferred accessories that are not on the day's list", () => {
    const result = withPreferredAccessories(
      DAY,
      { incline_db_press: "preferred", pendulum_squat: "preferred" },
      ALL
    );
    expect(result).toContain("incline_db_press");
    expect(result).toContain("pendulum_squat");
    for (const id of DAY) expect(result).toContain(id);
  });

  it("puts preferred exercises first, in catalogue order, then the rest of the day", () => {
    const result = withPreferredAccessories(
      DAY,
      { pendulum_squat: "preferred", incline_db_press: "preferred", ab_rollout: "preferred" },
      ALL
    );
    expect(result).toEqual([
      "ab_rollout",
      "incline_db_press",
      "pendulum_squat",
      "face_pulls",
      "lateral_raises",
      "leg_curls",
    ]);
  });

  it("has no duplicates when a preferred exercise is already on the day's list", () => {
    const result = withPreferredAccessories(DAY, { face_pulls: "preferred" }, ALL);
    expect(result).toEqual(DAY);
    expect(new Set(result).size).toBe(result.length);
  });

  it("still drops blocked exercises", () => {
    const result = withPreferredAccessories(
      DAY,
      { leg_curls: "blocked", glute_drive: "preferred" },
      ALL
    );
    expect(result).not.toContain("leg_curls");
    expect(result[0]).toBe("glute_drive");
  });

  it("ignores preferences for ids that are not accessories", () => {
    const result = withPreferredAccessories(DAY, { squat: "preferred" }, ALL);
    expect(result).toEqual(DAY);
  });
});

describe("scoped preferences (overall, gym, home)", () => {
  const overall: ExercisePreferences = { face_pulls: "preferred", leg_curls: "blocked" };

  it("resolvePreferences returns the overall set when there are no overrides", () => {
    expect(resolvePreferences(overall, undefined, "gym")).toEqual(overall);
    expect(resolvePreferences(undefined, undefined, "home")).toEqual({});
  });

  it("a location override wins over the overall preference, for that location only", () => {
    const byLocation: LocationExercisePreferences = {
      gym: { pendulum_squat: "preferred", face_pulls: "normal" },
    };
    const gym = resolvePreferences(overall, byLocation, "gym");
    expect(gym.pendulum_squat).toBe("preferred");
    expect(getPreference(gym, "face_pulls")).toBe("normal");
    expect(gym.leg_curls).toBe("blocked");

    const home = resolvePreferences(overall, byLocation, "home");
    expect(home.pendulum_squat).toBeUndefined();
    expect(home.face_pulls).toBe("preferred");
  });

  it("getScopedPreference reads overall for 'all' and the resolved value for a location", () => {
    const byLocation: LocationExercisePreferences = { home: { db_pullover: "preferred" } };
    expect(getScopedPreference(overall, byLocation, "all", "db_pullover")).toBe("normal");
    expect(getScopedPreference(overall, byLocation, "home", "db_pullover")).toBe("preferred");
    expect(getScopedPreference(overall, byLocation, "gym", "db_pullover")).toBe("normal");
    expect(getScopedPreference(overall, byLocation, "gym", "face_pulls")).toBe("preferred");
  });

  it("setting with scope 'all' edits the overall set and leaves overrides alone", () => {
    const byLocation: LocationExercisePreferences = { gym: { glute_drive: "preferred" } };
    const next = setScopedPreference(overall, byLocation, "all", "incline_db_press", "preferred");
    expect(next.overall.incline_db_press).toBe("preferred");
    expect(next.byLocation).toEqual(byLocation);
    // "normal" is stored as absence
    const cleared = setScopedPreference(next.overall, byLocation, "all", "incline_db_press", "normal");
    expect("incline_db_press" in cleared.overall).toBe(false);
  });

  it("setting with a location scope stores an override only for that location", () => {
    const next = setScopedPreference(overall, undefined, "gym", "pendulum_squat", "preferred");
    expect(next.overall).toEqual(overall);
    expect(next.byLocation.gym).toEqual({ pendulum_squat: "preferred" });
    expect(next.byLocation.home ?? {}).toEqual({});
    expect(isLocationOverride(next.byLocation, "gym", "pendulum_squat")).toBe(true);
    expect(isLocationOverride(next.byLocation, "home", "pendulum_squat")).toBe(false);
  });

  it("blocked can be scoped to one location too", () => {
    const next = setScopedPreference({}, undefined, "home", "ab_rollout", "blocked");
    expect(
      withPreferredAccessories(DAY, resolvePreferences(next.overall, next.byLocation, "home"), ALL)
    ).not.toContain("ab_rollout");
    expect(
      withPreferredAccessories(DAY, resolvePreferences(next.overall, next.byLocation, "gym"), ALL)
    ).toContain("ab_rollout");
  });

  it("an override can turn off an overall preference at one location", () => {
    const next = setScopedPreference(overall, undefined, "home", "face_pulls", "normal");
    expect(next.byLocation.home).toEqual({ face_pulls: "normal" });
    expect(
      getPreference(resolvePreferences(next.overall, next.byLocation, "home"), "face_pulls")
    ).toBe("normal");
    expect(
      getPreference(resolvePreferences(next.overall, next.byLocation, "gym"), "face_pulls")
    ).toBe("preferred");
  });

  it("choosing the same value as overall removes the override", () => {
    const start: LocationExercisePreferences = { home: { face_pulls: "normal" } };
    const next = setScopedPreference(overall, start, "home", "face_pulls", "preferred");
    expect(next.byLocation.home ?? {}).toEqual({});
  });

  it("does not mutate its inputs", () => {
    const o: ExercisePreferences = { face_pulls: "preferred" };
    const b: LocationExercisePreferences = { gym: { glute_drive: "preferred" } };
    setScopedPreference(o, b, "gym", "face_pulls", "blocked");
    expect(o).toEqual({ face_pulls: "preferred" });
    expect(b).toEqual({ gym: { glute_drive: "preferred" } });
  });

  it("a gym-only preferred accessory is offered at the gym and not at home", () => {
    const byLocation: LocationExercisePreferences = { gym: { pendulum_squat: "preferred" } };
    const ids = ["face_pulls", "pendulum_squat"];
    expect(
      withPreferredAccessories(["face_pulls"], resolvePreferences({}, byLocation, "gym"), ids)
    ).toEqual(["pendulum_squat", "face_pulls"]);
    expect(
      withPreferredAccessories(["face_pulls"], resolvePreferences({}, byLocation, "home"), ids)
    ).toEqual(["face_pulls"]);
  });
});
