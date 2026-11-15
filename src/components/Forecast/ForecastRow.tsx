"use client";

import { RangeBar } from "@/components/chart-kit";
import { GradeChip } from "@/components/ui/grade-chip";
import { cn } from "@/lib/utils";
import type { ForecastView } from "./forecastText";

/**
 * One open forecast as stored: what is predicted, the number and its range, when it
 * is checked, what it rests on and the grade of its rule. A button that opens the
 * detail sheet.
 */
export function ForecastRow({
  view,
  onOpen,
  className,
}: {
  view: ForecastView;
  onOpen: (view: ForecastView) => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-slot="forecast-row"
      data-kind={view.forecast.kind}
      onClick={() => onOpen(view)}
      className={cn(
        "grid w-full grid-cols-[minmax(0,1fr)_auto] items-end gap-x-3 gap-y-1.5 border-t border-border py-3 text-left outline-none transition-colors first:border-t-0 hover:bg-card/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 active:bg-card",
        className
      )}
    >
      <span className="flex min-w-0 flex-col gap-1">
        <span className="text-sm font-semibold text-foreground">{view.question}</span>
        <span className="text-xs text-muted-foreground">{view.restsOn}</span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <GradeChip strength={view.strength} />
          <span className="text-xs text-muted-foreground">{view.due}</span>
        </span>
      </span>
      <span className="flex flex-col items-end">
        <span className="flex items-baseline gap-1">
          <span
            data-slot="forecast-value"
            className="font-display text-2xl leading-none font-extrabold whitespace-nowrap text-foreground tabular-nums"
          >
            {view.value}
          </span>
          {view.valueUnit && (
            <span className="text-xs font-semibold text-muted-foreground">{view.valueUnit}</span>
          )}
        </span>
        {view.range && (
          <span className="mt-1 font-mono text-xs whitespace-nowrap text-muted-foreground">
            {view.range}
          </span>
        )}
      </span>
      {view.bar && (
        <span className="col-span-2 pt-1">
          <RangeBar
            low={view.bar.low}
            high={view.bar.high}
            point={view.bar.point}
            formatValue={view.bar.format}
          />
        </span>
      )}
    </button>
  );
}
