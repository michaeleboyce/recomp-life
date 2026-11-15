import { describe, expect, it } from "vitest";
import { getAllRules, isRuleId } from "@/lib/evidence";
import {
  MODELS,
  allModelStats,
  getModel,
  modelStats,
  modelsOfRule,
  registryTotals,
} from "./modelMap";

describe("model map", () => {
  it("names only rules that exist", () => {
    for (const model of MODELS) {
      for (const id of model.ruleIds) expect(isRuleId(id), `${model.id}: ${id}`).toBe(true);
    }
  });

  it("has no repeated rule inside one model and no repeated model id", () => {
    for (const model of MODELS) expect(new Set(model.ruleIds).size).toBe(model.ruleIds.length);
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length);
  });

  it("puts every active rule in at least one model", () => {
    const orphans = getAllRules()
      .filter((rule) => rule.status === "active" && modelsOfRule(rule.id).length === 0)
      .map((rule) => rule.id);
    expect(orphans).toEqual([]);
  });

  it("gives every model at least one rule, active or written", () => {
    for (const stats of allModelStats()) {
      expect(stats.active + stats.planned, stats.model.id).toBeGreaterThan(0);
    }
  });

  it("counts grades so they add up to the active rules", () => {
    for (const stats of allModelStats()) {
      const sum = Object.values(stats.byGrade).reduce((a, b) => a + b, 0);
      expect(sum).toBe(stats.active);
    }
    const totals = registryTotals();
    expect(Object.values(totals.byGrade).reduce((a, b) => a + b, 0)).toBe(totals.active);
    expect(totals.active).toBe(getAllRules().filter((r) => r.status === "active").length);
  });

  it("counts planned rules apart from active ones", () => {
    const model = getModel("forecasts")!;
    const stats = modelStats(model);
    expect(stats.active + stats.planned).toBe(model.ruleIds.length);
  });
});
