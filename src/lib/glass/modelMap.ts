// "How the app decides": which written rules sit behind each model the app runs. Pure:
// no React, no database, no clock. Every count and grade mix shown on the screen is
// computed here from the evidence registry; nothing is typed in. The test fails when a
// rule id is unknown or an active rule belongs to no model.
import {
  STRENGTH_ORDER,
  getAllRules,
  getRule,
  isRuleId,
  type RuleId,
  type RuleWithId,
} from "@/lib/evidence";
import type { EvidenceStrength } from "@/types";

export type ModelId =
  | "progression"
  | "strength"
  | "trend"
  | "readiness"
  | "rest"
  | "recovery"
  | "forecasts";

export interface ModelDef {
  id: ModelId;
  label: string;
  /** One plain line: what the model works out. */
  blurb: string;
  /** Rules behind it, active or planned. A rule may serve more than one model. */
  ruleIds: readonly RuleId[];
}

/** The models in display order. */
export const MODELS: readonly ModelDef[] = [
  {
    id: "progression",
    label: "Progression",
    blurb: "Weights, stages, resets and freezes.",
    ruleIds: [
      "tier-structure",
      "gzclp-progression",
      "t3-progression",
      "accessory-progression",
      "off-program-credit",
      "dumbbell-conversion",
    ],
  },
  {
    id: "strength",
    label: "Strength estimate",
    blurb: "Your estimated max and the chance of a new best.",
    ruleIds: ["e1rm-estimate", "amrap-effort", "forecast-reps"],
  },
  {
    id: "trend",
    label: "Trend and projection",
    blurb: "Where each lift and your weight are heading.",
    ruleIds: [
      "projection-dose-response",
      "projection-specificity",
      "projection-rate-of-gain",
      "projection-energy-deficit",
      "rate-of-loss",
      "fat-loss-stall",
      "forecast-bodyweight",
    ],
  },
  {
    id: "readiness",
    label: "Readiness",
    blurb: "Sleep, stress, soreness and yesterday.",
    ruleIds: ["readiness", "readiness-score", "run-interference"],
  },
  {
    id: "rest",
    label: "Rest and effort",
    blurb: "Timers, and how hard the last set should be.",
    ruleIds: [
      "rest-heavy",
      "rest-light",
      "rest-cut-bonus",
      "rpe-logging",
      "t2-autoregulation",
      "amrap-effort",
    ],
  },
  {
    id: "recovery",
    label: "Recovery and fatigue",
    blurb: "Muscle by muscle, pain, and lighter weeks.",
    ruleIds: [
      "recovery-windows",
      "time-off",
      "deload",
      "fatigue-detection",
      "activity-fatigue",
      "weekly-volume",
      "accessories-in-cut",
      "volume-ratio",
      "training-with-pain",
      "pain-load-changes",
    ],
  },
  {
    id: "forecasts",
    label: "Forecasts and self-scoring",
    blurb: "What the app expects, and how often it was right.",
    ruleIds: [
      "forecast-reps",
      "forecast-session-length",
      "forecast-bodyweight",
      "forecast-calibration",
    ],
  },
];

export function getModel(id: string): ModelDef | undefined {
  return MODELS.find((model) => model.id === id);
}

export function isModelId(value: string | null | undefined): value is ModelId {
  return !!value && MODELS.some((model) => model.id === value);
}

/** The rules of a model that exist in the registry, in the order the map lists them. */
export function modelRules(model: ModelDef): RuleWithId[] {
  return model.ruleIds.filter(isRuleId).map(getRule);
}

export type GradeCounts = Record<EvidenceStrength, number>;

function emptyCounts(): GradeCounts {
  return Object.fromEntries(STRENGTH_ORDER.map((s) => [s, 0])) as GradeCounts;
}

export interface ModelStats {
  model: ModelDef;
  /** Active rules behind the model: the number shown. */
  active: number;
  /** Rules written but not yet switched on. */
  planned: number;
  /** Active rules by evidence grade. */
  byGrade: GradeCounts;
}

export function modelStats(model: ModelDef): ModelStats {
  const rules = modelRules(model);
  const byGrade = emptyCounts();
  let active = 0;
  for (const rule of rules) {
    if (rule.status !== "active") continue;
    active += 1;
    byGrade[rule.strength] += 1;
  }
  return { model, active, planned: rules.length - active, byGrade };
}

export function allModelStats(): ModelStats[] {
  return MODELS.map(modelStats);
}

/** Active rules in the whole registry, and how many carry each grade. */
export function registryTotals(): { active: number; byGrade: GradeCounts } {
  const byGrade = emptyCounts();
  const active = getAllRules().filter((rule) => rule.status === "active");
  for (const rule of active) byGrade[rule.strength] += 1;
  return { active: active.length, byGrade };
}

/** Models that use a rule. */
export function modelsOfRule(ruleId: RuleId): ModelDef[] {
  return MODELS.filter((model) => model.ruleIds.includes(ruleId));
}
