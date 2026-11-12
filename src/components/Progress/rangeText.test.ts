import { describe, expect, it } from "vitest";
import { rangeSuffix } from "./rangeText";

const WEEK = 7 * 86_400_000;

describe("rangeSuffix", () => {
  it("names the whole weeks between the first and last point, at least one", () => {
    expect(rangeSuffix([])).toBe("");
    expect(rangeSuffix([{ t: 0, v: 1 }])).toBe("");
    expect(rangeSuffix([{ t: 0, v: 1 }, { t: 8 * WEEK, v: 2 }])).toBe("in 8 wk");
    expect(rangeSuffix([{ t: 0, v: 1 }, { t: 2 * 86_400_000, v: 2 }])).toBe("in 1 wk");
  });
});
