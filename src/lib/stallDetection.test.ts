import { describe, it, expect } from "vitest";
import { detectFatLossStall } from "./stallDetection";
import type { TrainingPhase } from "@/types";

const cuttingPhase: TrainingPhase = { mode: "cutting", dailyDeficit: 750 };
const maintainingPhase: TrainingPhase = { mode: "maintaining" };

function makeWeights(weights: number[]): { date: Date; weight: number }[] {
  return weights.map((w, i) => ({
    date: new Date(2026, 1, i + 1),
    weight: w,
  }));
}

describe("detectFatLossStall", () => {
  it("returns null when not cutting", () => {
    const weights = makeWeights(Array(14).fill(200));
    expect(detectFatLossStall(weights, maintainingPhase)).toBeNull();
  });

  it("returns null with fewer than 14 entries", () => {
    const weights = makeWeights(Array(13).fill(200));
    expect(detectFatLossStall(weights, cuttingPhase)).toBeNull();
  });

  it("detects stall when weight is flat", () => {
    const weights = makeWeights(Array(14).fill(200));
    const result = detectFatLossStall(weights, cuttingPhase);
    expect(result?.detected).toBe(true);
    expect(result?.suggestions).toHaveLength(3);
  });

  it("detects stall when difference is < 0.3 lbs", () => {
    const prev = Array(7).fill(200.2);
    const curr = Array(7).fill(200);
    const weights = makeWeights([...prev, ...curr]);
    const result = detectFatLossStall(weights, cuttingPhase);
    expect(result?.detected).toBe(true);
  });

  it("returns null when losing weight normally", () => {
    const prev = Array(7).fill(200);
    const curr = Array(7).fill(199);
    const weights = makeWeights([...prev, ...curr]);
    expect(detectFatLossStall(weights, cuttingPhase)).toBeNull();
  });

  it("returns null when difference is exactly 0.3 lbs", () => {
    const prev = Array(7).fill(200.3);
    const curr = Array(7).fill(200);
    const weights = makeWeights([...prev, ...curr]);
    expect(detectFatLossStall(weights, cuttingPhase)).toBeNull();
  });
});
