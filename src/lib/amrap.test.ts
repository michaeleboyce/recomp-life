import { describe, it, expect } from "vitest";
import { getAMRAPGuidance, T1_AMRAP_TARGET_RPE } from "./amrap";

describe("getAMRAPGuidance", () => {
  it("tells T1 sets to stop about one rep short of failure", () => {
    expect(getAMRAPGuidance("T1")).toContain("1 rep left");
    expect(getAMRAPGuidance("T1")).toContain(`RPE ${T1_AMRAP_TARGET_RPE}`);
  });

  it("tells T3 sets to push close to failure", () => {
    expect(getAMRAPGuidance("T3")).toMatch(/close to failure/i);
  });

  it("has no guidance for tiers without AMRAP sets", () => {
    expect(getAMRAPGuidance("T2")).toBeNull();
    expect(getAMRAPGuidance("warmup")).toBeNull();
    expect(getAMRAPGuidance("accessory")).toBeNull();
  });
});
