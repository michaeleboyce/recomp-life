// Why the accessory picker stops where it does. Numbers come from src/lib/accessories.ts.
import { PHASE_ACCESSORY_CAP, getPhaseAccessoryCap } from "@/lib/accessories";
import type { DecisionTrace, TraceStep } from "@/types";
import { change, step } from "./text";
import type { TraceContext } from "./types";

const CAP_RULE = "accessories-in-cut";

/**
 * How many accessories a session may have in this phase: the usual limit, then what
 * the phase does to it. The result is `getPhaseAccessoryCap(phase)`.
 */
export function explainAccessoryCap(context: Pick<TraceContext, "phase">): DecisionTrace {
  const { phase } = context;
  const usual = PHASE_ACCESSORY_CAP.maintaining;
  const cap = getPhaseAccessoryCap(phase);
  const delta = cap - usual;

  const steps: TraceStep[] = [
    step(
      "usual-cap",
      "Usual limit",
      `Up to ${usual} accessories keeps a session manageable.`,
      "start",
      "count",
      usual
    ),
  ];

  if (phase.mode !== "maintaining") {
    const { op, value } = change(delta);
    const detail =
      phase.mode === "cutting"
        ? delta === 0
          ? "A cut keeps the same limit: doing less while eating less does not help you keep muscle."
          : `A cut changes the limit to ${cap}.`
        : delta > 0
          ? `Bulking allows ${delta} more.`
          : `Bulking changes the limit to ${cap}.`;
    steps.push(
      step(
        "phase-cap",
        phase.mode === "cutting" ? "Cutting phase" : "Bulking phase",
        detail,
        op,
        "count",
        value,
        CAP_RULE
      )
    );
  }

  return { subject: { kind: "accessoryCap" }, result: cap, unit: "count", steps };
}
