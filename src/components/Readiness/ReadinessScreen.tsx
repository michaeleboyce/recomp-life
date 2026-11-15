"use client";

import Link from "next/link";
import { useReadinessToday, useTrainingLocation } from "@/hooks";
import { getRule } from "@/lib/evidence";
import type { ReadinessScore } from "@/types";
import { Gauge } from "@/components/chart-kit";
import { GradeChip } from "@/components/ui/grade-chip";
import { Skeleton } from "@/components/ui/skeleton";
import { ruleHref } from "@/components/Why/WhySteps";
import { ContributionRow } from "./ContributionRow";
import { forecastShiftText, readinessVerdict, usualLine } from "./readinessText";

/** The rule behind the score's points. */
export const READINESS_SCORE_RULE = "readiness-score" as const;
/** Where the two questions are answered. */
export const READY_SCREEN_HREF = "/workout/configure";

/** Points that fill half a bar, at least: small scores do not fill the row. */
const MIN_BAR_SCALE = 6;

/**
 * Today's readiness: the score in a half ring with a verdict and the user's usual,
 * one row per input that moved it, what it changes today (never a weight) and how
 * sure the app is of its own points. A user with no check-in yet is told how to
 * get one.
 */
export function ReadinessScreen() {
  const { location, isLoading } = useTrainingLocation();
  const score = useReadinessToday({ location });
  if (isLoading || score === undefined) return <ReadinessSkeleton />;
  if (score === null) return <ReadinessEmpty />;
  return <ReadinessView score={score} />;
}

export function ReadinessView({ score }: { score: ReadinessScore }) {
  const shown = Math.round(score.score);
  const usual = Math.round(score.usual);
  const scale = Math.max(MIN_BAR_SCALE, ...score.contributions.map((c) => Math.abs(c.points)));
  const rule = getRule(READINESS_SCORE_RULE);
  return (
    <div className="flex flex-col gap-3">
      <section aria-labelledby="readiness-verdict" className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-3.5">
        <Gauge value={shown} label="Readiness" className="w-[150px]" />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
            Readiness today
          </span>
          <p id="readiness-verdict" className="text-[15px] leading-tight font-bold">
            {readinessVerdict(score)}
          </p>
          <p className="text-xs leading-snug text-muted-foreground">
            {usualLine({ ...score, usual })}
          </p>
        </div>
      </section>

      <ul aria-label="What moved the score" className="flex flex-col border-b border-border">
        {score.contributions.map((contribution) => (
          <ContributionRow key={contribution.id} contribution={contribution} scale={scale} />
        ))}
      </ul>

      <section aria-label="What this changes today" className="rounded-2xl bg-card p-4">
        <h2 className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          What this changes today
        </h2>
        <ul className="mt-1.5 flex flex-col gap-1 text-[13px] leading-snug">
          <li>
            <b>Weights:</b> nothing. Readiness never changes what is on the bar.
          </li>
          <li>
            <b>Forecasts:</b> {forecastShiftText(score)}
          </li>
          <li>
            <b>Accessories:</b>{" "}
            {score.suggestSkippingAccessories
              ? "after under 5 hours of sleep with low energy, the app suggests skipping them today, and you can still say no."
              : "as planned. The app suggests skipping them only after under 5 hours of sleep with low energy, and you can still say no."}
          </li>
        </ul>
      </section>

      <p className="text-xs leading-snug text-muted-foreground">
        The inputs are research-backed; the points given to each are this app&apos;s own
        weighting <GradeChip strength={rule.strength} className="mx-0.5" />.{" "}
        <Link
          href={ruleHref(READINESS_SCORE_RULE)}
          className="inline-flex min-h-11 items-center font-semibold text-primary underline decoration-dotted underline-offset-2"
        >
          How the score is worked out
        </Link>
      </p>
    </div>
  );
}

export function ReadinessEmpty() {
  return (
    <section aria-label="No readiness yet" className="flex flex-col gap-3 rounded-2xl bg-card p-4">
      <h2 className="font-display text-lg font-bold">No readiness score yet</h2>
      <p className="text-sm leading-snug text-muted-foreground">
        The score starts from two questions, last night&apos;s sleep and your energy. Answer them on
        the Ready screen under &ldquo;How are you feeling?&rdquo; and the score, with everything
        that moved it, shows here.
      </p>
      <Link
        href={READY_SCREEN_HREF}
        className="flex h-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        Answer on the Ready screen
      </Link>
    </section>
  );
}

function ReadinessSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3">
      <Skeleton className="h-24 w-full rounded-2xl" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}
