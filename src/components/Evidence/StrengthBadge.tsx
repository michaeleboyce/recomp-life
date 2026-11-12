import { cn } from "@/lib/utils";
import { STRENGTH_LABELS } from "@/lib/evidence";
import type { EvidenceStrength } from "@/types";

/** Filled dots out of three for research-graded strengths. */
const DOTS: Partial<Record<EvidenceStrength, number>> = {
  strong: 3,
  moderate: 2,
  limited: 1,
};

interface StrengthBadgeProps {
  strength: EvidenceStrength;
  className?: string;
}

/**
 * How well research supports a rule: a three-dot scale for strong, moderate
 * and limited evidence, and a plain chip for heuristics and program rules so
 * they are never mistaken for research findings.
 */
export function StrengthBadge({ strength, className }: StrengthBadgeProps) {
  const label = STRENGTH_LABELS[strength];
  const dots = DOTS[strength];

  if (dots === undefined) {
    return (
      <span
        data-strength={strength}
        className={cn(
          "inline-flex items-center rounded-full border border-dashed border-border px-2 py-0.5 text-xs font-medium text-muted-foreground",
          className
        )}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      data-strength={strength}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium text-foreground",
        className
      )}
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={cn(
              "h-2 w-2 rounded-full",
              n <= dots ? "bg-foreground" : "bg-muted-foreground/30"
            )}
          />
        ))}
      </span>
      {label}
    </span>
  );
}
