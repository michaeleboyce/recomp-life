"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { v4 as uuidv4 } from "uuid";
import { db } from "@/db/local";
import { useWorkoutStore, type WorkoutExerciseState } from "@/stores/workoutStore";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { getExercise, EXERCISES } from "@/lib/exercises";
import { generateWarmUpSets } from "@/lib/warmups";
import { barbellToDumbbell } from "@/lib/dbConversion";
import { calculateE1RM } from "@/lib/e1rm";
import {
  evaluateT1Progression,
  evaluateT2Progression,
  evaluateT2AutoRegulation,
} from "@/lib/progression";
import type {
  SetLog,
  Tier,
  TrainingPhase,
  UserSettings,
  LiftState,
} from "@/types";

import { WorkoutHeader } from "@/components/ActiveWorkout/WorkoutHeader";
import { ExerciseBlock } from "@/components/ActiveWorkout/ExerciseBlock";
import { SetLogger } from "@/components/ActiveWorkout/SetLogger";
import { RPESelector } from "@/components/ActiveWorkout/RPESelector";
import { RestTimer } from "@/components/ActiveWorkout/RestTimer";
import { CompletedSets } from "@/components/ActiveWorkout/CompletedSets";
import { UpNext } from "@/components/ActiveWorkout/UpNext";
import { AMRAPIndicator } from "@/components/ActiveWorkout/AMRAPIndicator";
import { WarmUpSet as WarmUpSetComponent } from "@/components/ActiveWorkout/WarmUpSet";
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

// Rest time defaults per tier
function getDefaultRestTime(
  tier: Tier,
  trainingPhase: TrainingPhase
): number {
  const isCutting = trainingPhase.mode === "cutting";
  switch (tier) {
    case "T1":
      return isCutting ? 210 : 180;
    case "T2":
      return isCutting ? 150 : 120;
    case "T3":
      return 60;
    case "accessory":
      return 60;
    case "warmup":
      return 60;
    default:
      return 60;
  }
}

function getLiftType(exerciseId: string): "upper" | "lower" {
  const exercise = getExercise(exerciseId);
  return exercise.muscleGroup === "legs" ? "lower" : "upper";
}

