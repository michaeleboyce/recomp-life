import { describe, it, expect } from "vitest";
import { EXERCISES } from "@/lib/exercises";
import { swapCandidates } from "./swapCandidates";

const ids = (...args: Parameters<typeof swapCandidates>) =>
  swapCandidates(...args).map((exercise) => exercise.id);

describe("swapCandidates", () => {
  it("offers exercises that share a primary muscle, never the exercise itself", () => {
    const result = swapCandidates("bench", { location: "gym" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.map((e) => e.id)).not.toContain("bench");
    expect(result.map((e) => e.id)).toContain("db_bench");
    for (const candidate of result) {
      expect(
        candidate.primaryMuscles.some((m) => EXERCISES.bench.primaryMuscles.includes(m))
      ).toBe(true);
    }
  });

  it("puts the closest match first", () => {
    // DB bench shares bench's primary and both secondary muscles.
    const result = swapCandidates("bench", { location: "gym" });
    const shared = (id: string) =>
      EXERCISES[id].secondaryMuscles.filter((m) => EXERCISES.bench.secondaryMuscles.includes(m))
        .length;
    expect(shared(result[0].id)).toBe(Math.max(...result.map((e) => shared(e.id))));
  });

  it("offers only exercises that do not need a gym at home", () => {
    const home = swapCandidates("squat", { location: "home" });
    expect(home.length).toBeGreaterThan(0);
    expect(home.every((e) => !e.requiresGym)).toBe(true);

    const gym = ids("squat", { location: "gym" });
    expect(gym.length).toBeGreaterThanOrEqual(home.length);
  });

  it("drops blocked exercises and moves preferred ones to the front", () => {
    const plain = ids("bench", { location: "gym" });
    const last = plain[plain.length - 1];
    const result = ids("bench", {
      location: "gym",
      preferences: { db_bench: "blocked", [last]: "preferred" },
    });
    expect(result).not.toContain("db_bench");
    expect(result[0]).toBe(last);
  });

  it("leaves out exercises already in the workout", () => {
    expect(ids("bench", { location: "gym", exclude: ["db_bench"] })).not.toContain("db_bench");
  });

  it("returns nothing for an unknown exercise", () => {
    expect(swapCandidates("not_an_exercise", { location: "gym" })).toEqual([]);
  });
});
