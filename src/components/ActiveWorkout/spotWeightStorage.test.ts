import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSpotWeights, saveSpotWeights } from "./spotWeightStorage";

afterEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe("spot weight storage", () => {
  it("round-trips a workout's weights and removes them when empty", () => {
    saveSpotWeights("w1", { "0:2": 200 });
    expect(loadSpotWeights("w1")).toEqual({ "0:2": 200 });
    expect(loadSpotWeights("w2")).toEqual({});
    saveSpotWeights("w1", {});
    expect(sessionStorage.length).toBe(0);
  });

  it("ignores malformed data", () => {
    sessionStorage.setItem("recomp:spot-weights:w1", '{"0:1":"x","0:2":-5,"0:3":185}');
    expect(loadSpotWeights("w1")).toEqual({ "0:3": 185 });
    sessionStorage.setItem("recomp:spot-weights:w1", "not json");
    expect(loadSpotWeights("w1")).toEqual({});
  });

  it("never throws when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(loadSpotWeights("w1")).toEqual({});
    expect(() => saveSpotWeights("w1", { "0:1": 100 })).not.toThrow();
  });
});
