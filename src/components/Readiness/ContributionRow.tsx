import Link from "next/link";
import { cn } from "@/lib/utils";
import { getRule, isRuleId } from "@/lib/evidence";
import type { ReadinessContribution } from "@/types";
import { GRADE_LABELS, GradeChip } from "@/components/ui/grade-chip";
import { ruleHref } from "@/components/Why/WhySteps";
import { formatPoints, spokenPoints } from "./readinessText";

export interface ContributionRowProps {
  contribution: ReadinessContribution;
  /** Points that fill half the bar's width (the largest on the screen, at least a few). */
  scale: number;
}

/**
 * One input to the readiness score: what it was, a plain detail, the grade of the rule
 * behind it, and its signed points as a bar left (taken) or right (added) of a centre
 * line. The bar is drawing only; its words are in the row.
 */
export function ContributionRow({ contribution, scale }: ContributionRowProps) {
  const { points } = contribution;
  const rule = isRuleId(contribution.ruleId) ? getRule(contribution.ruleId) : null;
  const share = scale > 0 ? Math.min(1, Math.abs(points) / scale) : 0;
  const width = `${Math.max(points === 0 ? 0 : 6, share * 50)}%`;
  return (
    <li
      data-contribution={contribution.id}
      className="grid min-h-[50px] grid-cols-[minmax(0,1fr)_88px_36px] items-center gap-2.5 border-t border-border py-1.5"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="text-[13.5px] font-bold">{contribution.label}</span>
          {rule && (
            <Link
              href={ruleHref(contribution.ruleId)}
              aria-label={`${GRADE_LABELS[rule.strength]}: ${rule.title}`}
              className="relative rounded-full outline-none after:absolute after:-inset-y-3 after:-inset-x-1 after:content-[''] focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <GradeChip strength={rule.strength} />
            </Link>
          )}
        </p>
        <p className="text-xs leading-snug text-muted-foreground">{contribution.detail}</p>
      </div>
      <span aria-hidden="true" data-slot="contribution-bar" className="relative h-3.5">
        <span className="absolute -top-1 -bottom-1 left-1/2 w-px bg-muted-foreground/50" />
        {points !== 0 && (
          <span
            className={cn(
              "absolute top-0.5 h-2.5 rounded-full",
              points > 0 ? "left-1/2 bg-chart-good" : "right-1/2 bg-chart-warn"
            )}
            style={{ width }}
          />
        )}
      </span>
      <span
        className={cn(
          "text-right font-mono text-[13px] font-medium tabular-nums",
          points > 0 ? "text-chart-good" : points < 0 ? "text-chart-warn" : "text-muted-foreground"
        )}
      >
        <span aria-hidden="true">{formatPoints(points)}</span>
        <span className="sr-only">{spokenPoints(points)}</span>
      </span>
    </li>
  );
}
