"use client";

import { useState } from "react";
import { useBodyweightLog, useDueTemplateId, useImportedSessions, useLiftE1RM, useMetric, useSettings } from "@/hooks";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { DAY_MS, getMonday } from "@/lib/dates";
import { STALE_WEIGH_IN_DAYS } from "@/lib/weighIn";
import { WEEKLY_SESSION_TARGET } from "@/lib/workout/rotation";
import { importedSessionsBetween } from "@/lib/import/history";
import { Sparkline, type SparklineTone } from "@/components/chart-kit";
import { Delta, type DeltaBetter } from "@/components/ui/delta";
import { Skeleton } from "@/components/ui/skeleton";
import { StatTile } from "@/components/ui/stat-tile";
import { TermIcon } from "@/components/ui/term";
import { paceStatus, type PaceWord } from "@/components/Progress/body/bodyMath";
import { rangeSuffix } from "@/components/Progress/rangeText";
import { formatLbs, shortLiftName } from "./format";

const DASH = "—";

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

/** "Nov 3", or "Nov 3, 2025" when it is not this year. */
function formatTileDay(t: number): string {
  const date = new Date(t);
  const thisYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(thisYear ? {} : { year: "numeric" }) });
}

function toneFor(change: number | null | undefined, better: DeltaBetter): SparklineTone {
  if (!change || better === "none") return "neutral";
  return (better === "up" ? change > 0 : change < 0) ? "good" : "warn";
}

/** The glance row under the hero: weight, this week, and the two lifts trained next. */
export function GlanceTiles() {
  const due = useDueTemplateId();
  const lifts = (due ? WORKOUT_TEMPLATES[due] : undefined)?.exercises
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

/**
 * Sessions this week: the app's workouts and the sessions imported from other apps
 * started this week (history: they count as training, never for the rotation).
 */
function WeekTile() {
  const sessions = useMetric("sessionsPerWeek");
  const imported = useImportedSessions();
  const [weekStart] = useState(() => getMonday(new Date()).getTime());
  if (!sessions || !imported) return <TileSkeleton />;

  const points = sessions.full.points;
  const appThisWeek = points.find((p) => p.t === weekStart)?.v ?? 0;
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const importedThisWeek = importedSessionsBetween(imported, new Date(weekStart), nextWeek);
  const none = points.length === 0 && imported.length === 0;

  return (
    <StatTile
      href="/log"
      label="This week"
      value={none ? DASH : `${appThisWeek + importedThisWeek} / ${WEEKLY_SESSION_TARGET}`}
      delta={
        <Hint>
          {none ? "No workouts yet" : importedThisWeek > 0 ? `sessions, ${importedThisWeek} imported` : "sessions"}
        </Hint>
      }
    />
  );
}

function LiftTile({ exerciseId }: { exerciseId: string }) {
  // The app's estimates and those of the lift's imported sessions (marked imported).
  const e1rm = useLiftE1RM(exerciseId, "3m");
  if (!e1rm) return <TileSkeleton />;

  const latest = e1rm.full.points.at(-1);
  const change = e1rm.summary.change;

  // The term sits beside the link, not inside it (as on the forecast tiles): no button
  // inside an anchor, and no tap in its glossary sheet bubbling up to open the lift page.
  return (
    <div className="relative flex min-w-0 flex-col">
      <StatTile
        href={`/progress/lift/${exerciseId}`}
        className="flex-1"
        label={<span className="block pr-6">{shortLiftName(exerciseId)} est. 1RM</span>}
        value={latest ? formatLbs(Math.round(latest.v)) : DASH}
        unit={latest ? "lbs" : undefined}
        delta={
          !latest ? (
            <Hint>Finish a workout to estimate it</Hint>
          ) : latest.imported ? (
            <Hint>Imported, {formatTileDay(latest.t)}</Hint>
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
      <TermIcon id="e1rm" label="est. 1RM" className="absolute top-1.5 right-1.5" />
    </div>
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
