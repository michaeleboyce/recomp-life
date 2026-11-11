import { describe, it, expect } from "vitest";
import {
  REST_SECONDS,
  CUTTING_REST_BONUS_SECONDS,
  getRestSeconds,
  hasCuttingRestBonus,
  getRestEvidenceId,
  formatRestDuration,
} from "./restTimes";
import type { TrainingPhase } from "@/types";

const cutting: TrainingPhase = { mode: "cutting" };
const maintaining: TrainingPhase = { mode: "maintaining" };
const bulking: TrainingPhase = { mode: "bulking" };

describe("getRestSeconds", () => {
  it("rests 3:00 after T1 and 2:00 after T2", () => {
    expect(getRestSeconds("T1", maintaining)).toBe(180);
    expect(getRestSeconds("T2", maintaining)).toBe(120);
  });

  it("rests 90 seconds after T3 and accessory sets (above the 60 s threshold)", () => {
    expect(getRestSeconds("T3", maintaining)).toBe(90);
    expect(getRestSeconds("accessory", maintaining)).toBe(90);
  });

  it("rests 60 seconds after warm-up sets", () => {
    expect(getRestSeconds("warmup", maintaining)).toBe(60);
  });

  it("adds 30 seconds to T1 and T2 when cutting", () => {
    expect(getRestSeconds("T1", cutting)).toBe(180 + CUTTING_REST_BONUS_SECONDS);
    expect(getRestSeconds("T2", cutting)).toBe(120 + CUTTING_REST_BONUS_SECONDS);
  });

  it("does not add the cutting bonus to T3, accessory or warm-up sets", () => {
    expect(getRestSeconds("T3", cutting)).toBe(REST_SECONDS.T3);
    expect(getRestSeconds("accessory", cutting)).toBe(REST_SECONDS.accessory);
    expect(getRestSeconds("warmup", cutting)).toBe(REST_SECONDS.warmup);
  });

  it("uses base rest when bulking or when no phase is given", () => {
    expect(getRestSeconds("T1", bulking)).toBe(180);
    expect(getRestSeconds("T1")).toBe(180);
  });
});

describe("hasCuttingRestBonus", () => {
  it("is true only for T1/T2 while cutting", () => {
    expect(hasCuttingRestBonus("T1", cutting)).toBe(true);
    expect(hasCuttingRestBonus("T2", cutting)).toBe(true);
    expect(hasCuttingRestBonus("T3", cutting)).toBe(false);
    expect(hasCuttingRestBonus("T1", maintaining)).toBe(false);
    expect(hasCuttingRestBonus("T1")).toBe(false);
  });
});

describe("getRestEvidenceId", () => {
  it("maps heavy tiers to rest-heavy and light tiers to rest-light", () => {
    expect(getRestEvidenceId("T1")).toBe("rest-heavy");
    expect(getRestEvidenceId("T2")).toBe("rest-heavy");
    expect(getRestEvidenceId("T3")).toBe("rest-light");
    expect(getRestEvidenceId("accessory")).toBe("rest-light");
  });

  it("returns null for warm-ups", () => {
    expect(getRestEvidenceId("warmup")).toBeNull();
  });
});

describe("formatRestDuration", () => {
  it("formats seconds as m:ss", () => {
    expect(formatRestDuration(180)).toBe("3:00");
    expect(formatRestDuration(90)).toBe("1:30");
    expect(formatRestDuration(210)).toBe("3:30");
    expect(formatRestDuration(5)).toBe("0:05");
  });
});
