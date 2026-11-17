import { describe, expect, it } from "vitest";
import { joinList, plural, pluralGrouped } from "./text";

describe("plural", () => {
  it("uses the singular for exactly one", () => {
    expect(plural(1, "session")).toBe("1 session");
  });

  it("adds an s otherwise, zero included", () => {
    expect(plural(0, "set")).toBe("0 sets");
    expect(plural(3, "set")).toBe("3 sets");
  });

  it("takes an irregular plural", () => {
    expect(plural(2, "activity", "activities")).toBe("2 activities");
    expect(plural(1, "activity", "activities")).toBe("1 activity");
  });

  it("prints the number as is, without grouping", () => {
    expect(plural(11708, "set")).toBe("11708 sets");
  });
});

describe("pluralGrouped", () => {
  it("groups thousands", () => {
    expect(pluralGrouped(11708, "set")).toBe("11,708 sets");
    expect(pluralGrouped(1, "run")).toBe("1 run");
    expect(pluralGrouped(299, "activity", "activities")).toBe("299 activities");
  });
});

describe("joinList", () => {
  it("joins none, one, two and many items", () => {
    expect(joinList([])).toBe("");
    expect(joinList(["a"])).toBe("a");
    expect(joinList(["a", "b"])).toBe("a and b");
    expect(joinList(["a", "b", "c"])).toBe("a, b and c");
  });
});
