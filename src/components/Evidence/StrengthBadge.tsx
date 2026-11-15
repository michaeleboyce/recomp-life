import { STRENGTH_LABELS } from "@/lib/evidence";
import { GradeChip } from "@/components/ui/grade-chip";
import type { EvidenceStrength } from "@/types";

interface StrengthBadgeProps {
  strength: EvidenceStrength;
  className?: string;
}

/**
 * How well research supports a rule, as a grade chip with the long label
 * ("Strong evidence", "Coaching heuristic"). Heuristics are dashed and program
 * rules neutral, so they are never mistaken for research findings.
 */
export function StrengthBadge({ strength, className }: StrengthBadgeProps) {
  return (
    <GradeChip strength={strength} label={STRENGTH_LABELS[strength]} className={className} />
  );
}
