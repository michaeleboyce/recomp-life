// Decision traces: ordered steps that reproduce a number the app decided (weight, sets
// and reps, rest, home substitute, accessory limit). Pure: no React, no database, no
// clock; `now` comes in through the context.
// Spec: docs/plans/2026-11-14-glass-box-design.md ("Decision trace").
export type {
  LastSession,
  PlanEntry,
  TraceContext,
  TraceHistory,
  TraceReadiness,
} from "./types";

export { explainPrescription, explainScheme } from "./prescription";
export { explainRest } from "./rest";
export { explainSubstitute } from "./substitute";
export { explainAccessoryCap } from "./accessoryCap";
export {
  DECISIONS,
  STORED_DECISION_KINDS,
  buildSessionDecisions,
  explainDecision,
  findStoredDecision,
} from "./decisions";
export type { DecisionDefinition, LiftDecision, SessionDecision } from "./decisions";
export { applySteps, replayTrace } from "./replay";
export { findLastSession } from "./history";
