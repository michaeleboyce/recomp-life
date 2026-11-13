"use client";

import { LazyTrendChart, RangeTabs } from "@/components/chart-kit";
import { Delta } from "@/components/ui/delta";
import { Term } from "@/components/ui/term";
import type { RangeKey } from "@/lib/metrics/types";
import { rangeSuffix } from "@/components/Progress/rangeText";
import { trendOverlay, type RangedMetric } from "./liftSeries";

/** "Estimated 1RM": the latest value, its change over the range, and the e1RM line. */
export function LiftHeadline({
  e1rm,
  liftName,
  range,
  onRangeChange,
}: {
  e1rm: RangedMetric;
  liftName: string;
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
}) {
  const { series, summary } = e1rm;
  const trend = trendOverlay(series.points);
  return (
    <section className="flex flex-col gap-1.5" aria-label="Estimated 1RM">
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-xs font-normal text-muted-foreground">
            <Term id="e1rm">Estimated 1RM</Term>
          </h2>
          <div className="flex items-baseline gap-2">
            <span
              data-testid="e1rm-latest"
              className="font-mono text-[44px] leading-none font-bold tabular-nums text-foreground"
            >
              {summary.latest ? Math.round(summary.latest.v) : "–"}
            </span>
            <span className="font-mono text-sm text-muted-foreground">lbs</span>
            {summary.change !== null && (
              <Delta
                data-testid="e1rm-change"
                value={Math.round(summary.change)}
                better="up"
                suffix={rangeSuffix(series.points)}
                className="text-sm"
              />
            )}
          </div>
        </div>
        <RangeTabs value={range} onChange={onRangeChange} />
      </div>
      <LazyTrendChart
        series={series}
        variant="line"
        showPoints
        overlays={trend ? [trend] : undefined}
        seriesLabel="Estimated 1RM"
        ariaLabel={`${liftName} estimated 1RM over time`}
        emptyMessage="No estimates in this range"
      />
    </section>
  );
}
