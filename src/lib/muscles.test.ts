import { describe, it, expect } from "vitest";
import {
  MUSCLE_IDS,
  MUSCLE_LABELS,
  MUSCLE_GROUPS,
  MUSCLE_GROUP_ORDER,
  MUSCLE_VIEW,
  groupOf,
  formatMuscle,
  isMuscleId,
} from "./muscles";

describe("muscle metadata (R1)", () => {
  it("defines 19 unique muscles", () => {
    expect(MUSCLE_IDS).toHaveLength(19);
    expect(new Set(MUSCLE_IDS).size).toBe(19);
  });

  it("every muscle has a label and a view", () => {
    for (const id of MUSCLE_IDS) {
      expect(MUSCLE_LABELS[id]).toBeTruthy();
      expect(["front", "back", "both"]).toContain(MUSCLE_VIEW[id]);
    }
  });

  it("every muscle belongs to exactly one display group", () => {
    const counts = new Map<string, number>();
    for (const members of Object.values(MUSCLE_GROUPS)) {
      for (const m of members) counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    for (const id of MUSCLE_IDS) {
      expect(counts.get(id)).toBe(1);
    }
  });

  it("group order lists every group once", () => {
    expect([...MUSCLE_GROUP_ORDER].sort()).toEqual(
      Object.keys(MUSCLE_GROUPS).sort()
    );
  });

  it("groupOf resolves members to their group", () => {
    expect(groupOf("front_delts")).toBe("Shoulders");
    expect(groupOf("mid_back")).toBe("Back");
    expect(groupOf("obliques")).toBe("Core");
    expect(groupOf("biceps")).toBe("Biceps");
    expect(groupOf("triceps")).toBe("Triceps");
  });

  it("formats labels for display", () => {
    expect(formatMuscle("front_delts")).toBe("Front Delts");
    expect(formatMuscle("lower_back")).toBe("Lower Back");
  });

  it("isMuscleId rejects pain regions", () => {
    expect(isMuscleId("quads")).toBe(true);
    expect(isMuscleId("left_elbow")).toBe(false);
    expect(isMuscleId("core")).toBe(false);
  });
});
