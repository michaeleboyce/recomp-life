import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatShortCitation, getRule, isRuleId, type RuleId } from "@/lib/evidence";
import type { DecisionTrace, EvidenceStrength, TraceStep, TraceUnit } from "@/types";
import { GRADE_LABELS, GradeChip } from "@/components/ui/grade-chip";
import { formatTraceEffect } from "@/components/ui/trace-list";

/** The research library's entry for a rule. */
export function ruleHref(ruleId: string): string {
  return `/research#${ruleId}`;
}

const UNIT_WORDS: Record<TraceUnit, string> = {
  lb: "pounds",
  s: "",
  reps: "reps",
  sets: "sets",
  count: "",
  none: "",
};

/** The effect as a screen reader says it: "plus 10 pounds", "3:30". */
export function spokenEffect(step: TraceStep): string {
  if (step.effect.op === "none") return "no change";
  const text = formatTraceEffect(step).replace("−", "minus ").replace(/^\+/, "plus ");
  if (!text) return "";
  const unit = UNIT_WORDS[step.effect.unit];
  return unit ? `${text} ${unit}` : text;
}

function effectTone(step: TraceStep): string {
  const { op, value = 0 } = step.effect;
  if (op === "none" || (op === "add" && value === 0)) return "text-muted-foreground";
  if (op === "add") return value > 0 ? "text-chart-good" : "text-chart-warn";
  if (op === "round" || op === "set") return "dark:text-primary";
  return "text-foreground";
}

interface CitedRule {
  id: RuleId;
  strength: EvidenceStrength;
  title: string;
  /** Footnote number in the light (worked calculation) layout. */
  note: number;
}

/** The rules the steps cite, numbered in the order they first appear. */
export function citedRules(trace: DecisionTrace): Map<string, CitedRule> {
  const cited = new Map<string, CitedRule>();
  for (const step of trace.steps) {
    if (!step.ruleId || cited.has(step.ruleId) || !isRuleId(step.ruleId)) continue;
    const rule = getRule(step.ruleId);
    cited.set(step.ruleId, {
      id: step.ruleId,
      strength: rule.strength,
      title: rule.title,
      note: cited.size + 1,
    });
  }
  return cited;
}

/** How a footnote describes a rule's support: "GZCLP program rule, not a research finding". */
function footnoteText(rule: CitedRule): string {
  if (rule.strength === "program") return "GZCLP program rule, not a research finding";
  const citation = formatShortCitation(rule.id);
  if (rule.strength === "heuristic") return `${citation}: the app's own rule`;
  return `${citation}: ${GRADE_LABELS[rule.strength].toLowerCase()} evidence`;
}

export interface WhyStepsProps {
  trace: DecisionTrace;
  className?: string;
}

/**
 * The checks behind one planned number, in the order the app ran them. Dark theme:
 * numbered rows with each rule's grade chip (board GlassWhy). Light theme: the same
 * rows as a ruled calculation with footnotes under it (board PaperWhy). Each grade
 * opens the rule in the research library.
 */
export function WhySteps({ trace, className }: WhyStepsProps) {
  const cited = citedRules(trace);
  const last = trace.steps.length - 1;
  return (
    <div data-slot="why-steps" className={cn("flex flex-col gap-3", className)}>
      <ol
        aria-label="Checks, in the order the app ran them"
        className="flex flex-col border-t-2 border-foreground dark:border-t-0"
      >
        {trace.steps.map((step, i) => {
          const rule = step.ruleId ? cited.get(step.ruleId) : undefined;
          const effect = formatTraceEffect(step);
          const total = i === last && (step.effect.op === "round" || step.effect.op === "set");
          return (
            <li
              key={`${step.id}-${i}`}
              data-step={step.id}
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2.5 border-b border-border py-2 dark:grid-cols-[24px_minmax(0,1fr)_auto] dark:border-t dark:border-b-0",
                total && "border-b-2 border-b-foreground dark:border-b-0"
              )}
            >
              <span
                aria-hidden="true"
                className="hidden size-6 items-center justify-center rounded-full bg-secondary font-mono text-xs dark:flex"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-bold">
                    {step.title}
                    {rule && (
                      <Link
                        href={ruleHref(rule.id)}
                        aria-label={`${GRADE_LABELS[rule.strength]}: ${rule.title}`}
                        className="relative ml-0.5 align-super font-mono text-xs text-primary after:absolute after:-inset-3 after:content-[''] dark:hidden"
                      >
                        {rule.note}
                      </Link>
                    )}
                  </span>
                  {rule && (
                    <Link
                      href={ruleHref(rule.id)}
                      aria-label={`${GRADE_LABELS[rule.strength]}: ${rule.title}`}
                      className="relative hidden rounded-full outline-none after:absolute after:-inset-y-3 after:-inset-x-1 after:content-[''] focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:inline-flex"
                    >
                      <GradeChip strength={rule.strength} />
                    </Link>
                  )}
                </p>
                <p className="text-xs leading-snug text-muted-foreground">{step.detail}</p>
              </div>
              {effect && (
                <span
                  data-effect={step.effect.op}
                  className={cn(
                    "text-right leading-tight whitespace-nowrap tabular-nums",
                    "font-mono text-base dark:font-display dark:text-lg dark:font-extrabold",
                    total && "font-display text-3xl font-extrabold dark:text-lg",
                    effectTone(step)
                  )}
                >
                  <span aria-hidden="true">{effect}</span>
                  <span className="sr-only">{spokenEffect(step)}</span>
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {cited.size > 0 && (
        <ol
          aria-label="Sources"
          className="flex flex-col gap-0.5 font-mono text-xs leading-relaxed text-muted-foreground dark:hidden"
        >
          {[...cited.values()].map((rule) => (
            <li key={rule.id}>
              <span className="text-primary">{rule.note}</span>{" "}
              <Link href={ruleHref(rule.id)} className="underline decoration-dotted underline-offset-2">
                {footnoteText(rule)}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
