"use client";

import { useState } from "react";
import { useMetric, useNextWorkout, useSettings } from "@/hooks";
import { getMonday } from "@/lib/dates";
import { Sparkline, type SparklineTone } from "@/components/chart-kit";
import { Delta, type DeltaBetter } from "@/components/ui/delta";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { formatLbs, shortLiftName } from "./format";

/** Sessions a week the old Dashboard ring counted towards (WeekSummary's `target`). */
export const WEEKLY_SESSION_TARGET = 5;

const DASH = "—";

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="text-xs text-muted-foreground">{children}</span>;
}

function toneFor(change: number | null | undefined, better: DeltaBetter): SparklineTone {
  if (!change || better === "none") return "neutral";
  return (better === "up" ? change > 0 : change < 0) ? "good" : "warn";
}

/** The glance row under the hero: weight, this week, and the two lifts trained next. */
export function GlanceTiles() {
  const next = useNextWorkout();
  const lifts = next?.template.exercises
    .filter((e) => e.tier === "T1" || e.tier === "T2")
    .map((e) => e.exerciseId);

  return (
    <section aria-label="At a glance" className="grid grid-cols-2 gap-2.5">
      <WeightTile />
      <WeekTile />
      {lifts ? lifts.map((id) => <LiftTile key={id} exerciseId={id} />) : [0, 1].map((i) => <TileSkeleton key={i} />)}
    </section>
  );
}

function WeightTile() {
  const settings = useSettings();
  const weight = useMetric("bodyweight");
  const rate = useMetric("lossRate");
  const trend = useMetric("bodyweight7d", undefined, "4w");
  if (!weight || !rate || !trend || settings === undefined) return <TileSkeleton />;

  const latest = weight.full.points.at(-1);
  const lbsPerWeek = rate.full.points.at(-1)?.v;
  const mode = settings?.trainingPhase?.mode;
  const better: DeltaBetter = mode === "cutting" ? "down" : mode === "bulking" ? "up" : "none";

  return (
    <StatTile
      href="/progress?tab=body"
      label="Weight"
      value={latest ? latest.v.toFixed(1) : DASH}
      unit={latest ? "lbs" : undefined}
      delta={
        !latest ? (
          <Hint>Log a weigh-in to see your trend</Hint>
        ) : lbsPerWeek !== undefined ? (
          <Delta value={lbsPerWeek} unit="lb/wk" better={better} format={(v) => v.toFixed(1)} />
        ) : undefined
      }
      sparkline={
        trend.series.points.length > 1 ? (
          <Sparkline points={trend.series.points} width={150} height={24} tone={toneFor(lbsPerWeek, better)} />
        ) : undefined
      }
    />
  );
}

function WeekTile() {
  const sessions = useMetric("sessionsPerWeek");
  const [weekStart] = useState(() => getMonday(new Date()).getTime());
  if (!sessions) return <TileSkeleton />;

  const points = sessions.full.points;
  const thisWeek = points.find((p) => p.t === weekStart)?.v ?? 0;

  return (
    <StatTile
      href="/log"
      label="This week"
      value={points.length === 0 ? DASH : `${thisWeek} / ${WEEKLY_SESSION_TARGET}`}
      delta={<Hint>{points.length === 0 ? "No workouts yet" : "sessions"}</Hint>}
    />
  );
}

function LiftTile({ exerciseId }: { exerciseId: string }) {
  const e1rm = useMetric("e1rm", { exerciseId }, "3m");
  if (!e1rm) return <TileSkeleton />;

  const latest = e1rm.full.points.at(-1);
  const change = e1rm.summary.change;

  return (
    <StatTile
      href={`/progress/lift/${exerciseId}`}
      label={`${shortLiftName(exerciseId)} est. 1RM`}
      value={latest ? formatLbs(Math.round(latest.v)) : DASH}
      unit={latest ? "lbs" : undefined}
      delta={
        !latest ? (
          <Hint>Finish a workout to estimate it</Hint>
        ) : change !== null ? (
          <Delta value={Math.round(change)} unit="lb" suffix="in 3 mo" better="up" />
        ) : undefined
      }
      sparkline={
        e1rm.series.points.length > 1 ? (
          <Sparkline points={e1rm.series.points} width={150} height={24} tone={toneFor(change, "up")} />
        ) : undefined
      }
    />
  );
}

function TileSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-2 rounded-[14px] bg-card p-3.5">
      <Skeleton className="h-3 w-16" />
      <Skeleton className="h-6 w-20" />
      <Skeleton className="h-3 w-24" />
    </div>
  );
}

export { TileSkeleton as GlanceTileSkeleton };
