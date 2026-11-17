"use client";

import { useMemo } from "react";
import { summarize } from "@/lib/metrics";
import type { Series } from "@/lib/metrics/types";
import { T3_LAST_SET_INCREASE_REPS } from "@/lib/progression";
import { loadingOf, type StrengthSet } from "@/lib/strength";
import { cn } from "@/lib/utils";
import { ChartEmpty, LazyTrendChart, formatShortDate } from "@/components/chart-kit";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { SectionHeader } from "@/components/ui/section-header";
import { SkeletonCard } from "@/components/ui/skeleton";
import { Term } from "@/components/ui/term";
import type { LiftSession } from "@/components/Lift/sessions";
import { strengthPoints, t3LastSets } from "./exercisePageModel";

/**
 * The exercise's own estimated max over time, from its own T1 sets (`sessionEstimates`):
 * never another exercise's. A dumbbell exercise's is the total load it moved.
 */
export function OwnStrength({
  exerciseId,
  name,
  sets,
}: {
  exerciseId: string;
  name: string;
  sets: readonly StrengthSet[] | undefined;
}) {
  const series = useMemo<Series>(
    () => ({
      metric: "e1rm",
      params: { exerciseId },
      points: strengthPoints(sets, exerciseId),
      unit: "lbs",
      better: "up",
    }),
    [sets, exerciseId]
  );
  const latest = summarize(series).latest;
  const twoDumbbells = loadingOf(exerciseId) === "two-dumbbells";

  return (
    <section aria-label="Strength" className="flex flex-col gap-1.5">
      <SectionHeader title="Strength" action={<EvidenceLine ruleId="e1rm-estimate" variant="icon" />} />
      <div className="flex items-baseline gap-2">
        <span className="text-xs text-muted-foreground">
          <Term id="e1rm">Estimated max</Term>
          {twoDumbbells && ", both dumbbells together"}
        </span>
        {latest && (
          <span data-testid="own-estimate" className="font-mono text-2xl font-bold tabular-nums text-foreground">
            {Math.round(latest.v)}
            <span className="ml-1 text-xs font-normal text-muted-foreground">lbs</span>
          </span>
        )}
      </div>
      {sets === undefined ? (
        <SkeletonCard />
      ) : series.points.length === 0 ? (
        <ChartEmpty message={`A T1 session of ${name} with a last set of 2 or more reps gives its estimate.`} height={64} />
      ) : (
        <LazyTrendChart
          series={series}
          variant="line"
          showPoints
          seriesLabel="Estimated max"
          ariaLabel={`${name} estimated max over time`}
        />
      )}
    </section>
  );
}

/**
 * A T3's strength in the program's own terms: each recent session's last set against
 * the rep count that adds weight. `sessions` is undefined while loading.
 */
export function T3Strength({ sessions }: { sessions: readonly LiftSession[] | undefined }) {
  const rows = sessions ? t3LastSets(sessions) : [];
  return (
    <section aria-label="Strength" className="flex flex-col gap-1.5">
      <SectionHeader title="Last set" action={<EvidenceLine ruleId="t3-progression" variant="icon" />} />
      <p className="text-[13px] text-muted-foreground">
        The weight goes up when the last set reaches {T3_LAST_SET_INCREASE_REPS} reps.
      </p>
      {sessions === undefined ? (
        <SkeletonCard />
      ) : rows.length === 0 ? (
        <p className="py-2 text-sm text-muted-foreground">No T3 sessions yet.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li
              key={row.key}
              data-testid="t3-last-set"
              className="flex min-h-11 items-center gap-3 border-b border-border py-2 last:border-b-0"
            >
              <span className="w-[52px] shrink-0 font-mono text-xs text-muted-foreground">{formatShortDate(row.t)}</span>
              <span className="font-mono text-sm">{row.weight} lbs</span>
              <span
                className={cn(
                  "ml-auto font-mono text-sm font-bold",
                  row.reached ? "text-accent-primary" : "text-foreground"
                )}
              >
                {row.reps}/{T3_LAST_SET_INCREASE_REPS}
              </span>
              <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                {row.reached ? "goes up" : `${T3_LAST_SET_INCREASE_REPS - row.reps} short`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
