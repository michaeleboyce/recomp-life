import { TrendingUp } from "lucide-react";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import type { PrChance, PrOpportunity } from "@/lib/projection";

const CHANCE_TEXT: Record<PrChance, string> = {
  likely: "Likely.",
  stretch: "A stretch.",
  unlikely: "Unlikely.",
  unknown: "",
};

/** The home version the next session would be done as, when the page is showing it. */
export interface HomeNext {
  /** Mid-sentence name, e.g. "goblet squat". */
  name: string;
  weight: number;
  perHand: boolean;
}

/**
 * "Next squat is 225. 2+ reps on the last set is a new best. Likely." At home:
 * "Next squat at home: goblet squat, 60 lbs. Barbell 190." with no new-best claim,
 * because a substitute's sets never give an estimated max.
 */
export function PrLine({
  liftShort,
  weight,
  opportunity,
  home,
}: {
  liftShort: string;
  weight: number;
  opportunity: PrOpportunity | null;
  home?: HomeNext;
}) {
  if (weight <= 0) return null;
  return (
    <div
      data-testid="pr-line"
      className="flex items-center gap-2 rounded-xl bg-accent-primary-soft px-3 py-2.5"
    >
      <TrendingUp className="size-4 shrink-0 text-accent-primary" aria-hidden="true" />
      {home && home.weight > 0 ? (
        <p className="flex-1 text-[13px] text-foreground">
          Next {liftShort} at home: {home.name}, <b className="font-mono">{home.weight}</b> lbs
          {home.perHand ? " a hand" : ""}.{" "}
          <span className="text-muted-foreground">
            Barbell <span className="font-mono">{weight}</span>.
          </span>
        </p>
      ) : (
        <p className="flex-1 text-[13px] text-foreground">
          Next {liftShort} is <b className="font-mono">{weight}</b>.
          {opportunity && (
            <>
              {" "}
              <b className="font-mono">{opportunity.repsNeeded}+</b> reps on the last set is a new
              best.{CHANCE_TEXT[opportunity.chance] && ` ${CHANCE_TEXT[opportunity.chance]}`}
            </>
          )}
        </p>
      )}
      <EvidenceLine ruleId={home ? "dumbbell-conversion" : "e1rm-estimate"} variant="icon" />
    </div>
  );
}
