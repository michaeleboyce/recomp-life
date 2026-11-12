"use client";

import { LazyTrendChart, RangeTabs } from "@/components/chart-kit";
import { Delta } from "@/components/ui/delta";
import type { RangeKey } from "@/lib/metrics/types";
import type { StrengthOverview } from "./strength";
import { rangeSuffix } from "./rangeText";

/** Headline: the summed est. 1RM, its change over the range, and an area chart of it. */
export function StrengthTotal({
  total,
  range,
  onRangeChange,
}: {
  total: StrengthOverview["total"];
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
}) {
  const { summary, series, label } = total;
  return (
    <section className="flex flex-col gap-1.5" aria-label="Strength total">
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="text-xs font-normal text-muted-foreground">{label}</h2>
          <div className="flex items-baseline gap-2">
            <span
              data-testid="strength-total"
              className="font-mono text-[34px] leading-tight font-bold tabular-nums text-foreground"
            >
              {summary.latest ? Math.round(summary.latest.v) : "–"}
            </span>
            {summary.change !== null && (
              <Delta
                value={Math.round(summary.change)}
                better="up"
                suffix={rangeSuffix(series.points)}
                className="text-sm"
              />
            )}
          </div>
        </div>
        <RangeTabs value={range} onChange={onRangeChange} options={["4w", "3m", "1y", "all"]} />
      </div>
      <LazyTrendChart
        series={series}
        variant="area"
        height={150}
        ariaLabel={`${label} over time`}
        emptyMessage="No estimates in this range"
      />
    </section>
  );
}
