"use client";

import { useState } from "react";
import { useBodyweightLog, useMetric, useNextWorkout, useSettings } from "@/hooks";
import { getMonday } from "@/lib/dates";
import { Sparkline, type SparklineTone } from "@/components/chart-kit";
import { Delta, type DeltaBetter } from "@/components/ui/delta";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { paceStatus, type PaceWord } from "@/components/Progress/body/bodyMath";
import { rangeSuffix } from "@/components/Progress/rangeText";
import { formatLbs, shortLiftName } from "./format";

/** Sessions a week the old Dashboard ring counted towards (WeekSummary's `target`). */
export const WEEKLY_SESSION_TARGET = 5;

const DASH = "—";
/** Past this, the rate of change describes an old stretch, so it is not shown. */
export const STALE_WEIGH_IN_DAYS = 14;
const DAY_MS = 86_400_000;

/** While cutting, the rate is judged against the target band, as the Body tab does. */
const PACE_TONE: Record<PaceWord, SparklineTone> = {
  "on pace": "good",
  slow: "warn",
  fast: "warn",
  gaining: "warn",
};

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
  const log = useBodyweightLog();
  const weight = useMetric("bodyweight");
  const rate = useMetric("lossRate");
  const trend = useMetric("bodyweight7d", undefined, "4w");
  const [now] = useState(() => Date.now());
  if (!weight || !rate || !trend || !log || settings === undefined) return <TileSkeleton />;

  const latest = weight.full.points.at(-1);
  const fresh = latest !== undefined && now - latest.t <= STALE_WEIGH_IN_DAYS * DAY_MS;
  const lbsPerWeek = fresh ? rate.full.points.at(-1)?.v : undefined;
  const mode = settings?.trainingPhase?.mode;
  const better: DeltaBetter = mode === "cutting" ? "down" : mode === "bulking" ? "up" : "none";
  // Cutting: on pace is good; too slow, too fast or gaining all need a look.
  const pace =
    mode === "cutting" && lbsPerWeek !== undefined
      ? paceStatus(log.map((e) => ({ date: new Date(e.date), weight: e.weight })))
      : null;
  const tone = pace ? PACE_TONE[pace] : toneFor(lbsPerWeek, better);

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
          <Delta
            value={lbsPerWeek}
            unit="lb/wk"
            better={better}
            format={(v) => v.toFixed(1)}
            data-pace={pace ?? undefined}
            className={pace ? (tone === "good" ? "text-success" : "text-warning") : undefined}
          />
        ) : undefined
      }
      sparkline={
        trend.series.points.length > 1 ? (
          <Sparkline points={trend.series.points} width={150} height={24} tone={tone} />
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
          // The real span of the points, not the nominal 3 months.
          <Delta value={Math.round(change)} unit="lb" suffix={rangeSuffix(e1rm.series.points)} better="up" />
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
