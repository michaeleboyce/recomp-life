import { describe, it, expect } from "vitest";
import { applyPreferences, withPreferredAccessories } from "./exercisePreferences";

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
