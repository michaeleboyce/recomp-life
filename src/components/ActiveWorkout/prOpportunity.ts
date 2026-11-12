// The one place the workout screens call the projection package's PR-opportunity
// function, so its contract can change in a single spot.
import { describePrOpportunity, type PrOpportunity } from "@/lib/projection";
import type { Tier } from "@/types";

export type { PrOpportunity };

export interface PrOpportunityInput {
  tier: Tier;
  isAMRAP: boolean;
  weight: number;
  bestE1RM: number | null;
  recentAMRAPReps: number[];
}

/** The PR opportunity for a set, or null when there is none. */
export function getPrOpportunity(input: PrOpportunityInput): PrOpportunity | null {
  return describePrOpportunity(input);
}

const CHANCE_LABEL: Record<PrOpportunity["chance"], string | null> = {
  likely: "Likely",
  stretch: "A stretch",
  unlikely: "Unlikely",
  unknown: null,
};

/** "Likely: your last three were 5, 4, 6." or null when the chance is unknown. */
export function describeChance(
  opportunity: PrOpportunity,
  recentAMRAPReps: number[]
): string | null {
  const label = CHANCE_LABEL[opportunity.chance];
  if (!label) return null;
  const recent = recentAMRAPReps.slice(-3);
  if (recent.length === 0) return `${label}.`;
  const count = ["", "your last set was", "your last two were", "your last three were"][
    recent.length
  ];
  return `${label}: ${count} ${recent.join(", ")}.`;
}
