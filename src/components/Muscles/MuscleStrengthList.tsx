"use client";

// Strength trend per muscle (H7): from `muscleStrengthIndex`, an index that starts at
// 100 for each muscle, not a weight. Tapping a muscle shows which exercises feed it.
import { useState } from "react";
import type { MuscleId } from "@/types";
import { EXERCISES } from "@/lib/exercises";
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
        not a weight in pounds.
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
                  const isOpen = open === muscle;
                  const contributors = [...last.contributors].sort(
                    (a, b) => b.weight - a.weight || b.relative - a.relative
                  );
                  return (
                    <li key={muscle} className="rounded-lg bg-muted/40">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : muscle)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-muted/70"
                      >
                        <span className="w-24 shrink-0 text-sm">{formatMuscle(muscle)}</span>
                        <Sparkline values={points.map((p) => p.index)} />
                        <span className="ml-auto text-right font-mono text-xs tabular-nums">
                          <span className="text-foreground">{last.index.toFixed(1)}</span>
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
                      {isOpen && (
                        <div className="px-3 pb-3" data-testid={`contributors-${muscle}`}>
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
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
