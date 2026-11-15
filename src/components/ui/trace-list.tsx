import { cn } from "@/lib/utils"
import { getRule, isRuleId } from "@/lib/evidence"
import type { DecisionTrace, TraceAlternative, TraceStep, TraceUnit } from "@/types/glass"
import { GradeChip } from "./grade-chip"

/** 180 -> "3:00". */
function clock(seconds: number): string {
  const s = Math.round(Math.abs(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

function magnitude(value: number, unit: TraceUnit): string {
  if (unit === "s") return clock(value)
  return String(Math.round(Math.abs(value) * 10) / 10)
}

/** The right-hand number of a step: "205", "+10", "+0", "−5", "215". */
export function formatTraceEffect(step: TraceStep): string {
  const { op, value, unit } = step.effect
  if (op === "none") return "+0"
  if (value === undefined) return ""
  if (op === "add") return `${value < 0 ? "−" : "+"}${magnitude(value, unit)}`
  return `${value < 0 ? "−" : ""}${magnitude(value, unit)}`
}

function effectTone(step: TraceStep): string {
  const { op, value = 0 } = step.effect
  if (op === "none" || (op === "add" && value === 0)) return "text-muted-foreground"
  if (op === "add") return value > 0 ? "text-chart-good" : "text-chart-warn"
  if (op === "round" || op === "set") return "text-primary"
  return "text-foreground"
}

const UNIT_WORDS: Record<TraceUnit, string> = {
  lb: "lb",
  s: "",
  reps: "reps",
  sets: "sets",
  count: "",
  none: "",
}

function spokenEffect(step: TraceStep): string {
  const text = formatTraceEffect(step).replace("−", "minus ")
  if (!text) return ""
  const unit = UNIT_WORDS[step.effect.unit]
  return unit ? `${text} ${unit}` : text
}

export interface TraceListProps {
  trace: DecisionTrace
  /**
   * When set, the alternatives become buttons and this is called with the
   * chosen value. Without it they are shown for information only.
   */
  onChooseAlternative?: (alternative: TraceAlternative) => void
  /** Heading over the alternatives. */
  alternativesTitle?: string
  className?: string
}

/**
 * The working behind one planned number: numbered steps in the order the app
 * ran them, each with its effect and the evidence grade of the rule behind it,
 * then the nearby alternatives.
 */
function TraceList({
  trace,
  onChooseAlternative,
  alternativesTitle = "Your call",
  className,
}: TraceListProps) {
  const alternatives = trace.alternatives ?? []
  return (
    <div data-slot="trace-list" className={cn("flex flex-col gap-4", className)}>
      <ol className="flex flex-col">
        {trace.steps.map((step, i) => {
          const rule = step.ruleId && isRuleId(step.ruleId) ? getRule(step.ruleId) : null
          const effect = formatTraceEffect(step)
          return (
            <li
              key={`${step.id}-${i}`}
              data-step={step.id}
              className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-start gap-2.5 border-t border-border py-2"
            >
              <span
                aria-hidden="true"
                className="flex size-6 items-center justify-center rounded-full bg-secondary font-mono text-xs"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-bold">{step.title}</span>
                  {rule && <GradeChip strength={rule.strength} />}
                </p>
                <p className="text-xs leading-snug text-muted-foreground">{step.detail}</p>
              </div>
              {effect && (
                <span
                  data-effect={step.effect.op}
                  className={cn(
                    "text-right font-display text-lg font-extrabold leading-tight whitespace-nowrap tabular-nums",
                    effectTone(step)
                  )}
                >
                  <span aria-hidden="true">{effect}</span>
                  <span className="sr-only">{spokenEffect(step)}</span>
                </span>
              )}
            </li>
          )
        })}
      </ol>

      {alternatives.length > 0 && (
        <section aria-label={alternativesTitle} className="rounded-2xl bg-card p-3">
          <p className="mb-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {alternativesTitle}
          </p>
          <div className="grid auto-cols-fr grid-flow-col gap-2">
            {alternatives.map((alt) => {
              const current = String(alt.value) === String(trace.result)
              const body = (
                <>
                  <span className="font-display text-xl leading-none font-extrabold tabular-nums">
                    {alt.value}
                  </span>
                  <span className={cn("text-[11px]", current ? "" : "text-muted-foreground")}>
                    {alt.label}
                    {alt.note ? ` · ${alt.note}` : ""}
                  </span>
                </>
              )
              const box = cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-2 text-center",
                current
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border text-foreground"
              )
              return onChooseAlternative ? (
                <button
                  key={`${alt.label}-${alt.value}`}
                  type="button"
                  aria-pressed={current}
                  onClick={() => onChooseAlternative(alt)}
                  className={box}
                >
                  {body}
                </button>
              ) : (
                <div key={`${alt.label}-${alt.value}`} data-current={current || undefined} className={box}>
                  {body}
                </div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

export { TraceList }
