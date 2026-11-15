// Why the rest after a set is as long as it is. Every number comes from
// src/lib/restTimes.ts, the one place that decides rest.
import {
  formatRestDuration,
  getRestEvidenceId,
  getRestSeconds,
  hasCuttingRestBonus,
} from "@/lib/restTimes";
import type { DecisionTrace, TraceStep } from "@/types";
import { step } from "./text";
import type { PlanEntry, TraceContext } from "./types";

/** Rule for the extra rest on heavy sets while cutting. */
const CUT_BONUS_RULE = "rest-cut-bonus";

/**
 * The rest after a set of this entry: the tier's base rest, then the extra time on
 * heavy sets while cutting. The result is `getRestSeconds(tier, phase)`.
 */
export function explainRest(
  entry: Pick<PlanEntry, "exerciseId" | "tier">,
  context: Pick<TraceContext, "phase">
): DecisionTrace {
  const { tier } = entry;
  const { phase } = context;
  // With no phase the function returns the tier's base rest.
  const base = getRestSeconds(tier);
  const rest = getRestSeconds(tier, phase);
  const rule = getRestEvidenceId(tier);

  const steps: TraceStep[] = [
    rule === "rest-heavy"
      ? step(
          "base-rest",
          `${tier} sets`,
          `Heavy sets get ${formatRestDuration(base)}: longer rest keeps the next set strong.`,
          "start",
          "s",
          base,
          rule
        )
      : rule === "rest-light"
        ? step(
            "base-rest",
            tier === "accessory" ? "Accessory sets" : `${tier} sets`,
            `Lighter sets get ${formatRestDuration(base)}: enough to help muscle growth without stretching the session.`,
            "start",
            "s",
            base,
            rule
          )
        : step(
            "base-rest",
            "Warm-up sets",
            `Warm-up sets get a short ${formatRestDuration(base)}.`,
            "start",
            "s",
            base
          ),
  ];

  if (phase.mode === "cutting") {
    steps.push(
      hasCuttingRestBonus(tier, phase)
        ? step(
            "cutting-bonus",
            "Cutting phase",
            `Adds ${rest - base} seconds on T1 and T2 sets while cutting: ${formatRestDuration(base)} becomes ${formatRestDuration(rest)}.`,
            "add",
            "s",
            rest - base,
            CUT_BONUS_RULE
          )
        : step(
            "cutting-bonus",
            "Cutting phase",
            "The extra rest while cutting is for T1 and T2 sets only.",
            "none",
            "s",
            undefined,
            CUT_BONUS_RULE
          )
    );
  }

  return {
    subject: { kind: "rest", exerciseId: entry.exerciseId, tier },
    result: rest,
    unit: "s",
    steps,
  };
}
