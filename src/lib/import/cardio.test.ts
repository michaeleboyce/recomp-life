import { describe, expect, it } from "vitest";
import { overlaps, planCardio, type TimedRow } from "./cardio";
import type { CardioRow } from "./records";

// Made-up sessions only.

const at = (hhmm: string) => new Date(`2023-04-01T${hhmm}:00Z`);

function walk(id: string, start: string, minutes: number): CardioRow {
  return {
    table: "activities",
    row: {
      id,
      clientId: id,
      date: at(start),
      kind: "walking",
      durationMinutes: minutes,
      style: null,
      distanceMiles: null,
      notes: "",
      perceivedEffort: null,
      sourceName: "Gravl",
      updatedAt: 0,
      deletedAt: null,
      synced: false,
    },
  };
}

const logged = (id: string, start: string, minutes: number, deletedAt: number | null = null): TimedRow => ({
  id,
  date: at(start),
  durationMinutes: minutes,
  deletedAt,
});

describe("overlaps", () => {
  it("is true when one starts before the other ends", () => {
    expect(overlaps(logged("a", "07:00", 30), logged("b", "07:20", 30))).toBe(true);
    expect(overlaps(logged("a", "07:20", 30), logged("b", "07:00", 30))).toBe(true);
    expect(overlaps(logged("a", "07:00", 60), logged("b", "07:10", 5))).toBe(true);
  });

  it("is false for back-to-back or separate sessions", () => {
    expect(overlaps(logged("a", "07:00", 30), logged("b", "07:30", 30))).toBe(false);
    expect(overlaps(logged("a", "07:00", 30), logged("b", "09:00", 30))).toBe(false);
  });

  it("gives a session with no length a minute, so two at the same moment overlap", () => {
    expect(overlaps(logged("a", "07:00", 0), logged("b", "07:00", 0))).toBe(true);
  });
});

describe("planCardio", () => {
  it("skips an imported walk that overlaps one already logged from Apple Health", () => {
    const plan = planCardio([walk("imp-1", "07:05", 30), walk("imp-2", "18:00", 20)], [logged("health-1", "07:00", 32)]);
    expect(plan.add.map((c) => c.row.id)).toEqual(["imp-2"]);
    expect(plan.overlapping).toBe(1);
  });

  it("adds the same walk exported by two apps once", () => {
    const plan = planCardio([walk("fitbod-1", "07:00", 30), walk("gravl-1", "07:01", 29)], []);
    expect(plan.add.map((c) => c.row.id)).toEqual(["fitbod-1"]);
    expect(plan.overlapping).toBe(1);
  });

  it("adds nothing on a second import of the same entries", () => {
    const first = planCardio([walk("imp-1", "07:00", 30)], []);
    const stored = first.add.map((c) => logged(c.row.id, "07:00", 30));
    const second = planCardio([walk("imp-1", "07:00", 30)], stored);
    expect(second.add).toEqual([]);
    expect(second.alreadyStored).toBe(1);
    expect(second.overlapping).toBe(0);
  });

  it("counts a deleted session's time as taken and never brings it back", () => {
    const plan = planCardio([walk("imp-1", "07:00", 30), walk("imp-2", "12:00", 30)], [
      logged("imp-1", "07:00", 30, 5),
      logged("manual-1", "12:10", 15, 9),
    ]);
    expect(plan.add).toEqual([]);
    expect(plan.alreadyStored).toBe(1);
    expect(plan.overlapping).toBe(1);
  });
});
