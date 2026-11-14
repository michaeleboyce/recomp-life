import { describe, expect, it } from "vitest";
import type { Estimated1RM } from "@/types";
import { sessionPRs } from "./prs";

let n = 0;
function row(workoutSessionId: string, date: string, estimated1RM: number, exerciseId = "squat"): Estimated1RM {
  n += 1;
  return {
    id: `r${n}`,
    clientId: `r${n}`,
    date: new Date(date),
    exerciseId,
    workingWeight: 0,
    repsCompleted: 0,
    estimated1RM,
    workoutSessionId,
    synced: true,
  };
}

describe("sessionPRs", () => {
  it("is a PR when the session beats every earlier session (its own rows do not count)", () => {
    const rows = [row("w1", "2026-11-01T10:00", 220), row("w2", "2026-11-03T10:00", 230)];
    expect(sessionPRs("w2", rows)).toEqual([{ exerciseId: "squat", best: 230, previousBest: 220 }]);
  });

  it("the old comparison against a list that included the session itself never fired", () => {
    // Regression guard: comparing 230 with max(220, 230) is never "greater".
    const rows = [row("w1", "2026-11-01T10:00", 220), row("w2", "2026-11-03T10:00", 230)];
    expect(sessionPRs("w2", rows)).toHaveLength(1);
  });

  it("ignores later sessions, so a past PR stays a PR", () => {
    const rows = [
      row("w1", "2026-11-01T10:00", 220),
      row("w2", "2026-11-03T10:00", 230),
      row("w3", "2026-11-05T10:00", 240),
    ];
    expect(sessionPRs("w2", rows).map((p) => p.best)).toEqual([230]);
  });

  it("is not a PR when it ties or falls short of an earlier best", () => {
    const rows = [row("w1", "2026-11-01T10:00", 230), row("w2", "2026-11-03T10:00", 230)];
    expect(sessionPRs("w2", rows)).toEqual([]);
  });

  it("the first estimate of a lift is not a PR", () => {
    expect(sessionPRs("w1", [row("w1", "2026-11-01T10:00", 200)])).toEqual([]);
  });

  it("uses the session's best row per lift and judges each lift on its own", () => {
    const rows = [
      row("w1", "2026-11-01T10:00", 220),
      row("w1", "2026-11-01T10:00", 150, "bench"),
      row("w2", "2026-11-03T10:00", 210),
      row("w2", "2026-11-03T10:05", 225),
      row("w2", "2026-11-03T10:10", 140, "bench"),
    ];
    expect(sessionPRs("w2", rows)).toEqual([{ exerciseId: "squat", best: 225, previousBest: 220 }]);
  });

  it("returns nothing for a session without estimates", () => {
    expect(sessionPRs("none", [row("w1", "2026-11-01T10:00", 220)])).toEqual([]);
  });
});
