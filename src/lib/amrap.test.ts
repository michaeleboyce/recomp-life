import { describe, it, expect } from "vitest";
import { getAMRAPGuidance, T1_AMRAP_TARGET_REPS_IN_RESERVE } from "./amrap";

describe("getAMRAPGuidance", () => {
  it("tells T1 sets to stop a rep or two short of failure", () => {
    expect(T1_AMRAP_TARGET_REPS_IN_RESERVE).toBe("1-2");
    expect(getAMRAPGuidance("T1")).toBe(`Stop with ${T1_AMRAP_TARGET_REPS_IN_RESERVE} reps left`);
  });

  it("never names the rating by its abbreviation", () => {
    for (const tier of ["T1", "T3"] as const) {
      expect(getAMRAPGuidance(tier)).not.toMatch(/\b(RPE|RIR)\b/);
    }
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
