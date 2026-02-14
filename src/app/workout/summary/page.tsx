"use client";

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/db/local";
import { EXERCISES } from "@/lib/exercises";
import { WORKOUT_TEMPLATES, getNextWorkoutId } from "@/lib/workoutTemplates";
import { getConfidenceLevel } from "@/lib/autoAdapt";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import LiftResult from "@/components/WorkoutSummary/LiftResult";
import EquipmentAdaptedResult from "@/components/WorkoutSummary/EquipmentAdaptedResult";
import PostWorkoutBodyCheck from "@/components/WorkoutSummary/PostWorkoutBodyCheck";
import type { SetLog, Tier } from "@/types";

/**
 * Format a duration in seconds to a human-readable string.
 */
function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Group sets by exercise ID, preserving tier order.
 */
function groupSetsByExercise(
  sets: SetLog[]
): { exerciseId: string; tier: Tier; sets: SetLog[] }[] {
  const groups: Map<string, { exerciseId: string; tier: Tier; sets: SetLog[] }> =
    new Map();

  for (const s of sets) {
    if (s.tier === "warmup") continue;
    const key = s.substituteExerciseId
      ? `${s.exerciseId}-${s.substituteExerciseId}`
      : s.exerciseId;
    if (!groups.has(key)) {
      groups.set(key, { exerciseId: s.exerciseId, tier: s.tier, sets: [] });
    }
    groups.get(key)!.sets.push(s);
  }

  // Sort by tier precedence: T1, T2, T3, accessory
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

function WorkoutSummaryContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("sessionId");

  const session = useLiveQuery(async () => {
    if (!sessionId) return null;
    return db.workouts.get(sessionId);
  }, [sessionId]);

  const liftStates = useLiveQuery(() => db.liftStates.toArray());

  const previousE1RMs = useLiveQuery(async () => {
    if (!session) return {};
    const results: Record<string, number | null> = {};

    for (const s of session.sets) {
      if (s.tier !== "T1" || results[s.exerciseId] !== undefined) continue;
      const entries = await db.estimated1RMs
        .where("exerciseId")
        .equals(s.exerciseId)
        .toArray();

      // Filter out entries from the current session and sort by date desc
      const prevEntries = entries
        .filter((e) => e.workoutSessionId !== sessionId)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      results[s.exerciseId] =
        prevEntries.length > 0 ? prevEntries[0].estimated1RM : null;
    }

    return results;
  }, [session, sessionId]);

  const userProfile = useLiveQuery(async () => {
    const profiles = await db.userProfile.toArray();
    return profiles[0] ?? null;
  });

  if (!sessionId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">No session ID provided.</p>
      </div>
    );
  }

  if (session === undefined || liftStates === undefined || previousE1RMs === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (session === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Workout session not found.</p>
      </div>
    );
  }

  const template = WORKOUT_TEMPLATES[session.templateId];
  const templateName = template?.name ?? session.templateId;
  const nextWorkoutId = getNextWorkoutId(session.templateId);
  const nextTemplate = WORKOUT_TEMPLATES[nextWorkoutId];

  const exerciseGroups = groupSetsByExercise(session.sets);

  // Separate main lifts (T1/T2/T3) from accessories
  const mainGroups = exerciseGroups.filter(
    (g) => g.tier === "T1" || g.tier === "T2" || g.tier === "T3"
  );
  const accessoryGroups = exerciseGroups.filter(
    (g) => g.tier === "accessory"
  );

  /**
   * Determine pass/fail and next weight for a lift.
   */
  function getLiftProgression(exerciseId: string, tier: Tier, sets: SetLog[]) {
    const state = liftStates?.find((s) => s.exerciseId === exerciseId);
    if (!state) return { passed: null, nextWeight: null, stageChange: null };

    const isFrozen = sets.some(
      (s) =>
        s.status === "skipped_pain" ||
        s.status === "reduced_run_fatigue" ||
        s.status === "reduced_equipment" ||
        s.status === "autoregulated_load_drop"
    );

    const allCompleted = sets.every(
      (s) => s.status === "completed" && s.actualReps >= s.targetReps
    );
    const hasFailed = sets.some((s) => s.status === "failed" || s.actualReps < s.targetReps);

    if (isFrozen) {
      return { passed: null, nextWeight: null, stageChange: null };
    }

    if (tier === "T1") {
      if (allCompleted) {
        return {
          passed: true,
          nextWeight: state.t1Weight,
          stageChange: null,
        };
      }
      return {
        passed: false,
        nextWeight: null,
        stageChange:
          state.t1Stage === "5x3"
            ? "6x2"
            : state.t1Stage === "6x2"
              ? "10x1"
              : "reset to 85%",
      };
    }

    if (tier === "T2") {
      if (allCompleted) {
        return {
          passed: true,
          nextWeight: state.t2Weight,
          stageChange: null,
        };
      }
      return {
        passed: false,
        nextWeight: null,
        stageChange:
          state.t2Stage === "3x10"
            ? "3x8"
            : state.t2Stage === "3x8"
              ? "3x6"
              : "reset to 85%",
      };
    }

    if (tier === "T3") {
      const totalReps = sets.reduce((sum, s) => sum + s.actualReps, 0);
      const amrapLastSet = sets.find((s) => s.isAMRAP);
      const amrapReps = amrapLastSet?.actualReps ?? 0;
      const shouldIncrease = amrapReps >= 25 || totalReps >= 50;
      if (shouldIncrease) {
        return {
          passed: true,
          nextWeight: (sets[0]?.weight ?? 0) + 5,
          stageChange: null,
        };
      }
      return {
        passed: true,
        nextWeight: null,
        stageChange: null,
      };
    }

    return { passed: allCompleted, nextWeight: null, stageChange: null };
  }

  const locationLabel = session.location === "gym" ? "\uD83C\uDFCB\uFE0F Gym" : "\uD83C\uDFE0 Home";

  // Find the T1 exercise name for the header
  const t1Exercise = template?.exercises.find((e) => e.tier === "T1");
  const t1Name = t1Exercise
    ? EXERCISES[t1Exercise.exerciseId]?.name?.replace("Barbell ", "") ?? ""
    : "";
  const dayLabel = t1Name ? `${t1Name} Day` : "";

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="mx-auto max-w-lg px-4 py-6 space-y-4">
        {/* Header */}
        <Card>
          <CardHeader className="pb-2 text-center">
            <CardTitle className="text-xl">
              Workout Complete! {"\uD83C\uDF89"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {templateName}
              {dayLabel && ` \u2014 ${dayLabel}`}
            </p>
          </CardHeader>
          <CardContent className="text-center space-y-1">
            <p className="text-2xl font-bold text-foreground">
              {formatDuration(session.totalDurationSeconds)}
            </p>
            <p className="text-sm text-muted-foreground">
              {"\uD83D\uDCCD"} {locationLabel}
            </p>
            {session.completedAt && (
              <p className="text-xs text-muted-foreground">
                {new Date(session.completedAt).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Main Lifts */}
        <div className="space-y-3">
          {mainGroups.map((group) => {
            const { passed, nextWeight, stageChange } = getLiftProgression(
              group.exerciseId,
              group.tier,
              group.sets
            );

            // Check if this is an equipment-adapted exercise
            const isEquipmentAdapted = group.sets.some(
              (s) =>
                s.isSubstituted &&
                s.substituteExerciseId &&
                s.status !== "skipped_pain"
            );
            const substituteId = group.sets.find(
              (s) => s.isSubstituted && s.substituteExerciseId
            )?.substituteExerciseId;

            if (
              isEquipmentAdapted &&
              substituteId &&
              session.location === "home"
            ) {
              const adaptation = session.modifications.find(
                (m) =>
                  m.exerciseId === group.exerciseId &&
                  m.source === "equipment_limit"
              );
              const confidence = getConfidenceLevel(
                substituteId,
                adaptation ? "fits" : "fits"
              );

              return (
                <EquipmentAdaptedResult
                  key={`${group.exerciseId}-${group.tier}`}
                  exerciseId={group.exerciseId}
                  substituteExerciseId={substituteId}
                  tier={group.tier}
                  sets={group.sets}
                  confidenceLevel={confidence}
                  passed={passed ?? true}
                />
              );
            }

            return (
              <LiftResult
                key={`${group.exerciseId}-${group.tier}`}
                exerciseId={group.exerciseId}
                tier={group.tier}
                sets={group.sets}
                modifications={session.modifications}
                previousE1RM={previousE1RMs?.[group.exerciseId] ?? null}
                nextWeight={nextWeight}
                passed={passed}
                stageChange={stageChange}
                isHome={session.location === "home"}
              />
            );
          })}
        </div>

        {/* Accessories */}
        {accessoryGroups.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground px-1">
              Accessories
            </h3>
            {accessoryGroups.map((group) => {
              const { passed } = getLiftProgression(
                group.exerciseId,
                group.tier,
                group.sets
              );
              return (
                <LiftResult
                  key={`${group.exerciseId}-acc`}
                  exerciseId={group.exerciseId}
                  tier={group.tier}
                  sets={group.sets}
                  modifications={session.modifications}
                  previousE1RM={null}
                  nextWeight={null}
                  passed={passed}
                  stageChange={null}
                  isHome={session.location === "home"}
                />
              );
            })}
          </div>
        )}

        <Separator />

        {/* Post-Workout Body Check */}
        <PostWorkoutBodyCheck onDismiss={() => {}} />

        <Separator />

        {/* Next Workout Preview */}
        {nextTemplate && (
          <Card>
            <CardContent className="py-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">
                  Next: {nextTemplate.name}
                </p>
                <Badge variant="outline" className="text-xs">
                  {nextWorkoutId}
                </Badge>
              </div>
              <div className="space-y-1">
                {nextTemplate.exercises
                  .filter((e) => e.tier !== "warmup")
                  .map((e) => {
                    const exercise = EXERCISES[e.exerciseId];
                    const state = liftStates?.find(
                      (s) => s.exerciseId === e.exerciseId
                    );
                    const weight =
                      e.tier === "T1"
                        ? state?.t1Weight
                        : e.tier === "T2"
                          ? state?.t2Weight
                          : null;

                    // Check for warnings
                    let warning: string | null = null;
                    if (
                      weight &&
                      userProfile?.settings.equipment.maxDumbbellWeight &&
                      exercise?.requiresGym
                    ) {
                      const dbEquiv = Math.round((weight * 0.8) / 2 / 5) * 5;
                      if (
                        dbEquiv >
                        userProfile.settings.equipment.maxDumbbellWeight
                      ) {
                        warning = `Exceeds home DBs (needs ${dbEquiv} lb)`;
                      }
                    }

                    return (
                      <div
                        key={e.exerciseId}
                        className="flex items-center justify-between text-xs"
                      >
                        <span className="text-muted-foreground">
                          <span className="text-primary/60 font-medium mr-1">
                            {e.tier}
                          </span>
                          {exercise?.name ?? e.exerciseId}
                        </span>
                        <span className="text-muted-foreground">
                          {weight ? `${weight} lbs` : ""}
                          {warning && (
                            <span className="text-yellow-400 ml-1">
                              {"\u26A0\uFE0F"}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Done Button */}
        <Button
          className="w-full h-12 text-base font-bold"
          size="lg"
          onClick={() => router.push("/")}
        >
          DONE
        </Button>
      </div>
    </div>
  );
}

export default function WorkoutSummaryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <WorkoutSummaryContent />
    </Suspense>
  );
}
