import { describe, expect, it } from "vitest";
import { backTarget, fromForPage, withFrom } from "./backTarget";

describe("backTarget", () => {
  it("maps known values", () => {
    expect(backTarget("today").href).toBe("/");
    expect(backTarget("body").href).toBe("/progress?tab=body");
    expect(backTarget("cardio").href).toBe("/progress?tab=runs");
    expect(backTarget("log", "today").href).toBe("/log");
  });

  it("uses the fallback for missing or unknown values", () => {
    expect(backTarget(null).href).toBe("/");
    expect(backTarget("https://example.com").href).toBe("/");
    expect(backTarget("//evil.test", "log").href).toBe("/log");
    expect(backTarget("__proto__").href).toBe("/");
    expect(backTarget("toString").href).toBe("/");
  });
});

describe("fromForPage and withFrom", () => {
  it("names the start points", () => {
    expect(fromForPage("/", null)).toBe("today");
    expect(fromForPage("/progress", "body")).toBe("body");
    expect(fromForPage("/progress", "runs")).toBe("cardio");
    expect(fromForPage("/progress", null)).toBe("progress");
    expect(fromForPage("/weigh-in", null)).toBeNull();
  });

  it("adds from only when known", () => {
    expect(withFrom("/weigh-in", "body")).toBe("/weigh-in?from=body");
    expect(withFrom("/weigh-in", null)).toBe("/weigh-in");
  });
});
