"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { EXERCISES } from "@/lib/exercises";
import {
  WORKOUT_TEMPLATES,
  WORKOUT_ROTATION,
  getNextWorkoutId,
} from "@/lib/workoutTemplates";
import { calculateRecoveryStatus } from "@/lib/recovery";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import E1RMChart from "@/components/Charts/E1RMChart";
import RPETrendChart from "@/components/Charts/RPETrendChart";
import VolumeBars from "@/components/Charts/VolumeBars";
import { MuscleMap } from "@/components/Anatomy/MuscleMap";
import { combinedActivationHeat } from "@/lib/muscleLoad";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import type { LiftState, RecoveryStatus, TrainingPhase } from "@/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const MAIN_LIFTS = ["squat", "bench", "deadlift", "ohp"] as const;

const RECOVERY_CONFIG: Record<
  RecoveryStatus,
  { color: string; bgColor: string; label: string }
> = {
  recovering: {
    color: "text-red-400",
    bgColor: "bg-red-500/10",
    label: "Recovering",
  },
  ready: {
    color: "text-yellow-400",
    bgColor: "bg-yellow-500/10",
    label: "Ready",
  },
  primed: {
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    label: "Primed",
  },
  detraining: {
    color: "text-zinc-500",
    bgColor: "bg-zinc-500/10",
    label: "Long break",
  },
};

// ─── Current Rotation Section ────────────────────────────────────────────────

