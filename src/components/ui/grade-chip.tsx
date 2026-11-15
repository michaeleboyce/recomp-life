import { cn } from "@/lib/utils"
import type { EvidenceStrength } from "@/types"

/** Short chip words. Long forms ("Strong evidence") live in STRENGTH_LABELS. */
export const GRADE_LABELS: Record<EvidenceStrength, string> = {
  strong: "Strong",
  moderate: "Moderate",
  limited: "Limited",
  heuristic: "Heuristic",
  program: "Program rule",
}

/**
 * Each grade differs in fill and outline as well as colour: strong is solid,
 * moderate and limited are outlined, heuristic is dashed and program rule is a
 * neutral fill. The word is always shown, so colour is never the only signal.
 */
const GRADE_STYLE: Record<EvidenceStrength, string> = {
  strong: "border-transparent bg-[var(--grade-strong)] text-background",
  moderate: "border-[var(--grade-moderate)] text-[var(--grade-moderate)]",
  limited: "border-[var(--grade-limited)] text-[var(--grade-limited)]",
  heuristic: "border-dashed border-[var(--grade-heuristic)] text-[var(--grade-heuristic)]",
  program: "border-transparent bg-[var(--grade-program)] text-foreground",
}

export interface GradeChipProps {
  strength: EvidenceStrength
  /** "sm" (default) for rows and inline text; "md" for headers. */
  size?: "sm" | "md"
  /** Overrides the short word, e.g. the long form "Strong evidence". */
  label?: string
  className?: string
}

/** How well research supports a rule, as a small labelled chip. */
function GradeChip({ strength, size = "sm", label, className }: GradeChipProps) {
  return (
    <span
      data-slot="grade-chip"
      data-strength={strength}
      className={cn(
        "inline-flex w-fit shrink-0 items-center whitespace-nowrap rounded-full border-[1.5px] align-middle font-bold uppercase tracking-[0.08em]",
        size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs",
        GRADE_STYLE[strength],
        className
      )}
    >
      {label ?? GRADE_LABELS[strength]}
    </span>
  )
}

export { GradeChip }
