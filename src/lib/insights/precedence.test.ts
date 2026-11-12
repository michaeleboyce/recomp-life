import { describe, it, expect, vi } from "vitest";
import type { InsightContext } from "./index";

vi.mock("./rules/lossRate", () => ({
  lossRateInsights: () => [
    { id: "loss-rate", kind: "loss-rate", severity: "warning", title: "Weight loss slower than target", body: "x" },
  ],
}));
vi.mock("./rules/fatLossStall", () => ({
  fatLossStallInsights: (ctx: InsightContext) =>
    ctx.settings
      ? [{ id: "fat-loss-stall", kind: "fat-loss-stall", severity: "warning", title: "Weight loss stalled for 3 weeks", body: "y" }]
      : [],
}));

const { computeInsights } = await import("./index");
const { DEFAULT_USER_PROFILE } = await import("@/db/seed");

const base: InsightContext = {
  workouts: [],
  e1rms: [],
  bodyweight: [],
  runs: [],
  readiness: [],
  pain: [],
  liftStates: [],
  settings: { ...DEFAULT_USER_PROFILE.settings, morningWeighInReminder: false },
  unfinishedWorkout: null,
  now: new Date(2026, 10, 11, 12),
};

describe("fat-loss-stall precedence", () => {
  it("drops the loss-rate insight when a stall is reported", () => {
    expect(computeInsights(base).map((i) => i.kind)).toEqual(["fat-loss-stall"]);
  });

  it("keeps loss-rate when there is no stall", () => {
    expect(computeInsights({ ...base, settings: null }).map((i) => i.kind)).toEqual(["loss-rate"]);
  });
});
