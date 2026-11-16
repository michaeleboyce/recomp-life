import { describe, expect, it } from "vitest";
import { isMuscleId } from "@/lib/muscles";
import { GUESS_RULES, guessMuscles } from "./guess";

const primary = (name: string) => guessMuscles(name)?.primary;

describe("guessMuscles", () => {
  it("reads the muscle from the movement word", () => {
    expect(primary("Spider Curl")).toEqual(["biceps"]);
    expect(primary("Cable Crossover Fly")).toEqual(["chest"]);
    expect(primary("Cable Y Raise")).toContain("side_delts");
    expect(primary("Seated Calf Press")).toEqual(["calves"]);
  });

  it("lets a more specific phrase win over the movement word", () => {
    expect(primary("Standing Leg Curl")).toEqual(["hamstrings"]);
    expect(primary("Wrist Curl")).toEqual(["forearms"]);
    expect(primary("Rear Delt Raise Machine")).toEqual(["rear_delts"]);
    expect(primary("Cable Rear Delt Fly")).toEqual(["rear_delts"]);
    expect(primary("Hanging Leg Raise")).toEqual(["abs"]);
    expect(primary("Side Lying Leg Raise")).toEqual(["glutes"]);
    expect(primary("Glute Kickback Machine")).toEqual(["glutes"]);
    expect(primary("Cable Kickback")).toEqual(["triceps"]);
    expect(primary("Side Plank Bridge")).toEqual(["obliques"]);
    expect(primary("Upright Row Machine")).toContain("side_delts");
  });

  it("guesses presses by what is pressed", () => {
    expect(primary("Machine Shoulder Press")).toContain("front_delts");
    expect(primary("Decline Machine Chest Press")).toContain("chest");
    expect(primary("Single Leg Press")).toContain("quads");
  });

  it("guesses lower-body and core movements", () => {
    expect(primary("Front Squat")).toEqual(["quads", "glutes"]);
    expect(primary("Walking Lunge")).toEqual(["quads", "glutes"]);
    expect(primary("Sumo Deadlift")).toContain("glutes");
    expect(primary("Stiff Leg Deadlift")).toEqual(["hamstrings", "glutes"]);
    expect(primary("Frog Glute Bridge")).toEqual(["glutes"]);
    expect(primary("Hollow Body Hold")).toEqual(["abs"]);
    expect(primary("Russian Twist")).toEqual(["obliques"]);
    expect(primary("Superman Hold")).toEqual(["lower_back"]);
  });

  it("reads combined movements as both", () => {
    expect(primary("Dumbbell Thruster Squat to Press")).toEqual(["quads", "glutes", "front_delts"]);
    expect(primary("Curl to Press")).toEqual(["biceps", "front_delts"]);
  });

  it("returns no guess for words it does not know", () => {
    expect(guessMuscles("Burpee")).toBeNull();
    expect(guessMuscles("Morning Walk")).toBeNull();
    expect(guessMuscles("Zorblax Twirl")).toBeNull();
    expect(guessMuscles("")).toBeNull();
  });

  it("never lists a muscle as both primary and secondary", () => {
    for (const name of ["Spider Curl", "Close Grip Bench Press", "Pike Push Up", "Kettlebell Swing"]) {
      const g = guessMuscles(name)!;
      expect(g.primary.filter((m) => g.secondary.includes(m))).toEqual([]);
    }
  });

  it("uses real muscle ids in every rule, each with a primary muscle", () => {
    for (const rule of GUESS_RULES) {
      expect(rule.primary.length).toBeGreaterThan(0);
      for (const m of [...rule.primary, ...(rule.secondary ?? [])]) expect(isMuscleId(m), m).toBe(true);
    }
  });
});
