import { describe, expect, it } from "vitest";
import { nameKey, nameTokens } from "./normalise";

describe("nameKey", () => {
  it("ignores case, punctuation and extra spaces", () => {
    expect(nameKey("  Dumbbell  BENCH press!! ")).toBe(nameKey("dumbbell bench press"));
    expect(nameKey("Single-Leg, Romanian/Deadlift")).toBe(nameKey("single leg romanian deadlift"));
  });

  it("ignores word order, so 'Bench Press (Dumbbell)' matches 'Dumbbell Bench Press'", () => {
    expect(nameKey("Bench Press (Dumbbell)")).toBe(nameKey("Dumbbell Bench Press"));
    expect(nameKey("Row, Incline Dumbbell")).toBe(nameKey("Incline Dumbbell Row"));
  });

  it("treats curly and straight apostrophes alike and drops them", () => {
    expect(nameKey("Farmer’s Walk")).toBe(nameKey("Farmer's Walk"));
    expect(nameKey("Farmer's Walk")).toBe(nameKey("Farmers Walk"));
    expect(nameKey("Farmer‘s Walk")).toBe(nameKey("Farmers Walk"));
  });

  it("treats non-breaking and other unusual spaces as spaces", () => {
    expect(nameKey("Goblet Squat")).toBe(nameKey("Goblet Squat"));
    expect(nameKey("Goblet Squat")).toBe(nameKey("Goblet Squat"));
    expect(nameKey("Goblet​Squat")).toBe(nameKey("Goblet Squat"));
    expect(nameKey("Goblet\tSquat\n")).toBe(nameKey("Goblet Squat"));
  });

  it("expands common abbreviations", () => {
    expect(nameKey("DB Row")).toBe(nameKey("Dumbbell Row"));
    expect(nameKey("BB Curl")).toBe(nameKey("Barbell Curl"));
    expect(nameKey("DB RDL")).toBe(nameKey("Dumbbell Romanian Deadlift"));
    expect(nameKey("OHP")).toBe(nameKey("Overhead Press"));
    expect(nameKey("KB Swing")).toBe(nameKey("Kettlebell Swing"));
    expect(nameKey("Dumbell Curl")).toBe(nameKey("Dumbbell Curl"));
  });

  it("treats plurals and singulars alike", () => {
    expect(nameKey("Hammer Curls")).toBe(nameKey("Hammer Curl"));
    expect(nameKey("Crunches")).toBe(nameKey("Crunch"));
    expect(nameKey("Biceps Curl")).toBe(nameKey("Bicep Curls"));
    expect(nameKey("Calves Raise")).toBe(nameKey("Calf Raise"));
    expect(nameKey("Dumbbell Flyes")).toBe(nameKey("Dumbbell Fly"));
    expect(nameKey("Dumbbell Flies")).toBe(nameKey("Dumbbell Fly"));
    expect(nameKey("Bench Presses")).toBe(nameKey("Bench Press"));
  });

  it("keeps words that only look plural", () => {
    expect(nameTokens("Bench Press")).toContain("press");
    expect(nameTokens("Ab Rollout")).toContain("ab");
    expect(nameTokens("Abs Circuit")).toContain("abs");
  });

  it("joins or splits compound words one way", () => {
    expect(nameKey("Lat Pull Down")).toBe(nameKey("Lat Pulldown"));
    expect(nameKey("Dumbbell Pull Over")).toBe(nameKey("Dumbbell Pullover"));
    expect(nameKey("Pushups")).toBe(nameKey("Push-Up"));
    expect(nameKey("Situps")).toBe(nameKey("Sit Up"));
    expect(nameKey("Pullup")).toBe(nameKey("Pull Up"));
    expect(nameKey("Skull Crushers")).toBe(nameKey("Skullcrusher"));
    expect(nameKey("Tricep Kick Backs")).toBe(nameKey("Tricep Kickback"));
  });

  it("drops filler words", () => {
    expect(nameKey("Curl with a Dumbbell")).toBe(nameKey("Dumbbell Curl"));
    expect(nameKey("Squat on the Box")).toBe(nameKey("Box Squat"));
  });

  it("keeps different exercises apart", () => {
    expect(nameKey("Dumbbell Bench Press")).not.toBe(nameKey("Barbell Bench Press"));
    expect(nameKey("Incline Bench Press")).not.toBe(nameKey("Bench Press"));
    expect(nameKey("Romanian Deadlift")).not.toBe(nameKey("Deadlift"));
  });

  it("returns an empty key for a blank or punctuation-only name", () => {
    expect(nameKey("")).toBe("");
    expect(nameKey("  -- ")).toBe("");
  });
});
