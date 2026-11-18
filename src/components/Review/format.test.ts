import { describe, expect, it } from "vitest";
import { bestFromText, liftSessionsText } from "./format";

const row = (sessions: number, homeSessions: number, importedSessions: number) => ({
  sessions,
  homeSessions,
  importedSessions,
});

describe("weekly review lift row words", () => {
  it("says how many sessions, how many at home and how many imported", () => {
    expect(liftSessionsText(row(0, 0, 0))).toBe("0 sessions");
    expect(liftSessionsText(row(3, 0, 0))).toBe("3 sessions");
    expect(liftSessionsText(row(2, 1, 0))).toBe("2 sessions, 1 at home");
    expect(liftSessionsText(row(3, 1, 1))).toBe("3 sessions, 1 at home, 1 imported");
    expect(liftSessionsText(row(1, 0, 1))).toBe("1 session, 1 imported");
  });

  it("names the home version the best came from, and nothing for the lift's own", () => {
    expect(bestFromText({ bestFrom: "db_bench" })).toBe("Best from DB Bench Press");
    expect(bestFromText({ bestFrom: null })).toBeNull();
  });
});
