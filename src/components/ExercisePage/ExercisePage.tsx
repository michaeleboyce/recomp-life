"use client";

import { useMemo, useState } from "react";
import { useLiftAdjustments, useMetricSource, useSettings, useStrengthSets, useUpcomingWorkouts } from "@/hooks";
import type { RangeKey } from "@/lib/metrics/types";
import type { WorkoutLocation } from "@/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkeletonCard } from "@/components/ui/skeleton";
import { ExerciseForm } from "@/components/Exercises/ExerciseForm";
import { LiftHeadline } from "@/components/Lift/LiftHeadline";
import { LiftStats, ProjectionLink } from "@/components/Lift/LiftStats";
import { MoreCharts } from "@/components/Lift/MoreCharts";
import { PrLine } from "@/components/Lift/PrLine";
import { SessionList } from "@/components/Lift/SessionList";
import { useLiftView, type LiftView } from "@/components/Lift/useLiftView";
import { WeightChanges } from "@/components/Lift/WeightChanges";
import { LIFT_NAMES, type MainLiftId } from "@/components/Progress/lifts";
import { CountsToward } from "./CountsToward";
import { ExerciseHeader } from "./ExerciseHeader";
import { OwnStrength, T3Strength } from "./ExerciseStrength";
import { HomeNextSession, PlannedNextSession } from "./NextSession";
import {
  classifyExercise,
  exerciseAdjustments,
  exerciseEyebrow,
  exerciseTitle,
  nextPlannedEntry,
  performedSessions,
  type ExerciseKind,
} from "./exercisePageModel";
import { useNextSetPlanStore } from "./nextSetPlanAdapter";

/** Where back goes with no in-app history: Today when opened from there, else `fallback`. */
export function exerciseBackHref(from: string | null | undefined, fallback: string): string {
  return from === "today" ? "/" : fallback;
}

/** A barbell lift's own estimated 1RM, stats, projection and more charts. */
function LiftStrength({
  liftId,
  name,
  view,
  range,
  onRangeChange,
}: {
  liftId: MainLiftId;
  name: string;
  view: LiftView;
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <LiftHeadline e1rm={view.metrics.e1rm} liftName={name} range={range} onRangeChange={onRangeChange} />
      <LiftStats stats={view.stats} />
      <ProjectionLink exerciseId={liftId} teaser={view.teaser} />
      <MoreCharts metrics={view.metrics} liftName={name} />
    </div>
  );
}

/**
 * One exercise's page (E1, E2): Training (default) and Form. Training is about this
 * exercise only, in order: its next session, its sessions, its strength and its weight
 * changes; then the one card about something else, what it counts toward.
 */
export function ExercisePage({ exerciseId, backHref }: { exerciseId: string; backHref: string }) {
  const kind: ExerciseKind = useMemo(() => classifyExercise(exerciseId), [exerciseId]);
  const title = exerciseTitle(exerciseId, kind);
  const [tab, setTab] = useState("training");
  const [range, setRange] = useState<RangeKey>("3m");

  const settings = useSettings();
  const location: WorkoutLocation = kind.kind === "lift" ? "gym" : (settings?.defaultLocation ?? "gym");
  const upcoming = useUpcomingWorkouts(location, 4);
  const next = useMemo(
    () => (upcoming === undefined ? undefined : nextPlannedEntry(upcoming, exerciseId)),
    [upcoming, exerciseId]
  );
  const source = useMetricSource();
  const view = useLiftView(exerciseId, range);
  const allAdjustments = useLiftAdjustments();
  const strengthSets = useStrengthSets();
  const store = useNextSetPlanStore();

  const sessions = useMemo(
    () => (source ? performedSessions(source.workouts, source.e1rms, exerciseId) : undefined),
    [source, exerciseId]
  );
  const adjustments = useMemo(() => exerciseAdjustments(allAdjustments, exerciseId), [allAdjustments, exerciseId]);

  const header = (
    <ExerciseHeader
      exerciseId={exerciseId}
      title={title}
      eyebrow={exerciseEyebrow(exerciseId, kind, next?.entry.tier)}
      backHref={backHref}
      home={kind.kind === "home"}
    />
  );

  const lift = kind.kind === "lift" ? kind.liftId : null;
  const showPr = lift && view && (!next || (next.entry.tier === "T1" && !next.entry.substituteExerciseId));

  return (
    <div className="flex flex-col gap-4">
      {header}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="training">Training</TabsTrigger>
          <TabsTrigger value="form">Form</TabsTrigger>
        </TabsList>

        <TabsContent value="training" className="flex flex-col gap-6 pt-2">
          {kind.kind === "home" ? (
            <HomeNextSession liftId={kind.liftId} exerciseId={exerciseId} name={title} store={store} />
          ) : (
            <PlannedNextSession
              exerciseId={exerciseId}
              name={title}
              kind={kind}
              next={next}
              location={location}
              sessions={sessions ?? []}
              store={store}
              prLine={
                showPr ? (
                  <PrLine liftShort={LIFT_NAMES[lift].short} weight={view.next.weight} opportunity={view.next.opportunity} />
                ) : undefined
              }
            />
          )}

          {sessions === undefined ? (
            <SkeletonCard />
          ) : (
            <SessionList
              sessions={sessions}
              title={`${title} sessions`}
              homeOnly={kind.kind === "home"}
              empty={
                kind.kind === "home"
                  ? `No ${title} sessions yet. They will appear here and count toward your ${LIFT_NAMES[kind.liftId].short}.`
                  : `No ${title} sessions yet.`
              }
            />
          )}

          {lift ? (
            view ? (
              <LiftStrength liftId={lift} name={title} view={view} range={range} onRangeChange={setRange} />
            ) : (
              <SkeletonCard />
            )
          ) : kind.kind === "t3" ? (
            <T3Strength sessions={sessions ?? []} />
          ) : (
            <OwnStrength exerciseId={exerciseId} name={title} sets={strengthSets} />
          )}

          <WeightChanges adjustments={adjustments} />

          <CountsToward exerciseId={exerciseId} kind={kind} sets={strengthSets} />
        </TabsContent>

        <TabsContent value="form" className="pt-2">
          <ExerciseForm exerciseId={exerciseId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
