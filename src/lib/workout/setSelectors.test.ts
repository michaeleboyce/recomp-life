import { describe, it, expect } from "vitest";
import { excludeWarmUps, isWarmUpSet, workingSetsFor } from "./setSelectors";
import { makeSet } from "./testFixtures";

describe("isWarmUpSet", () => {
  it("is true only for tier warmup", () => {
    expect(isWarmUpSet(makeSet("squat", "warmup"))).toBe(true);
    expect(isWarmUpSet(makeSet("squat", "T1"))).toBe(false);
    expect(isWarmUpSet(makeSet("face_pulls", "accessory"))).toBe(false);
  });
});

describe("workingSetsFor", () => {
  it("excludes the exercise's own warm-up sets (D1)", () => {
    const warmUps = [45, 95, 135, 160].map((weight) =>
      makeSet("squat", "warmup", { weight })
    );
    const t1 = makeSet("squat", "T1", { weight: 190 });
    expect(workingSetsFor([...warmUps, t1], "squat", "T1")).toEqual([t1]);
  });

  it("returns the warm-up sets when asked for the warmup tier", () => {
    const warmUp = makeSet("squat", "warmup");
    const t1 = makeSet("squat", "T1");
    expect(workingSetsFor([warmUp, t1], "squat", "warmup")).toEqual([warmUp]);
  });

  it("separates the same exercise logged in two tiers", () => {
    const t1 = makeSet("squat", "T1");
    const t2 = makeSet("squat", "T2");
    expect(workingSetsFor([t1, t2], "squat", "T2")).toEqual([t2]);
  });

  it("excludes other exercises", () => {
    const squat = makeSet("squat", "T1");
    const bench = makeSet("bench", "T1");
    expect(workingSetsFor([squat, bench], "bench", "T1")).toEqual([bench]);
  });

  it("matches a substituted set by its template exerciseId, not the substitute id", () => {
    const set = makeSet("squat", "T1", {
      isSubstituted: true,
      substituteExerciseId: "bulgarian_split_squat",
    });
    expect(workingSetsFor([set], "squat", "T1")).toEqual([set]);
    expect(workingSetsFor([set], "bulgarian_split_squat", "T1")).toEqual([]);
  });

  it("keeps logging order and does not mutate the input", () => {
    const a = makeSet("squat", "T1", { setNumber: 1 });
    const b = makeSet("bench", "T2");
    const c = makeSet("squat", "T1", { setNumber: 2 });
    const input = [a, b, c];
    expect(workingSetsFor(input, "squat", "T1")).toEqual([a, c]);
    expect(input).toEqual([a, b, c]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(workingSetsFor([], "squat", "T1")).toEqual([]);
  });
});

describe("excludeWarmUps", () => {
  it("drops warm-up sets and keeps everything else in order", () => {
    const warmUp = makeSet("squat", "warmup");
    const t1 = makeSet("squat", "T1");
    const accessory = makeSet("face_pulls", "accessory");
    expect(excludeWarmUps([warmUp, t1, accessory])).toEqual([t1, accessory]);
  });
});
