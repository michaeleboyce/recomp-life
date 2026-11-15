import { STRENGTH_ORDER } from "@/lib/evidence";
import type { GradeCounts } from "@/lib/glass/modelMap";
import { GRADE_LABELS } from "@/components/ui/grade-chip";
import { cn } from "@/lib/utils";
import type { EvidenceStrength } from "@/types";

const FILL: Record<EvidenceStrength, string> = {
  strong: "bg-[var(--grade-strong)]",
  moderate: "bg-[var(--grade-moderate)] opacity-60",
  limited: "bg-[var(--grade-limited)]",
  heuristic: "bg-[var(--grade-heuristic)]",
  program: "bg-[var(--grade-program)]",
};

/** "3 strong, 2 limited": the words behind a bar, for screen readers and tooltips. */
export function describeMix(counts: GradeCounts): string {
  return STRENGTH_ORDER.filter((s) => counts[s] > 0)
    .map((s) => `${counts[s]} ${GRADE_LABELS[s].toLowerCase()}`)
    .join(", ");
}

/**
 * A thin bar showing how a set of rules divides among the evidence grades. The bar is a
 * summary only: the grade words and counts are in its label and in the legend.
 */
export function GradeMix({ counts, className }: { counts: GradeCounts; className?: string }) {
  const total = STRENGTH_ORDER.reduce((sum, s) => sum + counts[s], 0);
  return (
    <span
      role="img"
      aria-label={total === 0 ? "No active rules" : describeMix(counts)}
      className={cn("flex h-2 w-24 overflow-hidden rounded-full bg-muted", className)}
    >
      {total > 0 &&
        STRENGTH_ORDER.filter((s) => counts[s] > 0).map((s) => (
          <i
            key={s}
            data-grade={s}
            className={cn("block h-full border-r border-background last:border-r-0", FILL[s])}
            style={{ width: `${(counts[s] / total) * 100}%` }}
          />
        ))}
    </span>
  );
}

/** The colour key of one grade in a legend. Decorative: the grade word sits beside it. */
export function GradeSwatch({ strength }: { strength: EvidenceStrength }) {
  return (
    <i
      aria-hidden="true"
      data-grade={strength}
      className={cn("block h-2.5 w-4 rounded-sm", FILL[strength])}
    />
  );
}
