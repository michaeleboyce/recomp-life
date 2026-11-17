import { TrendingUp } from "lucide-react";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import type { PrChance, PrOpportunity } from "@/lib/projection";

const CHANCE_TEXT: Record<PrChance, string> = {
  likely: "Likely.",
  stretch: "A stretch.",
  unlikely: "Unlikely.",
  unknown: "",
};

/** "Next squat is 225. 2+ reps on the last set is a new best. Likely." */
export function PrLine({
  liftShort,
  weight,
  opportunity,
}: {
  liftShort: string;
  weight: number;
  opportunity: PrOpportunity | null;
}) {
  if (weight <= 0) return null;
  return (
    <div
      data-testid="pr-line"
      className="flex items-center gap-2 rounded-xl bg-accent-primary-soft px-3 py-2.5"
    >
      <TrendingUp className="size-4 shrink-0 text-accent-primary" aria-hidden="true" />
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
      <EvidenceLine ruleId="e1rm-estimate" variant="icon" />
    </div>
  );
}