function CurrentRotation({
  nextTemplateId,
  liftStates,
}: {
  nextTemplateId: string;
  liftStates: LiftState[];
}) {
  const template = WORKOUT_TEMPLATES[nextTemplateId];
  if (!template) return null;

  const t1Exercise = template.exercises.find((e) => e.tier === "T1");
  const t2Exercise = template.exercises.find((e) => e.tier === "T2");

  const t1State = t1Exercise
    ? liftStates.find((s) => s.exerciseId === t1Exercise.exerciseId)
    : null;
  const t2State = t2Exercise
    ? liftStates.find((s) => s.exerciseId === t2Exercise.exerciseId)
    : null;

  const t1Info = t1Exercise ? EXERCISES[t1Exercise.exerciseId] : null;
  const t2Info = t2Exercise ? EXERCISES[t2Exercise.exerciseId] : null;

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Next Workout
          </h3>
          <Badge variant="outline" className="text-xs">
            {template.name}
          </Badge>
        </div>

        {/* Rotation indicator, with the muscles each workout targets */}
        <div className="flex gap-1.5 mb-4">
          {WORKOUT_ROTATION.map((id) => (
            <div key={id} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className={`w-full h-1.5 rounded-full transition-colors ${
                  id === nextTemplateId
                    ? "bg-blue-500"
                    : "bg-zinc-800"
                }`}
              />
              <MuscleMap
                heat={combinedActivationHeat(
                  WORKOUT_TEMPLATES[id]?.exercises.map((e) => e.exerciseId) ?? []
                )}
                className={`h-16 ${id === nextTemplateId ? "" : "opacity-60"}`}
                label={`Muscles ${id} targets`}
              />
              <span
                className={`text-[10px] font-semibold ${
                  id === nextTemplateId ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {id}
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-0">
          {t1Info && (
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-primary/70">T1</span>
                <p className="text-sm font-medium text-foreground">
                  {t1Info.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground font-mono tabular-nums">
                  {t1State?.t1Weight ?? "--"} lbs
                </p>
                <p className="text-xs text-muted-foreground font-mono tabular-nums">
                  {t1State?.t1Stage ?? "5x3"}
                </p>
              </div>
            </div>
          )}
          {t1Info && t2Info && <Separator className="my-1" />}
          {t2Info && (
            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <div>
                <span className="text-xs font-semibold text-primary/70">T2</span>
                <p className="text-sm font-medium text-foreground">
                  {t2Info.name}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-foreground font-mono tabular-nums">
                  {t2State?.t2Weight ?? "--"} lbs
                </p>
                <p className="text-xs text-muted-foreground font-mono tabular-nums">
                  {t2State?.t2Stage ?? "3x10"}
                </p>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Lift State Card ──────────────────────────────────────────────────────────

function LiftStateCard({
  liftState,
  recoveryStatus,
  latestE1RM,
}: {
  liftState: LiftState;
  recoveryStatus: RecoveryStatus;
  latestE1RM: number | null;
}) {
  const exercise = EXERCISES[liftState.exerciseId];
  if (!exercise) return null;

  const recovery = RECOVERY_CONFIG[recoveryStatus];

  return (
    <Card>
      <CardContent className="pt-4 space-y-4">
        {/* Header with exercise name + recovery badge */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-foreground">
            {exercise.name}
          </h3>
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded-full ${recovery.bgColor} ${recovery.color}`}
          >
            {recovery.label}
          </span>
        </div>

        {/* T1 / T2 progression state */}
        <div className="grid grid-cols-2 gap-3">
          {/* T1 */}
          <div className="rounded-lg bg-muted/50 p-3">
            <span className="text-xs font-semibold text-primary/70">T1</span>
            <p className="text-lg font-bold text-foreground font-mono mt-0.5">
              {liftState.t1Weight} lbs
            </p>
            <p className="text-xs text-muted-foreground font-mono tabular-nums">
              {liftState.t1Stage}
            </p>
            {liftState.t1FailCount > 0 && (
              <p className="text-xs text-red-400 mt-1 font-mono tabular-nums">
                {liftState.t1FailCount} fail{liftState.t1FailCount > 1 ? "s" : ""}
              </p>
            )}
            {liftState.deloadActive && (
              <p className="text-xs text-amber-400 mt-1 font-mono tabular-nums">
                Deload ({liftState.deloadSessionsRemaining} left)
              </p>
            )}
          </div>

          {/* T2 */}
          <div className="rounded-lg bg-muted/50 p-3">
            <span className="text-xs font-semibold text-primary/70">T2</span>
            <p className="text-lg font-bold text-foreground font-mono mt-0.5">
              {liftState.t2Weight} lbs
            </p>
            <p className="text-xs text-muted-foreground font-mono tabular-nums">
              {liftState.t2Stage}
            </p>
            {liftState.t2FailCount > 0 && (
              <p className="text-xs text-red-400 mt-1 font-mono tabular-nums">
                {liftState.t2FailCount} fail{liftState.t2FailCount > 1 ? "s" : ""}
              </p>
            )}
          </div>
        </div>

        {/* Latest e1RM */}
        {latestE1RM !== null && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Latest e1RM</span>
            <span className="font-bold text-foreground font-mono tabular-nums">
              {latestE1RM} lbs
            </span>
          </div>
        )}

        {/* E1RM Chart */}
        <E1RMChart exerciseId={liftState.exerciseId} exerciseName={exercise.name} />

        <Separator />

        {/* RPE Trend Chart */}
        <RPETrendChart exerciseId={liftState.exerciseId} exerciseName={exercise.name} />
      </CardContent>
    </Card>
  );
}

// ─── Gym Debt Section ─────────────────────────────────────────────────────────

function GymDebtSection({
  liftStates,
  maxDumbbellWeight,
}: {
  liftStates: LiftState[];
  maxDumbbellWeight: number;
}) {
  const debtExercises = liftStates.filter((state) => {
    const exercise = EXERCISES[state.exerciseId];
    if (!exercise || exercise.type !== "barbell") return false;

    // Check if the barbell weight exceeds what dumbbells can handle
    // For dumbbell alternatives, the per-hand weight is roughly half
    // the barbell weight (simplified comparison)
    const dbEquivalent = state.t1Weight / 2;
    return dbEquivalent > maxDumbbellWeight;
  });

  if (debtExercises.length === 0) return null;

  return (
    <Card>
      <CardContent className="pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
          Gym Debt
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          These lifts exceed your home dumbbell capacity ({maxDumbbellWeight} lbs).
          You need gym sessions to train at full weight.
        </p>
        <div className="space-y-2">
          {debtExercises.map((state) => {
            const exercise = EXERCISES[state.exerciseId];
            if (!exercise) return null;
            const dbEquivalent = Math.round(state.t1Weight / 2);
            const overage = dbEquivalent - maxDumbbellWeight;

            return (
              <div
                key={state.exerciseId}
                className="flex items-center justify-between rounded-lg bg-red-500/5 border border-red-500/10 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {exercise.name}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono tabular-nums">
                    T1: {state.t1Weight} lbs barbell
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-red-400 font-mono tabular-nums">
                    +{overage} lbs over
                  </p>
                  <p className="text-xs text-muted-foreground font-mono tabular-nums">
                    DB equiv: {dbEquivalent} lbs/hand
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Program Page ────────────────────────────────────────────────────────

export default function ProgramPage() {
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    initializeDatabase().then(() => setDbReady(true));
  }, []);

  const liftStates = useLiveQuery(
    () => db.liftStates.toArray(),
    [dbReady]
  );

  const profile = useLiveQuery(
    () => db.userProfile.toCollection().first(),
    [dbReady]
  );

  const lastWorkout = useLiveQuery(
    () =>
      db.workouts
        .orderBy("startedAt")
        .reverse()
        .limit(1)
        .toArray()
        .then((w) => w[0] ?? null),
    [dbReady]
  );

  const latestE1RMs = useLiveQuery(async () => {
    const results: Record<string, number | null> = {};
    for (const liftId of MAIN_LIFTS) {
      const entries = await db.estimated1RMs
        .where("exerciseId")
        .equals(liftId)
        .reverse()
        .sortBy("date");
      results[liftId] = entries.length > 0 ? entries[0].estimated1RM : null;
    }
    return results;
  }, [dbReady]);

  if (!dbReady) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-40 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  if (
    liftStates === undefined ||
    profile === undefined ||
    lastWorkout === undefined ||
    latestE1RMs === undefined
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-40 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  const phase: TrainingPhase = profile?.settings?.trainingPhase ?? {
    mode: "maintaining",
  };
  const now = new Date();
  const nextTemplateId = lastWorkout
    ? getNextWorkoutId(lastWorkout.templateId)
    : "A1";

  const maxDumbbellWeight =
    profile?.settings?.equipment?.maxDumbbellWeight ?? 50;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-5 pt-5 pb-28 space-y-4">
        {/* Header */}
        <h1 className="text-xl font-bold text-foreground">Program</h1>
        <EvidenceLine ruleId="tier-structure" />

        {/* Current Rotation */}
        <div
          className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
          style={{ animationDelay: "0ms", animationDuration: "300ms" }}
        >
          <CurrentRotation
            nextTemplateId={nextTemplateId}
            liftStates={liftStates}
          />
        </div>

        {/* Lift State Cards */}
        {MAIN_LIFTS.map((liftId, index) => {
          const state = liftStates.find((s) => s.exerciseId === liftId);
          if (!state) return null;

          const t1Date = state.t1LastWorkoutDate
            ? new Date(state.t1LastWorkoutDate)
            : null;
          const t2Date = state.t2LastWorkoutDate
            ? new Date(state.t2LastWorkoutDate)
            : null;

          const recoveryStatus = calculateRecoveryStatus(
            t1Date,
            t2Date,
            now,
            phase
          );

          return (
            <div
              key={liftId}
              className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
              style={{
                animationDelay: `${(index + 1) * 60}ms`,
                animationDuration: "300ms",
              }}
            >
              <LiftStateCard
                liftState={state}
                recoveryStatus={recoveryStatus}
                latestE1RM={latestE1RMs[liftId] ?? null}
              />
            </div>
          );
        })}

        {/* Weekly Volume */}
        <div
          className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
          style={{
            animationDelay: `${(MAIN_LIFTS.length + 1) * 60}ms`,
            animationDuration: "300ms",
          }}
        >
          <Card>
            <CardContent className="pt-4">
              <VolumeBars />
            </CardContent>
          </Card>
        </div>

        {/* Gym Debt */}
        <div
          className="animate-in fade-in slide-in-from-bottom-3 fill-mode-both"
          style={{
            animationDelay: `${(MAIN_LIFTS.length + 2) * 60}ms`,
            animationDuration: "300ms",
          }}
        >
          <GymDebtSection
            liftStates={liftStates}
            maxDumbbellWeight={maxDumbbellWeight}
          />
        </div>
      </div>
    </div>
  );
}
