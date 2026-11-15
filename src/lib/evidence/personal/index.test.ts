import { describe, expect, it } from "vitest";
import { getAllRules, getRule } from "@/lib/evidence";
import {
  PERSONAL_MIN_GROUP_SIZE,
  PERSONAL_RULE_IDS,
  VERDICT_LABELS,
  formatSignedReps,
  hasPersonalEvidence,
  personalEvidenceFor,
} from "./index";
import { constructedHistory, emptyLog } from "./testHelpers";

const NOW = new Date("2026-11-15T12:00:00Z");

describe("personalEvidenceFor", () => {
  it("covers rest length, a run the day before and short sleep, each a real active rule", () => {
    expect(PERSONAL_RULE_IDS).toEqual(["rest-heavy", "run-interference", "readiness"]);
    for (const id of PERSONAL_RULE_IDS) {
      expect(getRule(id).status).toBe("active");
    }
  });

  it("is null for every other rule", () => {
    for (const rule of getAllRules()) {
      if (hasPersonalEvidence(rule.id)) continue;
      expect(personalEvidenceFor(rule.id, constructedHistory(NOW), NOW)).toBeNull();
    }
  });

  describe("the sample guard", () => {
    it("shows no numbers from an empty log and asks for the minimum in each group", () => {
      for (const id of PERSONAL_RULE_IDS) {
        const out = personalEvidenceFor(id, emptyLog(), NOW)!;
        expect(out.ruleId).toBe(id);
        expect(out.result).toBeNull();
        expect(out.minPerGroup).toBe(PERSONAL_MIN_GROUP_SIZE);
        expect(out.needed).toEqual({
          exposed: PERSONAL_MIN_GROUP_SIZE,
          reference: PERSONAL_MIN_GROUP_SIZE,
        });
      }
    });

    it("shows numbers once every group has the minimum", () => {
      for (const id of PERSONAL_RULE_IDS) {
        const out = personalEvidenceFor(id, constructedHistory(NOW), NOW)!;
        expect(out.exposed.count).toBeGreaterThanOrEqual(PERSONAL_MIN_GROUP_SIZE);
        expect(out.reference.count).toBeGreaterThanOrEqual(PERSONAL_MIN_GROUP_SIZE);
        expect(out.needed).toEqual({ exposed: 0, reference: 0 });
        expect(out.result).not.toBeNull();
        expect(out.result!.low).toBeLessThanOrEqual(out.result!.difference);
        expect(out.result!.high).toBeGreaterThanOrEqual(out.result!.difference);
      }
    });
  });

  it("the constructed history agrees with the research on all three", () => {
    for (const id of PERSONAL_RULE_IDS) {
      expect(personalEvidenceFor(id, constructedHistory(NOW), NOW)!.result!.verdict).toBe("agrees");
    }
  });

  it("ignores what happened after now", () => {
    const early = new Date(NOW.getTime() - 60 * 24 * 60 * 60 * 1000);
    for (const id of PERSONAL_RULE_IDS) {
      const out = personalEvidenceFor(id, constructedHistory(NOW), early)!;
      expect(out.exposed.count + out.reference.count).toBe(0);
    }
  });

  it("never claims a cause in its own words", () => {
    for (const id of PERSONAL_RULE_IDS) {
      const out = personalEvidenceFor(id, constructedHistory(NOW), NOW)!;
      const text = [out.exposed.label, out.reference.label, ...out.method].join(" ");
      expect(text).not.toMatch(/\b(caus|because of|proves?)\b/i);
      expect(text).not.toMatch(/AMRAP/);
    }
  });
});

describe("wording", () => {
  it("words each verdict", () => {
    expect(VERDICT_LABELS).toEqual({
      agrees: "agrees with the research",
      unclear: "no clear difference yet",
      opposite: "points the other way",
    });
  });

  it("formats reps with a sign, one decimal and a true minus", () => {
    expect(formatSignedReps(-1.06)).toBe("−1.1");
    expect(formatSignedReps(0.25)).toBe("+0.3");
    expect(formatSignedReps(-0.04)).toBe("0.0");
    expect(formatSignedReps(0)).toBe("0.0");
    expect(formatSignedReps(2)).toBe("+2.0");
  });
});
