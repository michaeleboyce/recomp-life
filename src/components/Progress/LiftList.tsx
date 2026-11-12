"use client";

import { Sparkline } from "@/components/chart-kit";
import { Delta } from "@/components/ui/delta";
import { ListRow } from "@/components/ui/list-row";
import { SectionHeader } from "@/components/ui/section-header";
import { formatStage } from "./lifts";
import type { LiftOverview } from "./strength";

function LiftRow({ lift }: { lift: LiftOverview }) {
  const { liftState, summary, series, stall } = lift;
  const subtitle = liftState
    ? `working ${liftState.t1Weight} · ${formatStage(liftState.t1Stage)}`
    : undefined;
  const delta = stall ? (
    <Delta
      value={Math.round(stall.change)}
      suffix={`in ${stall.weeks} wk`}
      better="up"
      format={(abs) => (abs === 0 ? "+0" : String(abs))}
      className="text-warning"
    />
  ) : summary.change !== null ? (
    <Delta value={Math.round(summary.change)} better="up" />
  ) : undefined;

  return (
    <ListRow
      href={`/progress/lift/${lift.id}`}
      title={lift.label}
      subtitle={subtitle && <span className="font-mono text-xs">{subtitle}</span>}
      trailing={
        <span className="flex items-center gap-3">
          {series.points.length > 0 && (
            <Sparkline points={series.points} tone={stall ? "warn" : "good"} />
          )}
          <span className="flex w-16 flex-col items-end">
            <span className="font-mono text-lg font-bold tabular-nums text-foreground">
              {summary.latest ? Math.round(summary.latest.v) : "–"}
            </span>
            {delta}
          </span>
        </span>
      }
      className="min-h-[62px]"
    />
  );
}

/** One row per main lift, linking to its detail page. */
export function LiftList({ lifts }: { lifts: LiftOverview[] }) {
  return (
    <section aria-label="Lifts">
      <SectionHeader title="Lifts" className="mb-0.5" />
      <div data-testid="lift-list">
        {lifts.map((lift) => (
          <LiftRow key={lift.id} lift={lift} />
        ))}
      </div>
    </section>
  );
}
