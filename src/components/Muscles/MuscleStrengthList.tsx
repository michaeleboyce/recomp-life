"use client";

// Strength trend per muscle (H7): from `muscleStrengthIndex`, an index that starts at
// 100 for each muscle, not a weight. Tapping a muscle opens its full chart (M10): the
// smooth line of the index, a dot per contributing session by exercise, the legend with
// each exercise's weight, the strip of which exercises carry it, and the window and
// smoothing controls the lift pages have.
import { useState } from "react";
import { TrendChartSkeleton } from "@/components/chart-kit";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StrengthTrendPanel } from "@/components/StrengthTrend/StrengthTrendPanel";
import { useMuscleTimeline } from "@/hooks";
import type { MuscleId } from "@/types";
import { EXERCISES } from "@/lib/exercises";
import type { RangeKey } from "@/lib/metrics/types";
import type { WindowSpan } from "@/lib/metrics/window";
import { MUSCLE_GROUPS, MUSCLE_GROUP_ORDER, formatMuscle } from "@/lib/muscles";
import { MUSCLE_WEIGHTS, type MuscleStrengthIndex } from "@/lib/strength";
import { cn } from "@/lib/utils";

const W = 72;
const H = 24;

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="h-6 w-[72px]" aria-hidden="true" />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values
    .map((v, i) => `${((i / (values.length - 1)) * W).toFixed(1)},${(H - 2 - ((v - lo) / span) * (H - 4)).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" className="shrink-0 text-primary">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** The full strength trend chart of one muscle, from the same index the row shows. */
function MuscleTrend({ muscle, index }: { muscle: MuscleId; index: MuscleStrengthIndex }) {
  const timeline = useMuscleTimeline(muscle, index);
  const [range, setRange] = useState<RangeKey>("3m");
  const [span, setSpan] = useState<WindowSpan | null>(null);
  if (!timeline) return <TrendChartSkeleton height={200} />;
  return (
    <StrengthTrendPanel
      timeline={timeline}
      range={range}
      onRangeChange={setRange}
      span={span}
      onSpanChange={setSpan}
      title="Strength trend, an index"
      headingLevel={3}
      size="md"
      ariaLabel={`${formatMuscle(muscle)} strength trend over time`}
      anchorLabel="Index"
      anchorTestId="muscle-trend-latest"
      note="It stays an index (100 at the muscle's first reading): a muscle has no one-rep max, so each exercise is compared with its own earlier sessions and the changes are averaged."
    />
  );
}

function Contributors({ muscle, index }: { muscle: MuscleId; index: MuscleStrengthIndex }) {
  const points = index[muscle] ?? [];
  const last = points[points.length - 1];
  if (!last) return null;
  const contributors = [...last.contributors].sort((a, b) => b.weight - a.weight || b.relative - a.relative);
  return (
    <div data-testid={`contributors-${muscle}`}>
      <p className="mb-1 text-xs text-muted-foreground">Exercises behind the latest reading</p>
      <ul className="space-y-0.5">
        {contributors.map((c) => (
          <li key={c.exerciseId} className="flex items-baseline justify-between gap-2 text-sm">
            <span>{EXERCISES[c.exerciseId]?.name ?? c.exerciseId}</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {c.weight === MUSCLE_WEIGHTS.primary ? "main" : "helper"} · {c.relative.toFixed(1)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MuscleStrengthList({ index }: { index: MuscleStrengthIndex }) {
  const [open, setOpen] = useState<MuscleId | null>(null);
  const groups = MUSCLE_GROUP_ORDER.map((group) => ({
    group,
    muscles: MUSCLE_GROUPS[group].filter((m) => (index[m]?.length ?? 0) > 0),
  })).filter((g) => g.muscles.length > 0);

  return (
    <div data-testid="muscle-strength">
      <p className="mb-4 text-sm text-muted-foreground">
        Each muscle&apos;s strength trend pools every exercise that works it, barbell and home.
        A main muscle counts fully and a helping muscle half. Each exercise is compared with its
        own earlier sessions, then the changes are averaged. It is an index that starts at 100,
        not a weight in pounds. Tap a muscle for its chart.
      </p>
      {groups.length === 0 ? (
        <p className="rounded-lg bg-muted/40 px-3 py-4 text-sm text-muted-foreground">
          No strength trend yet. Log a few sessions of a lift or home exercise, taking the last
          set as far as you can, and the muscles it works will appear here.
        </p>
      ) : (
        <div className="space-y-4">
          {groups.map(({ group, muscles }) => (
            <section key={group}>
              <h2 className="mb-1 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{group}</h2>
              <ul className="space-y-1">
                {muscles.map((muscle) => {
                  const points = index[muscle]!;
                  const last = points[points.length - 1];
                  const change = Math.round((last.index - points[0].index) * 10) / 10;
                  return (
                    <li key={muscle} className="rounded-lg bg-muted/40">
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        aria-expanded={open === muscle}
                        onClick={() => setOpen(muscle)}
                        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/70"
                      >
                        <span className="flex w-24 shrink-0 flex-col">
                          <span className="text-sm">{formatMuscle(muscle)}</span>
                          <span className="text-[11px] text-muted-foreground">strength trend</span>
                        </span>
                        <Sparkline values={points.map((p) => p.index)} />
                        <span className="ml-auto text-right font-mono text-xs tabular-nums">
                          <span data-testid={`muscle-index-${muscle}`} className="text-foreground">
                            {last.index.toFixed(1)}
                          </span>
                          <span
                            className={cn(
                              "ml-2",
                              change > 0 ? "text-success" : change < 0 ? "text-warning" : "text-muted-foreground"
                            )}
                          >
                            {change > 0 ? "+" : ""}
                            {change.toFixed(1)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <Sheet open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent side="bottom" className="max-h-[92dvh] gap-0 overflow-y-auto rounded-t-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {open && (
            <>
              <SheetHeader className="px-0 pb-2">
                <SheetTitle className="font-display text-xl font-bold text-foreground">{formatMuscle(open)}</SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  Strength trend from every exercise that works it
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-col gap-5">
                <MuscleTrend muscle={open} index={index} />
                <Contributors muscle={open} index={index} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
