// Applies a trace's step effects in order. A trace is only honest when this gives its
// `result`; the tests hold every explain function to that.
import type { DecisionTrace, TraceStep, TraceUnit } from "@/types";

/**
 * The value each unit ends at after the steps run in order:
 * - start, set, round: the value becomes the step's value
 * - add: the step's value is added
 * - none: a check that changed nothing
 * A step without a value changes nothing, whatever its op.
 */
export function applySteps(steps: readonly TraceStep[]): Partial<Record<TraceUnit, number>> {
  const values: Partial<Record<TraceUnit, number>> = {};
  for (const { effect } of steps) {
    if (effect.op === "none" || effect.value === undefined) continue;
    values[effect.unit] =
      effect.op === "add" ? (values[effect.unit] ?? 0) + effect.value : effect.value;
  }
  return values;
}

/**
 * What a trace's steps add up to, in the form of its `result`: a number in the trace's
 * unit, or for sets and reps the text "5x3". Undefined when the steps never set it.
 */
export function replayTrace(trace: DecisionTrace): number | string | undefined {
  const values = applySteps(trace.steps);
  if (trace.subject.kind === "scheme") {
    return values.sets === undefined || values.reps === undefined
      ? undefined
      : `${values.sets}x${values.reps}`;
  }
  return values[trace.unit];
}
