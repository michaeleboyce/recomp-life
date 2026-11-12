"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { BarSeries, ChartFrame, LazyTrendChart, formatShortDate } from "@/components/chart-kit";
import type { Series } from "@/lib/metrics/types";
import { cn } from "@/lib/utils";
import { formatCompact, type LiftMetrics } from "./liftSeries";

const latestText = (series: Series, format: (v: number) => string = (v) => String(Number(v.toFixed(1)))) => {
  const last = series.points[series.points.length - 1];
  return last ? format(last.v) : undefined;
};

/** Working weight, last-set reps, effort and weekly volume, behind a disclosure. */
export function MoreCharts({ metrics, liftName }: { metrics: LiftMetrics; liftName: string }) {
  const [open, setOpen] = useState(false);
  const volume = metrics.weeklyVolume;

  return (
    <section aria-label="More charts" className="flex flex-col gap-4">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="lift-more-charts"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 items-center justify-between rounded-lg text-sm font-semibold text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        More charts
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id="lift-more-charts" className="flex flex-col gap-6">
          <ChartFrame title="Working weight" value={latestText(metrics.workingWeight.series)}>
            <LazyTrendChart
              series={metrics.workingWeight.series}
              variant="steps"
              ariaLabel={`${liftName} working weight over time`}
            />
          </ChartFrame>
          <ChartFrame title="Last-set reps" value={latestText(metrics.amrapReps.series)}>
            <LazyTrendChart
              series={metrics.amrapReps.series}
              ariaLabel={`${liftName} last-set reps over time`}
            />
          </ChartFrame>
          <ChartFrame title="Effort (RPE)" value={latestText(metrics.avgRpe.series)}>
            <LazyTrendChart series={metrics.avgRpe.series} ariaLabel={`${liftName} RPE over time`} />
          </ChartFrame>
          <ChartFrame title="Weekly volume" value={latestText(volume, formatCompact)}>
            <BarSeries
              orientation="vertical"
              data={volume.points.map((p) => ({
                key: String(p.t),
                label: formatShortDate(p.t),
                value: p.v,
              }))}
              formatValue={formatCompact}
              ariaLabel={`${liftName} weekly volume in lbs`}
            />
          </ChartFrame>
        </div>
      )}
    </section>
  );
}
