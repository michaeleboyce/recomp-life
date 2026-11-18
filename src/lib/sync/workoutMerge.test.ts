import { describe, expect, it } from "vitest";
import { contentStampOf, mergeWorkoutPull, sameContent, watchDataFields } from "./workoutMerge";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "w1",
  clientId: "c-w1",
  sets: [{ id: "s1", actualReps: 3 }],
  updatedAt: 100,
  synced: true,
  ...overrides,
});
const WATCH = { externalId: "hk-1", avgHeartRate: 120 };

describe("contentStampOf", () => {
  it("is the row's stamp without watch data, or once the row was written again", () => {
    expect(contentStampOf(row())).toBe(100);
    expect(contentStampOf(row({ health: WATCH, updatedAt: 250 }))).toBe(250);
    const attached = { ...row(), ...watchDataFields(row(), WATCH, 250) };
    expect(contentStampOf({ ...attached, updatedAt: 300 })).toBe(300);
  });

  it("is the stamp from before the attach while the attach is the last write", () => {
    const attached = { ...row(), ...watchDataFields(row(), WATCH, 250) };
    expect(attached).toMatchObject({ updatedAt: 250, synced: false, health: { stamp: { row: 250, content: 100 } } });
    expect(contentStampOf(attached)).toBe(100);
    // Attached again on top of an attach: the log is still as old as it was.
    expect(contentStampOf({ ...attached, ...watchDataFields(attached, WATCH, 400) })).toBe(100);
  });

  it("ignores a stamp it cannot read", () => {
    expect(contentStampOf(row({ updatedAt: 250, health: { ...WATCH, stamp: { row: "250", content: 1 } } }))).toBe(250);
  });
});

describe("mergeWorkoutPull", () => {
  const corrected = row({ sets: [{ id: "s1", actualReps: 7 }], updatedAt: 200 });
  const withWatch = { ...row(), id: "other", ...watchDataFields(row(), WATCH, 250), synced: true };

  it("is the ordinary rule when one copy supplies everything", () => {
    expect(mergeWorkoutPull(row(), row({ updatedAt: 150 }), 151)).toEqual({ decision: "overwrite" });
    expect(mergeWorkoutPull(row({ updatedAt: 150 }), row(), 151)).toEqual({ decision: "keep" });
    expect(mergeWorkoutPull(row(), row(), 101)).toEqual({ decision: "keep" });
    expect(mergeWorkoutPull(row(), withWatch, 251)).toEqual({ decision: "overwrite" });
  });

  it("keeps a local correction and takes the server's watch data", () => {
    const merged = mergeWorkoutPull(corrected, withWatch, 251);
    expect(merged).toMatchObject({
      decision: "merge",
      row: {
        id: "w1",
        sets: [{ id: "s1", actualReps: 7 }],
        updatedAt: 251,
        synced: false,
        health: { externalId: "hk-1", stamp: { row: 251, content: 200 } },
      },
    });
  });

  it("takes the server's correction and keeps the local watch data", () => {
    const merged = mergeWorkoutPull({ ...withWatch, id: "w1" }, { ...corrected, updatedAt: 300 }, 301);
    expect(merged).toMatchObject({
      decision: "merge",
      row: { id: "w1", sets: [{ actualReps: 7 }], updatedAt: 301, synced: false, health: { stamp: { row: 301, content: 300 } } },
    });
  });

  it("sends a complete local copy out again when the server's stamp is newer", () => {
    const local = { ...corrected, health: WATCH };
    const merged = mergeWorkoutPull(local, withWatch, 251);
    expect(merged).toMatchObject({ decision: "merge", row: { sets: [{ actualReps: 7 }], updatedAt: 251, synced: false } });
  });

  it("settles: the merged row replaces the copy it was merged from", () => {
    const merged = mergeWorkoutPull(corrected, withWatch, 251);
    if (merged.decision !== "merge") throw new Error("expected a merge");
    expect(mergeWorkoutPull({ ...withWatch, id: "w1" }, { ...merged.row, synced: true }, 252)).toEqual({ decision: "overwrite" });
    expect(mergeWorkoutPull({ ...merged.row, synced: true }, { ...merged.row, synced: true }, 252)).toEqual({ decision: "keep" });
  });
});

describe("sameContent", () => {
  it("ignores id, synced, key order and absent-or-null fields, and reads dates as values", () => {
    const a = { id: "1", clientId: "c", synced: true, date: new Date(5), notes: "x", deletedAt: null };
    const b = { clientId: "c", notes: "x", date: new Date(5), id: "2", synced: false };
    expect(sameContent(a, b)).toBe(true);
    expect(sameContent(a, { ...b, notes: "y" })).toBe(false);
    expect(sameContent({ ...a, sets: [{ id: "s", reps: 1 }] }, { ...b, sets: [{ reps: 1, id: "s" }] })).toBe(true);
  });
});
