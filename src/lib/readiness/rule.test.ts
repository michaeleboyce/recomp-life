import { describe, it, expect } from "vitest";
import { getRule } from "@/lib/evidence";
import { REPS_MODEL } from "@/lib/forecast/coefficients";
import { READINESS_WEIGHTS as W, formatPoints } from "./weights";

describe("the readiness-score rule", () => {
  const rule = getRule("readiness-score");

  it("is active, heuristic and unsourced, and shown on the forecast tiles", () => {
    expect(rule.status).toBe("active");
    expect(rule.strength).toBe("heuristic");
    expect(rule.sources).toEqual([]);
    expect(rule.surfaces).toEqual(["src/components/Today/ForecastTiles.tsx"]);
  });

  it("states the real points, read from READINESS_WEIGHTS", () => {
    const text = rule.appBehavior;
    for (const value of [
      W.sleep["5-7"],
      W.sleep["<5"],
      W.stress.good,
      W.stress.low,
      W.rest.recovering,
      W.rest.primed,
      W.run.advisory,
      W.run.strong,
      W.hardActivity,
      W.sorenessPerSeverity,
      W.sorenessFloor,
      W.painPerSeverity,
      W.painFloor,
    ]) {
      expect(text).toContain(formatPoints(value));
    }
    expect(text).toContain(`Until you have ${W.minPastScores} check-ins that is ${W.defaultUsual}`);
    expect(text).toContain(`your last ${W.usualWindow} check-ins`);
    expect(text).toContain(`for ${W.sorenessWindowHours} hours`);
    expect(text).toContain(`for ${W.painWindowDays} days`);
    expect(text).not.toMatch(/undefined|NaN|\[object/);
  });

  it("states the forecast shift per point and that no weight changes", () => {
    const percent = Number((REPS_MODEL.readinessLevelShiftPerPoint * 100).toFixed(3));
    expect(percent).toBeGreaterThan(0);
    expect(rule.appBehavior).toContain(`by ${percent}%`);
    expect(rule.appBehavior).toMatch(/never changes a weight\.$/);
  });

  it("names the code that implements it", () => {
    expect(rule.implementedIn).toEqual([
      "src/lib/readiness/weights.ts#READINESS_WEIGHTS",
      "src/lib/readiness/score.ts#readinessScore",
      "src/lib/readiness/usual.ts#readinessUsual",
    ]);
  });
});
