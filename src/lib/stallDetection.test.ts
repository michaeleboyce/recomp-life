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

  it("sorts its input: the same entries in any order give the same answer", () => {
    // Losing a pound a week; newest first would read as a gain if taken as given.
    const weights = makeWeights([...Array(7).fill(200), ...Array(7).fill(199)]);
    expect(detectFatLossStall([...weights].reverse(), cuttingPhase)).toBeNull();

    const flat = makeWeights([...Array(7).fill(200), ...Array(7).fill(200)]);
    expect(detectFatLossStall([...flat].reverse(), cuttingPhase)).toEqual(
      detectFatLossStall(flat, cuttingPhase)
    );
  });

  it("does not mutate its input", () => {
    const weights = makeWeights(Array(14).fill(200)).reverse();
    const first = weights[0].date;
    detectFatLossStall(weights, cuttingPhase);
    expect(weights[0].date).toBe(first);
  });

  it("counts two weigh-ins on one day as one day", () => {
    // 14 days losing 1 lb a week, plus a second weigh-in on each of the last 7 days.
    // Taken as 21 separate entries, the "last 14" would be the last week twice over
    // and look flat.
    const weights = makeWeights([...Array(7).fill(200), ...Array(7).fill(199)]);
    const repeats = weights.slice(7).map((w) => {
      const evening = new Date(w.date);
      evening.setHours(21);
      return { date: evening, weight: w.weight };
    });
    expect(detectFatLossStall([...weights, ...repeats], cuttingPhase)).toBeNull();
  });

  it("needs 14 separate days, not 14 entries", () => {
    const sevenDays = makeWeights(Array(7).fill(200));
    const doubled = sevenDays.flatMap((w) => {
      const evening = new Date(w.date);
      evening.setHours(21);
      return [w, { date: evening, weight: w.weight }];
    });
    expect(doubled).toHaveLength(14);
    expect(detectFatLossStall(doubled, cuttingPhase)).toBeNull();
  });
});
