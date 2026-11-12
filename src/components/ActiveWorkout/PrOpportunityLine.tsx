"use client";

import { TrendingUp } from "lucide-react";
import { describeChance, type PrOpportunity } from "./prOpportunity";

interface PrOpportunityLineProps {
  opportunity: PrOpportunity;
  recentAMRAPReps: number[];
}

/** "5 reps = new best, est. 286 (now 266). Likely: your last three were 5, 4, 6." */
export function PrOpportunityLine({ opportunity, recentAMRAPReps }: PrOpportunityLineProps) {
  const chance = describeChance(opportunity, recentAMRAPReps);

  return (
    <p
      data-testid="pr-opportunity"
      className="flex items-center gap-2 rounded-xl bg-success-soft px-3 py-2.5 text-[13px] text-foreground/90"
    >
      <TrendingUp className="size-4 shrink-0 text-success" aria-hidden="true" />
      <span>
        <b className="font-mono">{opportunity.repsNeeded}</b>{" "}
        {opportunity.repsNeeded === 1 ? "rep" : "reps"} = new best, est.{" "}
        <b className="font-mono">{opportunity.e1rmAtRepsNeeded}</b> (now{" "}
        <span className="font-mono">{opportunity.bestE1RM}</span>).
        {chance && ` ${chance}`}
      </span>
    </p>
  );
}
