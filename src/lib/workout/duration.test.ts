// @vitest-environment node
import { describe, expect, it } from "vitest";
import { estimateWorkoutMinutes as todayExport } from "@/components/Today/format";
import { SESSION_LENGTH_MODEL } from "@/lib/forecast/coefficients";
import { CUTTING_REST_BONUS_SECONDS, REST_SECONDS } from "@/lib/restTimes";
import {
  estimateLoggedSeconds,
  estimateSetSeconds,
  estimateWorkoutMinutes,
  estimateWorkoutSeconds,
} from "./duration";
import { makeEntry, makeSets } from "./testFixtures";

const SET = SESSION_LENGTH_MODEL.secondsPerSet;

const plan = [
  makeEntry({}),
  makeEntry({ exerciseId: "bench", tier: "T2", targetSets: 3, targetReps: 10, isAMRAP: false }),
  makeEntry({ exerciseId: "lat_pulldown", tier: "T3", targetSets: 3, targetReps: 15 }),
];

describe("estimateSetSeconds", () => {
  it("is the tier's rest plus the time a set takes", () => {
    expect(estimateSetSeconds("T1")).toBe(REST_SECONDS.T1 + SET);
    expect(estimateSetSeconds("T3")).toBe(REST_SECONDS.T3 + SET);
    expect(estimateSetSeconds("warmup")).toBe(REST_SECONDS.warmup + SET);
  });

  it("includes the longer rest of a cut on the heavy tiers", () => {
    const cutting = { mode: "cutting" as const };
    expect(estimateSetSeconds("T1", cutting)).toBe(
      REST_SECONDS.T1 + CUTTING_REST_BONUS_SECONDS + SET
    );
    expect(estimateSetSeconds("T3", cutting)).toBe(REST_SECONDS.T3 + SET);
  });
});

describe("estimateWorkoutSeconds", () => {
  it("adds every planned set with the rest after it", () => {
    // 5 x (180 + 45) + 3 x (120 + 45) + 3 x (90 + 45) = 2025
    expect(estimateWorkoutSeconds(plan)).toBe(2025);
  });

  it("is longer in a cut", () => {
    expect(estimateWorkoutSeconds(plan, { mode: "cutting" })).toBe(
      2025 + 8 * CUTTING_REST_BONUS_SECONDS
    );
  });

  it("counts an entry with no sets, or a negative count, as nothing", () => {
    expect(estimateWorkoutSeconds([])).toBe(0);
    expect(estimateWorkoutSeconds([makeEntry({ targetSets: -2 })])).toBe(0);
  });
});

describe("estimateLoggedSeconds", () => {
  it("gives logged sets the same time the plan would", () => {
    const sets = [
      ...makeSets("squat", "T1", 5, 3),
      ...makeSets("bench", "T2", 3, 10),
      ...makeSets("lat_pulldown", "T3", 3, 15),
    ];
    expect(estimateLoggedSeconds(sets)).toBe(estimateWorkoutSeconds(plan));
    expect(estimateLoggedSeconds(sets.slice(0, 5))).toBe(5 * (REST_SECONDS.T1 + SET));
    expect(estimateLoggedSeconds([])).toBe(0);
  });
});

describe("estimateWorkoutMinutes", () => {
  it("rounds the plan's length to 5 minutes", () => {
    // 2025 s = 33.75 min
    expect(estimateWorkoutMinutes(plan)).toBe(35);
  });

  it("is at least 5 minutes", () => {
    expect(estimateWorkoutMinutes([])).toBe(5);
  });

  it("is what the Today screen's helper re-exports", () => {
    expect(todayExport).toBe(estimateWorkoutMinutes);
  });
});
