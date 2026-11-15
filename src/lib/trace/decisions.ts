// The registry of everything the app decides and can explain, and the traces saved
// with a workout when it starts.
import type { DecisionKind, DecisionTrace, StoredTrace, TraceUnit } from "@/types";
import { explainAccessoryCap } from "./accessoryCap";
import { explainPrescription, explainScheme } from "./prescription";
import { explainRest } from "./rest";
import { explainSubstitute } from "./substitute";
import type { PlanEntry, TraceContext } from "./types";

interface DecisionBase {
  /** What is decided, for a heading: "why this weight". */
  label: string;
  /** Unit of the result. "none" when the result is text, such as "5x3". */
  unit: TraceUnit;
}

/** A decision made for each planned entry. */
export interface LiftDecision extends DecisionBase {
  scope: "lift";
  explain: (entry: PlanEntry, context: TraceContext, plan?: readonly PlanEntry[]) => DecisionTrace;
}

/** A decision made once for the session. */
export interface SessionDecision extends DecisionBase {
  scope: "session";
  explain: (context: TraceContext) => DecisionTrace;
}

export type DecisionDefinition = LiftDecision | SessionDecision;

/** Every kind of decision, with the function that explains it. */
export const DECISIONS: Record<DecisionKind, DecisionDefinition> = {
  weight: { scope: "lift", label: "weight", unit: "lb", explain: explainPrescription },
  scheme: { scope: "lift", label: "sets and reps", unit: "none", explain: explainScheme },
  rest: { scope: "lift", label: "rest", unit: "s", explain: explainRest },
  substitute: { scope: "lift", label: "home substitute", unit: "lb", explain: explainSubstitute },
  accessoryCap: {
    scope: "session",
    label: "accessory limit",
    unit: "count",
    explain: explainAccessoryCap,
  },
};

/** The trace for one kind of decision. `entry` is needed for the per-lift kinds. */
export function explainDecision(
  kind: DecisionKind,
  context: TraceContext,
  entry?: PlanEntry,
  plan?: readonly PlanEntry[]
): DecisionTrace {
  const decision = DECISIONS[kind];
  if (decision.scope === "session") return decision.explain(context);
  if (!entry) throw new Error(`A plan entry is needed to explain "${kind}"`);
  return decision.explain(entry, context, plan);
}

/** The decision kinds saved with a workout, per planned lift. */
export const STORED_DECISION_KINDS: readonly DecisionKind[] = ["weight", "rest"];

/**
 * The traces to save on a workout when it starts (`WorkoutSession.decisions`): weight
 * and rest for every planned lift, in plan order, exactly as they would be shown.
 * Warm-up entries are left out; they follow from the working weight. The text is
 * final: a later change to a rule constant does not rewrite what the app said.
 */
export function buildSessionDecisions(
  plan: readonly PlanEntry[],
  context: TraceContext
): StoredTrace[] {
  const traces: StoredTrace[] = [];
  for (const entry of plan) {
    if (entry.isWarmUp) continue;
    for (const kind of STORED_DECISION_KINDS) {
      traces.push(explainDecision(kind, context, entry, plan));
    }
  }
  return traces;
}

/** The saved trace for one lift and kind, or undefined when the workout has none. */
export function findStoredDecision(
  decisions: readonly StoredTrace[] | undefined,
  kind: DecisionKind,
  exerciseId: string,
  tier: PlanEntry["tier"]
): StoredTrace | undefined {
  return decisions?.find(
    (trace) =>
      trace.subject.kind === kind &&
      trace.subject.exerciseId === exerciseId &&
      trace.subject.tier === tier
  );
}
