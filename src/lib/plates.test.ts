import { describe, expect, it } from "vitest";
import { calculatePlatesPerSide, describePlateLoad, loadedWeight } from "./plates";

const STANDARD = [45, 35, 25, 10, 5, 2.5];

describe("calculatePlatesPerSide", () => {
  it("returns nothing for the bare bar or less", () => {
    expect(calculatePlatesPerSide(45, 45, STANDARD)).toEqual([]);
    expect(calculatePlatesPerSide(20, 45, STANDARD)).toEqual([]);
  });

  it("loads exact weights heaviest plate first", () => {
    expect(calculatePlatesPerSide(245, 45, STANDARD)).toEqual([
      { plate: 45, count: 2 },
      { plate: 10, count: 1 },
    ]);
    expect(calculatePlatesPerSide(135, 45, STANDARD)).toEqual([{ plate: 45, count: 1 }]);
    expect(calculatePlatesPerSide(190, 45, STANDARD)).toEqual([
      { plate: 45, count: 1 },
      { plate: 25, count: 1 },
      { plate: 2.5, count: 1 },
    ]);
  });

  it("does not depend on the order the plates are listed in", () => {
    expect(calculatePlatesPerSide(245, 45, [2.5, 10, 45, 5, 25, 35])).toEqual(
      calculatePlatesPerSide(245, 45, STANDARD)
    );
  });

  it("uses the bar weight it is given", () => {
    expect(calculatePlatesPerSide(95, 35, STANDARD)).toEqual([
      { plate: 25, count: 1 },
      { plate: 5, count: 1 },
    ]);
  });
});

describe("describePlateLoad", () => {
  it("lists each plate on one side and reports an exact load", () => {
    expect(describePlateLoad(245, 45, STANDARD)).toEqual({
      perSide: [
        { plate: 45, count: 2 },
        { plate: 10, count: 1 },
      ],
      plates: [45, 45, 10],
      loadableWeight: 245,
      exact: true,
    });
  });

  it("falls back to the closest loadable weight below an unloadable target", () => {
    // 247 needs 101 per side; the smallest plate is 2.5, so 100 per side is loaded.
    const load = describePlateLoad(247, 45, STANDARD);
    expect(load.plates).toEqual([45, 45, 10]);
    expect(load.loadableWeight).toBe(245);
    expect(load.exact).toBe(false);
  });

  it("respects the smallest available plate", () => {
    // 190 needs 72.5 per side; without 2.5 lb plates only 70 can be loaded.
    const load = describePlateLoad(190, 45, [45, 25, 10, 5]);
    expect(load.plates).toEqual([45, 25]);
    expect(load.loadableWeight).toBe(185);
    expect(load.exact).toBe(false);
  });

  it("is the bare bar when the target is at or below the bar weight", () => {
    expect(describePlateLoad(45, 45, STANDARD)).toEqual({
      perSide: [],
      plates: [],
      loadableWeight: 45,
      exact: true,
    });
    expect(describePlateLoad(30, 45, STANDARD)).toMatchObject({
      plates: [],
      loadableWeight: 45,
      exact: false,
    });
  });
});

describe("loadedWeight", () => {
  it("is the bar plus both sides", () => {
    expect(
      loadedWeight(
        [
          { plate: 45, count: 2 },
          { plate: 10, count: 1 },
        ],
        45
      )
    ).toBe(245);
    expect(loadedWeight([], 45)).toBe(45);
  });
});
