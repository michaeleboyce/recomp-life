// PR opportunity and e1RM projection. Pure functions: no React, no database, no
// clock (callers pass `now`). The contract is the set of names exported here.

// ── PR opportunity ─────────────────────────────────────────────────────────
export type { PrChance, PrOpportunity } from "./prOpportunity";
export { repsToBeat, prChance, describePrOpportunity } from "./prOpportunity";

// ── Trend and projection ───────────────────────────────────────────────────
export type { TrendFit } from "./trend";
export { fitTrend } from "./trend";

export type { ProjectionBaseline } from "./baseline";
export { measureBaseline } from "./baseline";

export type {
  ProjectionScenario,
  ProjectedPoint,
  Projection,
  RelatedTrend,
} from "./project";
export {
  projectE1RM,
  maxReliableWeeks,
  MIN_RELIABLE_WEEKS,
  MAX_SCENARIO_WIDENING,
  PROJECTION_EVIDENCE_IDS,
  resultsNeeded,
  scenarioWidening,
} from "./project";

export {
  describeChanges,
  describeRelatedTrend,
  FLAT_SLOPE_LBS,
  formatAmount,
  liftShortName,
  summarizeScenario,
} from "./summary";
export { relatedExerciseIds } from "./related";

export type { ProjectionTeaser } from "./teaser";
export { projectionTeaser } from "./teaser";
