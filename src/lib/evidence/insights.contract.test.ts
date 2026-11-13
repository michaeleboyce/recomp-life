// @vitest-environment node
/**
 * Contract between the insight rules and the evidence registry: an insight shown on
 * Today must not cite a rule the registry calls "planned" (its sheet would say the
 * feature is not connected), and the registry must list the Today list as a surface.
 *
 * The ids are read from the insight rule sources, so a new `evidenceId` is covered
 * without editing this test. To fix a failure, follow "Connect a planned rule" in
 * docs/research/ADDING_RESEARCH.md.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { checkSystemicFatigue } from "@/lib/deload";
import { checkInactivity } from "@/lib/inactivity";
import { getStallProtocolSuggestion, STALL_BAND_PERCENT } from "@/lib/rateOfLoss";
import { LONG_BREAK_DAYS } from "@/lib/recovery";
import { computeInsights, type InsightContext } from "@/lib/insights";
import { DEFAULT_USER_PROFILE, INITIAL_LIFT_STATES } from "@/db/seed";
import type { LiftState, TrainingPhase } from "@/types";
import { getRule, isRuleId } from "./index";

const ROOT = path.resolve(__dirname, "../../..");
const RULES_DIR = path.join(ROOT, "src/lib/insights/rules");
const TODAY_SURFACE = "src/components/Today/AttentionList.tsx";

const EVIDENCE_ID = /evidenceId:\s*"([^"]+)"/g;

const idsByFile = new Map<string, string[]>();
for (const name of fs.readdirSync(RULES_DIR).filter((f) => f.endsWith(".ts"))) {
  const content = fs.readFileSync(path.join(RULES_DIR, name), "utf8");
  const ids = [...content.matchAll(EVIDENCE_ID)].map((m) => m[1]);
  if (ids.length > 0) idsByFile.set(name, ids);
}
const allIds = [...new Set([...idsByFile.values()].flat())].sort();

describe("insight evidence ids", () => {
  it("the scan finds the ids (guards against a broken scan)", () => {
    expect(allIds.length).toBeGreaterThanOrEqual(6);
    expect(allIds).toContain("fatigue-detection");
    expect(allIds).toContain("fat-loss-stall");
  });

  it("no insight rule builds its evidence id dynamically", () => {
    for (const name of fs.readdirSync(RULES_DIR).filter((f) => f.endsWith(".ts"))) {
      const content = fs.readFileSync(path.join(RULES_DIR, name), "utf8");
      const mentions = content.match(/evidenceId\s*:/g)?.length ?? 0;
      const literals = [...content.matchAll(EVIDENCE_ID)].length;
      expect(literals, `${name}: write evidenceId as a string literal so this test can read it`).toBe(mentions);
    }
  });

  it("every id names an active rule that lists the Today list as a surface", () => {
    for (const [file, ids] of idsByFile) {
      for (const id of ids) {
        expect(isRuleId(id), `${file}: evidenceId "${id}" is not a rule id`).toBe(true);
        if (!isRuleId(id)) continue;
        const rule = getRule(id);
        expect(
          rule.status,
          `${file} emits "${id}", which is ${rule.status}: Today would show a sheet for a rule that is not connected`
        ).toBe("active");
        expect(
          (rule.surfaces as readonly string[]).includes(TODAY_SURFACE),
          `${file} emits "${id}" but the rule's surfaces does not list ${TODAY_SURFACE}`
        ).toBe(true);
        expect(rule.appBehavior, `${id}: appBehavior still says it is not connected`).not.toMatch(
          /not connected|not on any screen|rule in code/i
        );
        expect("activationNotes" in rule, `${id}: remove activationNotes from an active rule`).toBe(false);
      }
    }
  });

  it("insights computed from live contexts carry only such ids", () => {
    const now = new Date(2026, 10, 11, 12);
    const day = 24 * 60 * 60 * 1000;
    const falling = (id: string): LiftState => ({
      ...INITIAL_LIFT_STATES[id],
      recentE1RMs: [300, 295, 290, 285],
    });
    const ctx: InsightContext = {
      workouts: [],
      e1rms: [],
      bodyweight: Array.from({ length: 28 }, (_, i) => ({
        id: `bw-${i}`,
        clientId: `bw-${i}`,
        date: new Date(now.getTime() - (27 - i) * day),
        weight: 200,
        synced: false,
      })) as InsightContext["bodyweight"],
      runs: [],
      readiness: [],
      pain: [
        {
          id: "p1",
          clientId: "p1",
          region: "neck",
          severity: 2,
          sensation: "pain",
          date: new Date(now.getTime() - 9 * day),
          synced: false,
        },
      ] as InsightContext["pain"],
      liftStates: [falling("squat"), falling("bench")],
      settings: { ...DEFAULT_USER_PROFILE.settings, trainingPhase: { mode: "cutting" } },
      unfinishedWorkout: null,
      now,
    };
    const emitted = computeInsights(ctx).flatMap((i) => (i.evidenceId ? [i.evidenceId] : []));
    expect(emitted).toContain("fatigue-detection");
    expect(emitted).toContain("fat-loss-stall");
    expect(emitted).toContain("training-with-pain");
    for (const id of emitted) {
      const rule = getRule(id);
      expect(rule.status, id).toBe("active");
      expect((rule.surfaces as readonly string[]).includes(TODAY_SURFACE), id).toBe(true);
    }
  });
});

// The numbers these rules' appBehavior states are literals in modules that do not
// export them as constants; these checks fail if the code moves away from the text.
describe("numbers quoted in the connected rules", () => {
  const declining = (sessions: number): LiftState => ({
    ...INITIAL_LIFT_STATES.squat,
    recentAvgRPEs: [],
    recentAMRAPReps: [],
    recentE1RMs: Array.from({ length: sessions + 1 }, (_, i) => 300 - 5 * i),
  });
  const phase = (mode: TrainingPhase["mode"]) => ({ mode }) as TrainingPhase;

  it("fatigue-detection: 2 falling sessions while cutting, 3 otherwise", () => {
    expect(checkSystemicFatigue([declining(1)], phase("cutting"))).toBeNull();
    expect(checkSystemicFatigue([declining(2)], phase("cutting"))).not.toBeNull();
    for (const mode of ["maintaining", "bulking"] as const) {
      expect(checkSystemicFatigue([declining(2)], phase(mode))).toBeNull();
      expect(checkSystemicFatigue([declining(3)], phase(mode))).not.toBeNull();
    }
    const text = getRule("fatigue-detection").appBehavior;
    expect(text).toMatch(/2 sessions in a row while cutting/);
    expect(text).toMatch(/3 otherwise/);
    expect(text).toMatch(/only the estimated-1RM trend/i);
    expect(text).toMatch(/optional/i);
  });

  it("fat-loss-stall: three slow weeks before anything is suggested, a calorie cut from week five", () => {
    expect(getStallProtocolSuggestion(0, 0, 2)).toBeNull();
    expect(getStallProtocolSuggestion(0, 0, 3)).toMatch(/steps/i);
    expect(getStallProtocolSuggestion(0, 0, 4)).toMatch(/steps/i);
    expect(getStallProtocolSuggestion(0, 0, 5)).toMatch(/calories/i);
    expect(getStallProtocolSuggestion(1, STALL_BAND_PERCENT, 6)).toBeNull();
    const text = getRule("fat-loss-stall").appBehavior;
    expect(text).toContain(`${STALL_BAND_PERCENT}%`);
    expect(text).toMatch(/three weeks/);
    expect(text).toMatch(/five weeks/);
  });

  it("time-off: Today mentions a break from 5 days", () => {
    expect(checkInactivity(4.9)).toBeNull();
    expect(checkInactivity(5)).not.toBeNull();
    expect(checkInactivity(LONG_BREAK_DAYS)!.level).toBe("detraining");
    expect(getRule("time-off").appBehavior).toMatch(/5 days/);
  });
});
