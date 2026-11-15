"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { DecisionTrace, TraceAlternative, TraceUnit } from "@/types/glass"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./sheet"
import { Stripes } from "./stripes"
import { TraceList } from "./trace-list"

const RESULT_UNIT: Record<TraceUnit, string> = {
  lb: "lb",
  s: "",
  reps: "reps",
  sets: "sets",
  count: "",
  none: "",
}

function formatResult(result: number | string, unit: TraceUnit): string {
  if (typeof result === "number" && unit === "s") {
    const s = Math.round(result)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
  }
  return String(result)
}

export interface WhySheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Eyebrow over the number, e.g. "T1 · Deadlift · why this weight". */
  title: string
  trace: DecisionTrace
  /** Optional note under the result, e.g. the scheme "5×3+". */
  subtitle?: string
  onChooseAlternative?: (alternative: TraceAlternative) => void
  /** Extra content after the steps, such as a link to past adjustments. */
  children?: React.ReactNode
  className?: string
}

/**
 * Bottom sheet that shows how a planned number was reached: the result, then
 * every step in the order the app ran it, then the alternatives.
 */
function WhySheet({
  open,
  onOpenChange,
  title,
  trace,
  subtitle,
  onChooseAlternative,
  children,
  className,
}: WhySheetProps) {
  const unit = RESULT_UNIT[trace.unit]
  const count = trace.steps.length
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className={cn("max-h-[90dvh] gap-0 overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]", className)}
      >
        <SheetHeader className="relative gap-2 pb-2">
          <SheetTitle className="pr-12 text-[11px] font-semibold tracking-[0.16em] text-tier-t1 uppercase">
            {title}
          </SheetTitle>
          <div className="flex items-end justify-between gap-3">
            <div className="flex items-baseline gap-2">
              <span
                data-slot="why-result"
                className="font-display text-6xl leading-[0.9] font-extrabold tabular-nums"
              >
                {formatResult(trace.result, trace.unit)}
              </span>
              {(unit || subtitle) && (
                <span className="font-display text-base font-bold text-muted-foreground uppercase">
                  {[unit, subtitle].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
            <SheetDescription className="max-w-[9rem] text-right text-xs">
              {count === 1 ? "One check" : `${count} checks`}, in the order the app ran them
            </SheetDescription>
          </div>
          <Stripes className="w-20" />
          <SheetClose
            className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden"
          >
            <XIcon className="size-5" aria-hidden="true" />
            <span className="sr-only">Close</span>
          </SheetClose>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-6">
          <TraceList trace={trace} onChooseAlternative={onChooseAlternative} />
          {children}
        </div>
      </SheetContent>
    </Sheet>
  )
}

export { WhySheet }
