"use client";

import { LazyTrendChart, RangeTabs } from "@/components/chart-kit";
import { Delta } from "@/components/ui/delta";
import { Term } from "@/components/ui/term";
import type { RangeKey } from "@/lib/metrics/types";
import type { StrengthOverview } from "./strength";
import { rangeSuffix } from "./rangeText";

const E1RM_WORDS = "est. 1RM";

/** "Total of four lifts, est. 1RM" with "est. 1RM" opening its glossary entry. */
function LabelWithTerm({ label }: { label: string }) {
  const at = label.lastIndexOf(E1RM_WORDS);
  if (at < 0) return <>{label}</>;
  return (
    <>
      {label.slice(0, at)}
      <Term id="e1rm">{E1RM_WORDS}</Term>
      {label.slice(at + E1RM_WORDS.length)}
    </>
  );
}

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
    <section className="flex flex-col gap-2" aria-label="Strength total">
      <div className="flex items-center justify-between gap-3">
        <h2 className="min-w-0 font-display text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          <LabelWithTerm label={label} />
        </h2>
        <RangeTabs value={range} onChange={onRangeChange} options={["4w", "3m", "1y", "all"]} />
      </div>
      <div className="flex items-baseline gap-3">
        <span
          data-testid="strength-total"
          className="font-display text-[64px] leading-none font-bold tabular-nums text-foreground"
        >
          {summary.latest ? Math.round(summary.latest.v) : "–"}
        </span>
        {summary.change !== null && (
          <Delta
            value={Math.round(summary.change)}
            better="up"
            suffix={rangeSuffix(series.points)}
            className="text-sm whitespace-nowrap"
          />
        )}
      </div>
      <LazyTrendChart
        series={series}
        variant="area"
        height={150}
        seriesLabel="Est. 1RM total"
        ariaLabel={`${label} over time`}
        emptyMessage="No estimates in this range"
      />
    </section>
  );
}
