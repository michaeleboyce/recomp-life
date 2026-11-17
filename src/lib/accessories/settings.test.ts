import { describe, expect, it } from "vitest";
import { sanitizeSettings } from "@/lib/data/settingsShape";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import {
  accessoryModeOf,
  accessoryPinsFor,
  sanitizeAccessoryPins,
  sanitizeAccessoryWeights,
  withAccessoryPin,
  withAccessoryWeight,
} from "./settings";

describe("accessory settings", () => {
  it("reads an absent or unknown mode as auto", () => {
    expect(accessoryModeOf({})).toBe("auto");
    expect(accessoryModeOf(null)).toBe("auto");
    expect(accessoryModeOf({ accessories: "sometimes" as never })).toBe("auto");
    expect(accessoryModeOf({ accessories: "ask" })).toBe("ask");
    expect(accessoryModeOf({ accessories: "none" })).toBe("none");
  });

  it("reads pins safely and in order", () => {
    expect(sanitizeAccessoryPins("A1")).toBeUndefined();
    expect(sanitizeAccessoryPins({ A1: ["b", "a", "b", 3, ""], B1: "x", A2: [] })).toEqual({ A1: ["b", "a"] });
    expect(accessoryPinsFor({ accessoryPins: { A1: ["b", "a"] } }, "A1")).toEqual(["b", "a"]);
    expect(accessoryPinsFor({ accessoryPins: { A1: "b" } as never }, "A1")).toEqual([]);
    expect(accessoryPinsFor(undefined, "A1")).toEqual([]);
  });

  it("pins at the end and unpins, dropping an empty day", () => {
    const one = withAccessoryPin(undefined, "A1", "face_pulls", true);
    const two = withAccessoryPin(one, "A1", "hack_squat", true);
    expect(two).toEqual({ A1: ["face_pulls", "hack_squat"] });
    expect(withAccessoryPin(two, "A1", "face_pulls", true)).toEqual({ A1: ["hack_squat", "face_pulls"] });
    expect(withAccessoryPin(one, "A1", "face_pulls", false)).toEqual({});
    expect(one).toEqual({ A1: ["face_pulls"] });
  });

  it("reads hand-set weights safely", () => {
    expect(sanitizeAccessoryWeights([])).toBeUndefined();
    expect(
      sanitizeAccessoryWeights({
        a: { weight: 50, setAt: 10 },
        b: { weight: -1, setAt: 10 },
        c: { weight: 50 },
        d: { weight: 40, setAt: new Date(20) },
        e: { weight: 30, setAt: "1970-01-01T00:00:00.030Z" },
        f: "heavy",
        g: { weight: Number.NaN, setAt: 1 },
      })
    ).toEqual({ a: { weight: 50, setAt: 10 }, d: { weight: 40, setAt: 20 }, e: { weight: 30, setAt: 30 } });
    expect(withAccessoryWeight({ a: { weight: 50, setAt: 10 } }, "a", null)).toEqual({});
    expect(withAccessoryWeight(undefined, "a", { weight: 5, setAt: 1 })).toEqual({ a: { weight: 5, setAt: 1 } });
  });

  it("sanitizeSettings keeps good values and drops bad ones (pull and backup restore)", () => {
    const defaults = DEFAULT_USER_PROFILE.settings;
    expect(sanitizeSettings({ ...defaults })).not.toHaveProperty("accessories");
    const good = sanitizeSettings({
      ...defaults,
      accessories: "ask",
      accessoryPins: { A1: ["face_pulls"] },
      accessoryWeights: { leg_curls: { weight: 80, setAt: 5 } },
    });
    expect(good).toMatchObject({
      accessories: "ask",
      accessoryPins: { A1: ["face_pulls"] },
      accessoryWeights: { leg_curls: { weight: 80, setAt: 5 } },
    });
    const bad = sanitizeSettings({ ...defaults, accessories: 7, accessoryPins: ["A1"], accessoryWeights: "x" });
    expect(bad).not.toHaveProperty("accessories");
    expect(bad).not.toHaveProperty("accessoryPins");
    expect(bad).not.toHaveProperty("accessoryWeights");
    expect(accessoryModeOf(bad)).toBe("auto");
  });
});
