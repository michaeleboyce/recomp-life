"use client";

import { useState } from "react";
import { useActivities, useCompletedWorkouts, useE1RMs, useRuns } from "@/hooks";
import { PageShell } from "@/components/ui/page-shell";
import { EXERCISES } from "@/lib/exercises";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { calculateE1RM, isE1RMEligibleSet, isNewPR } from "@/lib/e1rm";
import { dumbbellToBarbell } from "@/lib/dbConversion";
import { describeActivity } from "@/lib/activities";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  WorkoutSession,
  ActivityLog,
  RunLog,
  SetLog,
  Tier,
} from "@/types";

type FilterTab = "all" | "gym" | "home" | "activity";

/**
 * Format a date as relative ("2 days ago") for recent dates,
 * or absolute ("Feb 12") for older dates.
 */
function formatDate(date: Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format duration in minutes to a human-readable string.
 */
function formatDurationMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}h ${m}m`;
  }
  return `${Math.round(minutes)} min`;
}

/**
 * Format duration in seconds to minutes.
 */
function formatDurationSeconds(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  return formatDurationMinutes(minutes);
}

/**
 * Get the status icon for a lift result.
 */
function getStatusIcon(
  sets: SetLog[],
  tier: Tier
): { icon: string; color: string; label: string } {
  const allSkipped = sets.every((s) => s.status === "skipped_pain");
  if (allSkipped) {
    return { icon: "\u26D4", color: "text-destructive", label: "Skipped" };
  }

  const hasFreezeStatus = sets.some(
    (s) =>
      s.status === "skipped_pain" ||
      s.status === "reduced_run_fatigue" ||
      s.status === "reduced_equipment" ||
      s.status === "autoregulated_load_drop"
  );

  if (hasFreezeStatus) {
    const reason = sets.find(
      (s) =>
        s.status === "reduced_run_fatigue" ||
        s.status === "reduced_equipment" ||
        s.status === "autoregulated_load_drop"
    );
    let reasonLabel = "";
    if (reason?.status === "reduced_run_fatigue") reasonLabel = " (run fatigue)";
    else if (reason?.status === "reduced_equipment") reasonLabel = " (equip.)";
    else if (reason?.status === "autoregulated_load_drop")
      reasonLabel = " (RPE drop)";
    return {
      icon: "\uD83D\uDD04",
      color: "text-warning",
      label: `Froze${reasonLabel}`,
    };
  }

  const hasFailed = sets.some(
    (s) => s.status === "failed" || s.actualReps < s.targetReps
  );
  if (hasFailed) {
    return { icon: "\u274C", color: "text-destructive", label: "Failed" };
  }

  return { icon: "\u2705", color: "text-success", label: "+5 lbs" };
}

/**
 * Group sets by exercise, preserving tier order.
 */
function groupSetsByExercise(
  sets: SetLog[]
): { exerciseId: string; tier: Tier; sets: SetLog[] }[] {
  const groups: Map<string, { exerciseId: string; tier: Tier; sets: SetLog[] }> =
    new Map();

  for (const s of sets) {
    if (s.tier === "warmup") continue;
    const key = `${s.exerciseId}-${s.tier}`;
    if (!groups.has(key)) {
      groups.set(key, { exerciseId: s.exerciseId, tier: s.tier, sets: [] });
    }
    groups.get(key)!.sets.push(s);
  }

  const tierOrder: Record<string, number> = {
    T1: 0,
    T2: 1,
    T3: 2,
    accessory: 3,
  };

  return Array.from(groups.values()).sort(
    (a, b) => (tierOrder[a.tier] ?? 4) - (tierOrder[b.tier] ?? 4)
  );
}

// ─── Workout History Entry ─────────────────────────────────────────────────

interface WorkoutEntryProps {
  session: WorkoutSession;
  allE1RMs: { exerciseId: string; estimated1RM: number }[];
}

function WorkoutEntry({ session, allE1RMs }: WorkoutEntryProps) {
  const [expanded, setExpanded] = useState(false);

  const template = WORKOUT_TEMPLATES[session.templateId];
  const templateName = template?.name ?? session.templateId;

  // Find T1 exercise for day label
  const t1Exercise = template?.exercises.find((e) => e.tier === "T1");
  const t1Name = t1Exercise
    ? EXERCISES[t1Exercise.exerciseId]?.name?.replace("Barbell ", "") ?? ""
    : "";
  const dayLabel = t1Name ? `${t1Name} Day` : "";

  const locationIcon =
    session.location === "gym" ? "\uD83C\uDFCB\uFE0F" : "\uD83C\uDFE0";
  const locationLabel = session.location === "gym" ? "Gym" : "Home";

  const groups = groupSetsByExercise(session.sets);
  const dateStr = formatDate(session.startedAt);
  const durationStr = formatDurationSeconds(session.totalDurationSeconds);

  // Calculate AMRAP and e1RM for T1
  const t1Sets = groups.find((g) => g.tier === "T1");
  const amrapSet = t1Sets?.sets.find((s) => s.isAMRAP);
  const amrapReps = amrapSet?.actualReps ?? null;
  const e1rm =
    amrapSet && isE1RMEligibleSet("T1", true, amrapSet.actualReps)
      ? calculateE1RM(amrapSet.weight, amrapSet.actualReps, amrapSet.rpe)
      : null;

  // Check if it's a PR
  const isPR =
    e1rm !== null && t1Sets
      ? isNewPR(
          e1rm,
          allE1RMs
            .filter((r) => r.exerciseId === t1Sets.exerciseId)
            .map((r) => r.estimated1RM)
        )
      : false;

  // Average RPE across all sets
  const rpeValues = session.sets
    .filter((s) => s.rpe !== undefined && s.tier !== "warmup")
    .map((s) => s.rpe!);
  const avgRPE =
    rpeValues.length > 0
      ? rpeValues.reduce((sum, r) => sum + r, 0) / rpeValues.length
      : null;

  return (
    <Card className="overflow-hidden">
      <button
        className="w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <CardContent className="py-3 space-y-2">
          {/* Header line */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {dateStr} {"\u2014"} {templateName}
                {dayLabel && ` ${dayLabel}`}
              </p>
              <p className="text-xs text-muted-foreground">
                {locationIcon} {locationLabel} {"\u2022"} <span className="font-mono tabular-nums">{durationStr}</span>
              </p>
            </div>
            <span className="text-muted-foreground text-xs">
              {expanded ? "\u25B2" : "\u25BC"}
            </span>
          </div>

          {/* Compact summary for main lifts */}
          <div className="space-y-1">
            {groups
              .filter((g) => g.tier === "T1" || g.tier === "T2")
              .map((group) => {
                const exercise = EXERCISES[group.exerciseId];
                const name = exercise?.name ?? group.exerciseId;
                const weight = group.sets[0]?.weight ?? 0;
                const status = getStatusIcon(group.sets, group.tier);

                // Check for home adaptation
                const isAdapted =
                  session.location === "home" &&
                  group.sets.some(
                    (s) => s.isSubstituted && s.substituteExerciseId
                  );
                const subId = group.sets.find(
                  (s) => s.isSubstituted
                )?.substituteExerciseId;
                const subExercise = subId ? EXERCISES[subId] : null;

                if (isAdapted && subExercise) {
                  const barbellEquiv = dumbbellToBarbell(weight);
                  return (
                    <div
                      key={`${group.exerciseId}-${group.tier}`}
                      className="flex items-center justify-between text-xs"
                    >
                      <span className="text-muted-foreground">
                        <span className="text-primary/60 font-medium mr-1">
                          {group.tier}
                        </span>
                        {name} <span className="font-mono tabular-nums">{weight} lbs</span> {"\u2192"} {subExercise.name}
                      </span>
                      <span className={status.color}>
                        {status.icon} {status.label}
                      </span>
                    </div>
                  );
                }

                return (
                  <div
                    key={`${group.exerciseId}-${group.tier}`}
                    className="flex items-center justify-between text-xs"
                  >
                    <span className="text-muted-foreground">
                      <span className="text-primary/60 font-medium mr-1">
                        {group.tier}
                      </span>
                      {name} <span className="font-mono tabular-nums">{weight} lbs</span>
                    </span>
                    <span className={status.color}>
                      {status.icon} {status.label}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* AMRAP + e1RM + RPE summary line */}
          {(amrapReps !== null || avgRPE !== null) && (
            <div className="flex gap-3 text-xs text-muted-foreground font-mono tabular-nums">
              {amrapReps !== null && <span>AMRAP: {amrapReps} reps</span>}
              {e1rm !== null && (
                <span>
                  e1RM: {e1rm}
                  {isPR && (
                    <span className="text-success ml-1">(PR!)</span>
                  )}
                </span>
              )}
              {avgRPE !== null && (
                <span>RPE avg: {avgRPE.toFixed(1)}</span>
              )}
            </div>
          )}
        </CardContent>
      </button>

      {/* Expanded set-by-set detail */}
      {expanded && (
        <div className="border-t border-border px-6 py-3 space-y-3">
          {groups.map((group) => {
            const exercise = EXERCISES[group.exerciseId];
            const subId = group.sets.find(
              (s) => s.isSubstituted
            )?.substituteExerciseId;
            const displayExercise = subId
              ? EXERCISES[subId]
              : exercise;

            return (
              <div key={`${group.exerciseId}-${group.tier}-detail`}>
                <p className="text-xs font-medium text-foreground mb-1">
                  <span className="text-primary/60 mr-1">{group.tier}</span>
                  {displayExercise?.name ?? group.exerciseId}
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {group.sets.map((s, i) => (
                    <div
                      key={s.id}
                      className={`text-xs px-2 py-1 rounded ${
                        s.status === "completed"
                          ? "bg-success/10 text-success"
                          : s.status === "failed"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-warning/10 text-warning"
                      }`}
                    >
                      <span className="font-mono tabular-nums">Set {i + 1}: {s.actualReps}
                      {s.isAMRAP ? "+" : ""} @ {s.weight} lbs</span>
                      {s.rpe !== undefined && (
                        <span className="text-muted-foreground ml-1 font-mono tabular-nums">
                          RPE {s.rpe}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Modifications */}
          {session.modifications.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Modifications:
              </p>
              {session.modifications.map((mod, i) => {
                const exercise = EXERCISES[mod.exerciseId];
                return (
                  <p key={i} className="text-xs text-warning">
                    {exercise?.name ?? mod.exerciseId}: {mod.reason}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Run History Entry ─────────────────────────────────────────────────────

interface RunEntryProps {
  run: RunLog;
}

const effortLabels: Record<number, string> = {
  1: "very easy",
  2: "easy",
  3: "moderate",
  4: "hard",
  5: "very hard",
};

function RunEntry({ run }: RunEntryProps) {
  const dateStr = formatDate(run.date);
  const durationStr = formatDurationMinutes(run.durationMinutes);

  return (
    <Card>
      <CardContent className="py-3 space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-foreground">
            {dateStr} {"\u2014"} Run ({run.category})
          </p>
          <Badge variant="outline" className="text-xs">
            {run.type}
          </Badge>
        </div>
        <div className="flex gap-3 text-xs text-muted-foreground font-mono tabular-nums">
          {run.distanceMiles !== null && (
            <span>{run.distanceMiles.toFixed(1)} mi</span>
          )}
          <span>{durationStr}</span>
          <span>{effortLabels[run.perceivedEffort] ?? `effort ${run.perceivedEffort}`}</span>
        </div>
        {run.notes && (
          <p className="text-xs text-muted-foreground italic">{run.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Activity History Entry (yoga, cycling, hiking...) ─────────────────────

function ActivityEntry({ activity }: { activity: ActivityLog }) {
  return (
    <Card>
      <CardContent className="py-3 space-y-1">
        <p className="text-sm font-medium text-foreground">
          {formatDate(activity.date)} {"\u2014"} {describeActivity(activity)}
        </p>
        <div className="flex gap-3 text-xs text-muted-foreground font-mono tabular-nums">
          {activity.distanceMiles !== null && (
            <span>{activity.distanceMiles.toFixed(1)} mi</span>
          )}
          <span>{formatDurationMinutes(activity.durationMinutes)}</span>
          <span>
            {effortLabels[activity.perceivedEffort] ?? `effort ${activity.perceivedEffort}`}
          </span>
        </div>
        {activity.notes && (
          <p className="text-xs text-muted-foreground italic">{activity.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main History Page ─────────────────────────────────────────────────────

export default function LogPage() {
  const [filter, setFilter] = useState<FilterTab>("all");

  const workouts = useCompletedWorkouts();
  const runs = useRuns();
  const activities = useActivities();
  const allE1RMs = useE1RMs();

  if (
    workouts === undefined ||
    runs === undefined ||
    activities === undefined ||
    allE1RMs === undefined
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-40 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  // Filter based on selected tab
  const filteredWorkouts =
    filter === "activity"
      ? []
      : filter === "gym"
        ? workouts.filter((w) => w.location === "gym")
        : filter === "home"
          ? workouts.filter((w) => w.location === "home")
          : workouts;

  const locationOnly = filter === "gym" || filter === "home";
  const filteredRuns = locationOnly ? [] : runs;
  const filteredActivities = locationOnly ? [] : activities;

  // Combine and sort by date, newest first
  type HistoryEntry =
    | { type: "workout"; date: Date; data: WorkoutSession }
    | { type: "run"; date: Date; data: RunLog }
    | { type: "activity"; date: Date; data: ActivityLog };

  const entries: HistoryEntry[] = [
    ...filteredWorkouts.map(
      (w) =>
        ({
          type: "workout" as const,
          date: new Date(w.startedAt),
          data: w,
        })
    ),
    ...filteredRuns.map(
      (r) =>
        ({
          type: "run" as const,
          date: new Date(r.date),
          data: r,
        })
    ),
    ...filteredActivities.map(
      (a) =>
        ({
          type: "activity" as const,
          date: new Date(a.date),
          data: a,
        })
    ),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const isEmpty = entries.length === 0;

  return (
    <div className="min-h-screen bg-background">
      <PageShell className="space-y-4">
        {/* Header */}
        <h1 className="text-xl font-bold text-foreground">Log</h1>

        {/* Filter Tabs */}
        <Tabs
          value={filter}
          onValueChange={(v) => setFilter(v as FilterTab)}
        >
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">
              All
            </TabsTrigger>
            <TabsTrigger value="gym" className="flex-1">
              Gym
            </TabsTrigger>
            <TabsTrigger value="home" className="flex-1">
              Home
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex-1">
              Activity
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Empty State */}
        {isEmpty && (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground text-sm">
                {filter === "activity"
                  ? "No runs or other activities logged yet. Log one from the dashboard."
                  : filter === "gym"
                    ? "No gym workouts yet."
                    : filter === "home"
                      ? "No home workouts yet."
                      : "No workouts yet. Start your first GZCLP workout from the dashboard!"}
              </p>
            </CardContent>
          </Card>
        )}

        {/* History Entries */}
        <div className="space-y-3">
          {entries.map((entry) => {
            if (entry.type === "workout") {
              return (
                <WorkoutEntry
                  key={entry.data.id}
                  session={entry.data}
                  allE1RMs={allE1RMs.map((r) => ({
                    exerciseId: r.exerciseId,
                    estimated1RM: r.estimated1RM,
                  }))}
                />
              );
            }
            if (entry.type === "activity") {
              return <ActivityEntry key={entry.data.id} activity={entry.data} />;
            }
            return <RunEntry key={entry.data.id} run={entry.data} />;
          })}
        </div>
      </PageShell>
    </div>
  );
}
