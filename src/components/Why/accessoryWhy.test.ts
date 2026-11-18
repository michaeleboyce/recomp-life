import { describe, expect, it } from "vitest";
import { ACCESSORY_HABIT_WEIGHT, ACCESSORY_RECOVERY_PENALTY, type AccessoryCandidate } from "@/lib/accessories/index";
import { basisTitle, lastTimeText, rankText, scorePartLines, signed } from "./accessoryWhy";

const parts = { pinned: 0, preferred: 0, habit: 18.24, shortfall: 10, dayFit: 12, recovery: -8, spread: 0 };
const pick = (exerciseId: string): AccessoryCandidate => ({ exerciseId, score: 1, parts, reasons: [] });

describe("accessory why", () => {
  it("lists every part of the score in the rule's order, with its cap", () => {
    const lines = scorePartLines(parts);
    expect(lines.map((l) => l.key)).toEqual(["pinned", "preferred", "habit", "shortfall", "dayFit", "recovery", "spread"]);
    expect(lines[2]).toMatchObject({ value: 18.24, cap: ACCESSORY_HABIT_WEIGHT, penalty: false });
    expect(lines[5]).toMatchObject({ value: -8, cap: ACCESSORY_RECOVERY_PENALTY, penalty: true });
  });

  it("words numbers, the basis, last time and the rank", () => {
    expect([signed(18.24), signed(-8), signed(0)]).toEqual(["+18.2", "−8", "0"]);
    expect(basisTitle({ basis: "progression", verdict: "up" })).toBe("Up one step");
    expect(basisTitle({ basis: "progression", verdict: "same" })).toBe("Same weight");
    expect(basisTitle({ basis: "hand" })).toBe("Set by you");
    expect(basisTitle({ basis: "none" })).toBe("No weight yet");
    const date = new Date(2026, 10, 10, 18);
    expect(lastTimeText({ last: { date, weight: 25, reps: [15, 15, 14] } }, new Date(2026, 10, 17))).toBe(
      "Last time, Nov 10: 25 lb × 15, 15, 14"
    );
    expect(lastTimeText({})).toBeNull();
    const ranked = ["a", "b", "c"].map(pick);
    expect(rankText(ranked[1], ranked)).toBe("2nd of 3 for today");
    expect(rankText(pick("z"), ranked)).toBeNull();
  });
});
