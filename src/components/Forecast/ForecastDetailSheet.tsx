"use client";

import Link from "next/link";
import { ChevronRight, XIcon } from "lucide-react";
import { RangeBar } from "@/components/chart-kit";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { GradeChip } from "@/components/ui/grade-chip";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Stripes } from "@/components/ui/stripes";
import { FORECAST_KINDS } from "@/lib/forecast";
import { STRENGTH_LABELS } from "@/lib/evidence";
import {
  inputLines,
  liftLabel,
  LIFTS_WITH_PAGE,
  TARGET_IN_TEN,
  type ForecastView,
} from "@/lib/forecast/text";

/**
 * The working behind one stored forecast: the number and range as stored, the inputs
 * the model saw when it was made, the rule that owns its numbers and, for a lift, a
 * link to the lift's page.
 */
export function ForecastDetailSheet({
  view,
  onOpenChange,
}: {
  view: ForecastView | null;
  onOpenChange: (open: boolean) => void;
}) {
  const forecast = view?.forecast;
  const exerciseId = forecast?.exerciseId;
  return (
    <Sheet open={view !== null} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-3xl pb-[env(safe-area-inset-bottom)]"
      >
        {view && forecast && (
          <>
            <SheetHeader className="relative gap-2 pb-2">
              <SheetTitle className="pr-12 text-xs font-semibold tracking-[0.16em] text-primary uppercase">
                {FORECAST_KINDS[forecast.kind].label}
              </SheetTitle>
              <p className="pr-12 text-base font-semibold text-foreground">{view.question}</p>
              <div className="flex items-end justify-between gap-3">
                <span className="flex items-baseline gap-1.5">
                  <span className="font-display text-5xl leading-[0.9] font-extrabold tabular-nums">
                    {view.value}
                  </span>
                  {view.valueUnit && (
                    <span className="font-display text-base font-bold text-muted-foreground uppercase">
                      {view.valueUnit}
                    </span>
                  )}
                </span>
                {view.range && (
                  <span className="font-mono text-sm text-muted-foreground">{view.range}</span>
                )}
              </div>
              {view.bar && (
                <RangeBar
                  low={view.bar.low}
                  high={view.bar.high}
                  point={view.bar.point}
                  min={view.bar.min}
                  max={view.bar.max}
                  formatValue={view.bar.format}
                  ariaLabel={view.bar.label}
                />
              )}
              <SheetDescription className="text-xs">
                {view.due}. Stored when it was made and never changed
                {view.bar && view.bar.min === undefined
                  ? `; the range is built to hold the result ${TARGET_IN_TEN}.`
                  : "."}
              </SheetDescription>
              <Stripes className="w-20" />
              <SheetClose className="absolute top-2 right-2 inline-flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden">
                <XIcon className="size-5" aria-hidden="true" />
                <span className="sr-only">Close</span>
              </SheetClose>
            </SheetHeader>

            <div className="flex flex-col gap-4 px-4 pb-6">
              <section aria-labelledby="forecast-inputs">
                <h2
                  id="forecast-inputs"
                  className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase"
                >
                  What it rests on
                </h2>
                <p className="mt-1 text-sm text-foreground">{view.restsOn}</p>
                <dl className="mt-2 divide-y divide-border">
                  {inputLines(forecast).map((line) => (
                    <div key={line.label} className="flex items-baseline justify-between gap-3 py-1.5">
                      <dt className="text-[13px] text-muted-foreground">{line.label}</dt>
                      <dd className="text-right font-mono text-[13px] text-foreground tabular-nums">
                        {line.value}
                      </dd>
                    </div>
                  ))}
                </dl>
                {view.earlierOpen > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {view.earlierOpen === 1
                      ? "One earlier forecast of this is still waiting for its date"
                      : `${view.earlierOpen} earlier forecasts of this are still waiting for their dates`}
                    ; each is scored on its own.
                  </p>
                )}
              </section>

              <section aria-label="The rule behind it" className="flex flex-col gap-1">
                <span className="flex items-center gap-2">
                  <GradeChip strength={view.strength} />
                  <span className="text-xs text-muted-foreground">
                    {STRENGTH_LABELS[view.strength]}
                  </span>
                </span>
                <EvidenceLine ruleId={view.ruleId} />
              </section>

              {exerciseId && LIFTS_WITH_PAGE.includes(exerciseId) && (
                <Link
                  href={`/progress/lift/${exerciseId}`}
                  className="flex min-h-11 items-center justify-between rounded-xl bg-card px-3.5 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-card-raised focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  {liftLabel(exerciseId)} page
                  <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
