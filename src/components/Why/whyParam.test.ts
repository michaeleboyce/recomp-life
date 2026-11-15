import { afterEach, describe, expect, it } from "vitest";
import { parseWhyParam, setWhyInUrl, urlWithWhy, whyParamValue } from "./whyParam";

const at = (search: string, pathname = "/") => ({ pathname, search, hash: "" });

describe("why parameter", () => {
  afterEach(() => window.history.replaceState(null, "", "/"));

  it("reads an exercise and tier", () => {
    expect(parseWhyParam("squat:T1")).toEqual({ exerciseId: "squat", tier: "T1" });
    expect(parseWhyParam("lat_pulldown:T3")).toEqual({ exerciseId: "lat_pulldown", tier: "T3" });
  });

  it("ignores anything malformed", () => {
    for (const bad of [null, "", "squat", ":T1", "squat:T9", "../x:T1", "Squat:T1"]) {
      expect(parseWhyParam(bad)).toBeNull();
    }
  });

  it("round-trips through the address, keeping other values", () => {
    const target = { exerciseId: "bench", tier: "T2" as const };
    expect(whyParamValue(target)).toBe("bench:T2");
    expect(urlWithWhy(at("?from=today"), target)).toBe("/?from=today&why=bench:T2");
    expect(urlWithWhy(at("?why=bench:T2&from=today"), null)).toBe("/?from=today");
    expect(urlWithWhy(at("?why=bench:T2"), null)).toBe("/");
  });

  it("sets and clears the value in place, without a new history entry", () => {
    const before = window.history.length;
    setWhyInUrl({ exerciseId: "squat", tier: "T1" });
    expect(window.location.search).toBe("?why=squat:T1");
    setWhyInUrl(null);
    expect(window.location.search).toBe("");
    expect(window.history.length).toBe(before);
  });
});