export default function ActiveWorkoutPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get("sessionId");

  // Store state
  const store = useWorkoutStore();
  const {
    currentExerciseIndex,
    exercises,
    isRestTimerActive,
    workoutStartTime,
    completedSets,
    logSet: storeLogSet,
    advanceSet,
    startRestTimer,
    skipRest,
    startWorkout,
    updateExerciseWeight,
    reset,
  } = store;

  // Local UI state
  const [selectedReps, setSelectedReps] = useState<number | null>(null);
  const [selectedRPE, setSelectedRPE] = useState<number | null>(null);
  const [e1rmDisplay, setE1rmDisplay] = useState<number | null>(null);
  const [t2AutoRegBanner, setT2AutoRegBanner] = useState<{
    message: string;
    reducedWeight: number;
    exerciseIndex: number;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCompleting, setIsCompleting] = useState(false);

  // Load session from Dexie
  const session = useLiveQuery(
    () => (sessionId ? db.workouts.get(sessionId) : undefined),
    [sessionId]
  );

  // Load user profile for settings
  const userProfile = useLiveQuery(() => db.userProfile.toArray(), []);
  const settings: UserSettings | null = userProfile?.[0]?.settings ?? null;
  const trainingPhase: TrainingPhase = settings?.trainingPhase ?? {
    mode: "maintaining",
  };

  // Load lift states
  const liftStates = useLiveQuery(() => db.liftStates.toArray(), []);

  // Initialize workout from session data
  useEffect(() => {
    if (!session || !liftStates || !settings || store.sessionId === session.id) {
      if (session && store.sessionId === session.id) {
        setIsLoading(false);
      }
      return;
    }

    const template = WORKOUT_TEMPLATES[session.templateId];
    if (!template) {
      setIsLoading(false);
      return;
    }

    const liftStateMap = new Map<string, LiftState>();
    for (const ls of liftStates) {
      liftStateMap.set(ls.exerciseId, ls);
    }

    const workoutExercises: WorkoutExerciseState[] = [];

    // Build exercises from template
    for (const templateEx of template.exercises) {
      const exercise = getExercise(templateEx.exerciseId);
      const ls = liftStateMap.get(templateEx.exerciseId);

      let weight: number;
      let sets: number;
      let reps: number;

      if (templateEx.tier === "T1" && ls) {
        weight = ls.t1Weight;
        const stageConfig: Record<string, { sets: number; reps: number }> = {
          "5x3": { sets: 5, reps: 3 },
          "6x2": { sets: 6, reps: 2 },
          "10x1": { sets: 10, reps: 1 },
        };
        const config = stageConfig[ls.t1Stage];
        sets = config.sets;
        reps = config.reps;
      } else if (templateEx.tier === "T2" && ls) {
        weight = ls.t2Weight;
        const stageConfig: Record<string, { sets: number; reps: number }> = {
          "3x10": { sets: 3, reps: 10 },
          "3x8": { sets: 3, reps: 8 },
          "3x6": { sets: 3, reps: 6 },
        };
        const config = stageConfig[ls.t2Stage];
        sets = config.sets;
        reps = config.reps;
      } else {
        weight = templateEx.tier === "T3" ? 0 : 0;
        sets = templateEx.sets;
        reps = templateEx.reps;
      }

      // Handle home substitutions
      let substituteExerciseId: string | undefined;
      let adaptedWeight = weight;
      let originalWeight: number | undefined;

      if (
        session.location === "home" &&
        exercise.requiresGym &&
        exercise.dumbbellAlternative
      ) {
        substituteExerciseId = exercise.dumbbellAlternative;
        originalWeight = weight;
        adaptedWeight = barbellToDumbbell(weight);
      }

      // Generate warm-up sets for T1 if enabled
      if (templateEx.tier === "T1" && session.includeWarmUps) {
        const warmUpSets = generateWarmUpSets(
          adaptedWeight,
          session.location,
          settings.equipment
        );
        for (let i = 0; i < warmUpSets.length; i++) {
          workoutExercises.push({
            exerciseId: templateEx.exerciseId,
            substituteExerciseId,
            tier: "warmup",
            targetSets: 1,
            targetReps: warmUpSets[i].reps,
            weight: warmUpSets[i].weight,
            originalWeight,
            isAMRAP: false,
            isWarmUp: true,
            completedSets: 0,
          });
        }
      }

      // Add main working sets exercise
      workoutExercises.push({
        exerciseId: templateEx.exerciseId,
        substituteExerciseId,
        tier: templateEx.tier,
        targetSets: sets,
        targetReps: reps,
        weight: adaptedWeight,
        originalWeight,
        isAMRAP: templateEx.isAMRAP,
        isWarmUp: false,
        completedSets: 0,
      });
    }

    // Add selected accessories
    if (session.selectedAccessories?.length > 0) {
      for (const accId of session.selectedAccessories) {
        if (EXERCISES[accId]) {
          workoutExercises.push({
            exerciseId: accId,
            tier: "accessory",
            targetSets: 3,
            targetReps: 15,
            weight: 0,
            isAMRAP: true,
            isWarmUp: false,
            completedSets: 0,
          });
        }
      }
    }

    startWorkout(session.id, session.templateId, session.location, workoutExercises);
    setIsLoading(false);
  }, [session, liftStates, settings, store.sessionId, startWorkout]);

  // Current exercise reference
  const currentExercise: WorkoutExerciseState | undefined =
    exercises[currentExerciseIndex];

  // Check if workout is complete
  const isWorkoutComplete =
    !isLoading &&
    exercises.length > 0 &&
    currentExerciseIndex >= exercises.length;

  // Determine if current set is AMRAP
  const isCurrentSetAMRAP = useMemo(() => {
    if (!currentExercise) return false;
    if (!currentExercise.isAMRAP) return false;
    const currentSet = currentExercise.completedSets + 1;
    return currentSet === currentExercise.targetSets;
  }, [currentExercise]);

  // Handle logging a set
  const handleLogSet = useCallback(async () => {
    if (!currentExercise || selectedReps === null || !session) return;

    const currentSetNumber = currentExercise.completedSets + 1;
    const isAMRAP =
      currentExercise.isAMRAP &&
      currentSetNumber === currentExercise.targetSets;

    const setLog: SetLog = {
      id: uuidv4(),
      clientId: uuidv4(),
      exerciseId: currentExercise.exerciseId,
      tier: currentExercise.tier,
      setNumber: currentSetNumber,
      targetReps: currentExercise.targetReps,
      actualReps: selectedReps,
      weight: currentExercise.weight,
      isAMRAP,
      completedAt: new Date(),
      restAfterSeconds: 0,
      status:
        selectedReps >= currentExercise.targetReps ? "completed" : "failed",
      originalWeight: currentExercise.originalWeight,
      isSubstituted: !!currentExercise.substituteExerciseId,
      substituteExerciseId: currentExercise.substituteExerciseId,
      rpe: selectedRPE ?? undefined,
      location: store.location,
    };

    // Save to Dexie immediately
    try {
      await db.sets.put(setLog);
    } catch (err) {
      console.error("Failed to save set to Dexie:", err);
    }

    // Show e1RM for AMRAP sets
    if (isAMRAP && selectedReps >= 2) {
      const e1rm = calculateE1RM(currentExercise.weight, selectedReps);
      if (e1rm) {
        setE1rmDisplay(e1rm);
        setTimeout(() => setE1rmDisplay(null), 3000);

        // Save e1RM to Dexie
        try {
          await db.estimated1RMs.put({
            id: uuidv4(),
            date: new Date(),
            exerciseId: currentExercise.exerciseId,
            workingWeight: currentExercise.weight,
            repsCompleted: selectedReps,
            estimated1RM: e1rm,
            workoutSessionId: session.id,
          });
        } catch (err) {
          console.error("Failed to save e1RM:", err);
        }
      }
    }

    // T2 Auto-regulation check after Set 1
    if (
      currentExercise.tier === "T2" &&
      currentSetNumber === 1 &&
      selectedRPE !== null &&
      settings
    ) {
      const result = evaluateT2AutoRegulation(
        selectedRPE,
        trainingPhase,
        currentExercise.weight
      );
      if (result.action === "suggest_drop" && result.reducedWeight) {
        setT2AutoRegBanner({
          message: result.message || "",
          reducedWeight: result.reducedWeight,
          exerciseIndex: currentExerciseIndex,
        });
      }
    }

    // Log set in store
    storeLogSet(setLog);

    // Reset UI state
    setSelectedReps(null);
    setSelectedRPE(null);

    // Check if this was the last set of the exercise
    const updatedCompletedSets = currentExercise.completedSets + 1;
    const isLastSetOfExercise =
      updatedCompletedSets >= currentExercise.targetSets;

    if (isLastSetOfExercise) {
      // Auto-advance to next exercise (skip rest for last set)
      advanceSet();
    } else {
      // Start rest timer
      const restTime = getDefaultRestTime(currentExercise.tier, trainingPhase);
      startRestTimer(restTime);
      advanceSet();
    }
  }, [
    currentExercise,
    selectedReps,
    selectedRPE,
    session,
    store.location,
    currentExerciseIndex,
    settings,
    trainingPhase,
    storeLogSet,
    advanceSet,
    startRestTimer,
  ]);

  // Handle T2 auto-reg accept
  const handleAcceptDrop = useCallback(() => {
    if (!t2AutoRegBanner) return;
    updateExerciseWeight(t2AutoRegBanner.exerciseIndex, t2AutoRegBanner.reducedWeight);
    setT2AutoRegBanner(null);
  }, [t2AutoRegBanner, updateExerciseWeight]);

  const handleRejectDrop = useCallback(() => {
    setT2AutoRegBanner(null);
  }, []);

  // Handle workout completion
  const handleCompleteWorkout = useCallback(async () => {
    if (!session || !liftStates || !settings || isCompleting) return;
    setIsCompleting(true);

    try {
      const liftStateMap = new Map<string, LiftState>();
      for (const ls of liftStates) {
        liftStateMap.set(ls.exerciseId, ls);
      }

      const template = WORKOUT_TEMPLATES[session.templateId];
      if (template) {
        for (const templateEx of template.exercises) {
          const ls = liftStateMap.get(templateEx.exerciseId);
          if (!ls) continue;

          const exerciseSets = completedSets.filter(
            (s) =>
              s.exerciseId === templateEx.exerciseId &&
              s.tier === templateEx.tier
          );

          if (exerciseSets.length === 0) continue;

          const liftType = getLiftType(templateEx.exerciseId);

          if (templateEx.tier === "T1") {
            const newState = evaluateT1Progression(
              ls,
              exerciseSets,
              session.location,
              settings.equipment,
              liftType
            );
            newState.t1LastWorkoutDate = new Date();
            await db.liftStates.put(newState);
          } else if (templateEx.tier === "T2") {
            const newState = evaluateT2Progression(
              ls,
              exerciseSets,
              session.location,
              settings.equipment,
              liftType
            );
            newState.t2LastWorkoutDate = new Date();
            await db.liftStates.put(newState);
          }
        }
      }

      // Update session
      const now = new Date();
      const durationSeconds = workoutStartTime
        ? Math.floor((now.getTime() - workoutStartTime.getTime()) / 1000)
        : 0;

      await db.workouts.update(session.id, {
        completedAt: now,
        totalDurationSeconds: durationSeconds,
        sets: completedSets,
      });

      // Navigate to summary
      router.push(`/workout/summary?sessionId=${session.id}`);
    } catch (err) {
      console.error("Failed to complete workout:", err);
      setIsCompleting(false);
    }
  }, [
    session,
    liftStates,
    settings,
    isCompleting,
    completedSets,
    workoutStartTime,
    router,
  ]);

  // Loading state
  if (isLoading || !session || !settings) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading workout...</p>
      </div>
    );
  }

  // No session found
  if (!sessionId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">
          No workout session found. Please start a workout from the dashboard.
        </p>
      </div>
    );
  }

  // Workout complete screen
  if (isWorkoutComplete) {
    return (
      <div className="min-h-screen bg-background">
        <WorkoutHeader
          templateName={WORKOUT_TEMPLATES[store.templateId]?.name || store.templateId}
          workoutStartTime={workoutStartTime}
        />
        <div className="flex flex-col items-center justify-center p-8 space-y-6">
          <div className="text-center space-y-2">
            <h2 className="text-2xl font-bold">Workout Complete!</h2>
            <p className="text-muted-foreground">
              {completedSets.length} sets logged
            </p>
          </div>
          <Button
            size="lg"
            className="w-full max-w-sm"
            onClick={handleCompleteWorkout}
            disabled={isCompleting}
          >
            {isCompleting ? "Saving..." : "Finish & View Summary"}
          </Button>
        </div>
      </div>
    );
  }

  // No current exercise (shouldn't happen, but safeguard)
  if (!currentExercise) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">No exercises found.</p>
      </div>
    );
  }

  const templateName =
    WORKOUT_TEMPLATES[store.templateId]?.name || store.templateId;
  const exerciseId =
    currentExercise.substituteExerciseId || currentExercise.exerciseId;

  // Warm-up sets for current T1 exercise
  const warmUpSetsForCurrentExercise: WorkoutExerciseState[] = [];
  if (currentExercise.tier === "T1") {
    // Look backwards to find associated warm-up exercises
    for (let i = currentExerciseIndex - 1; i >= 0; i--) {
      const ex = exercises[i];
      if (
        ex.isWarmUp &&
        ex.exerciseId === currentExercise.exerciseId
      ) {
        warmUpSetsForCurrentExercise.unshift(ex);
      } else {
        break;
      }
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <WorkoutHeader
        templateName={templateName}
        workoutStartTime={workoutStartTime}
      />

      <div className="max-w-lg mx-auto">
        {/* Exercise Block */}
        <ExerciseBlock
          exercise={currentExercise}
          location={store.location}
        />

        {/* AMRAP Indicator */}
        {isCurrentSetAMRAP && (
          <AMRAPIndicator
            tier={currentExercise.tier}
            trainingPhase={trainingPhase}
          />
        )}

        {/* e1RM Display */}
        {e1rmDisplay !== null && (
          <Alert className="mx-4 mt-2 border-green-500/50 bg-green-500/10">
            <AlertTitle className="text-green-400 font-semibold">
              Estimated 1RM: {e1rmDisplay} lbs
            </AlertTitle>
          </Alert>
        )}

        {/* T2 Auto-Regulation Banner */}
        {t2AutoRegBanner && (
          <Card className="mx-4 mt-3 border-amber-500/50 bg-amber-500/10">
            <CardContent className="py-3 space-y-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-amber-400">
                  AUTO-ADJUST SUGGESTED
                </p>
                <p className="text-sm text-muted-foreground">
                  {t2AutoRegBanner.message}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleAcceptDrop}
                >
                  Accept Drop
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleRejectDrop}
                >
                  Keep Weight
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rest Timer */}
        <div className="mt-3">
          <RestTimer />
        </div>

        {/* Warm-up sets display (completed warm-ups for current T1) */}
        {warmUpSetsForCurrentExercise.length > 0 && (
          <div className="mt-2">
            {warmUpSetsForCurrentExercise.map((wu, idx) => (
              <WarmUpSetComponent
                key={`warmup-${idx}`}
                warmUpSet={{
                  weight: wu.weight,
                  reps: wu.targetReps,
                  label: `Warm-up ${idx + 1}`,
                }}
                setNumber={idx + 1}
                totalSets={warmUpSetsForCurrentExercise.length}
                isCompleted={wu.completedSets > 0}
              />
            ))}
          </div>
        )}

        {/* Set Logger */}
        {!isRestTimerActive && (
          <div className="mt-4 space-y-4">
            <SetLogger
              targetReps={currentExercise.targetReps}
              onSelectReps={setSelectedReps}
              selectedReps={selectedReps}
            />

            {/* RPE Selector */}
            {settings.showRPE && !currentExercise.isWarmUp && (
              <RPESelector
                selectedRPE={selectedRPE}
                onSelectRPE={setSelectedRPE}
              />
            )}

            {/* Log Set Button */}
            <div className="px-4">
              <Button
                className="w-full h-14 text-lg font-bold"
                size="lg"
                disabled={selectedReps === null}
                onClick={handleLogSet}
              >
                LOG SET
              </Button>
            </div>
          </div>
        )}

        {/* Completed Sets */}
        <CompletedSets
          sets={completedSets}
          exerciseId={exerciseId}
          location={store.location}
        />

        {/* Up Next */}
        <UpNext
          exercises={exercises}
          currentExerciseIndex={currentExerciseIndex}
        />
      </div>
    </div>
  );
}
