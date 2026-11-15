import { House, TrendingUp } from "lucide-react";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { Term } from "@/components/ui/term";
import type { TermId } from "@/lib/glossary";
import type { PrChance, PrOpportunity } from "@/lib/projection";
import { tierStyle } from "@/lib/tierStyle";
import { cn } from "@/lib/utils";
import type { Tier } from "@/types";
import { nameInSentence } from "@/components/Today/todayModel";
import { homeConversionText, homeScheme, type HomeNextSession } from "./homeVersion";

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

const TIER_TERM: Partial<Record<Tier, TermId>> = { T1: "t1", T2: "t2", T3: "t3" };

/**
 * The home version's next session: its weight as lifted (the number Today shows),
 * tier and scheme, and how the weight follows from the barbell weight. No new-best
 * claim: a substitute's sets never give an estimated max.
 */
export function HomeNextWeight({
  substituteId,
  liftShort,
  next,
}: {
  substituteId: string;
  liftShort: string;
  next: HomeNextSession;
}) {
  const style = tierStyle(next.tier);
  const term = TIER_TERM[next.tier];
  const scheme = homeScheme(next);
  const conversion = homeConversionText(liftShort, substituteId, next);
  return (
    <div data-testid="home-next" className="flex flex-col gap-2 rounded-xl bg-accent-primary-soft px-4 py-3">
      <div className="flex items-end justify-between gap-3">
        {next.weight > 0 ? (
          <p className="flex items-baseline gap-1.5">
            <b
              data-testid="home-next-weight"
              className="font-display text-[40px] leading-none font-extrabold text-foreground tabular-nums"
            >
              {next.weight}
            </b>
            <span className="text-sm text-muted-foreground">lbs{next.perHand ? " a hand" : ""}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No weight set yet.</p>
        )}
        <p className="flex items-baseline gap-1.5 pb-1 font-mono text-sm font-medium">
          <span className={cn("text-xs font-bold", style.text)}>
            {term ? <Term id={term}>{style.label}</Term> : style.label}
          </span>
          {next.isAMRAP ? <Term id="amrap-plus">{scheme}</Term> : <span>{scheme}</span>}
        </p>
      </div>
      {next.plannedAs && (
        <p data-testid="home-planned-as" className="text-[13px] text-foreground">
          Your next home workout has {nameInSentence(next.plannedAs)} for {liftShort}; this is the
          weight if you swap to {nameInSentence(substituteId)}.
        </p>
      )}
      {conversion && (
        <div className="flex items-start gap-2 border-t border-border pt-2">
          <House className="mt-0.5 size-4 shrink-0 text-accent-primary" aria-hidden="true" />
          <p data-testid="home-conversion" className="flex-1 text-[13px] text-muted-foreground">
            {conversion}
          </p>
          <EvidenceLine ruleId="dumbbell-conversion" variant="icon" />
        </div>
      )}
    </div>
  );
}
