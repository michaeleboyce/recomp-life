"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getExercise } from "@/lib/exercises";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { AutoRegCallout } from "@/components/ActiveWorkout/AutoRegCallout";
import { DiscardWorkoutDialog } from "@/components/ActiveWorkout/DiscardWorkoutDialog";
import { EndWorkoutConfirmDialog } from "@/components/ActiveWorkout/EndWorkoutConfirmDialog";
import { ExerciseBlock } from "@/components/ActiveWorkout/ExerciseBlock";
import { LogDock } from "@/components/ActiveWorkout/LogDock";
import { PrOpportunityLine } from "@/components/ActiveWorkout/PrOpportunityLine";
import { RepPicker } from "@/components/ActiveWorkout/RepPicker";
import { RPESelector } from "@/components/ActiveWorkout/RPESelector";
import { WeightDisplay } from "@/components/ActiveWorkout/WeightDisplay";
import { WorkoutFinished } from "@/components/ActiveWorkout/WorkoutFinished";
import { WorkoutHeader } from "@/components/ActiveWorkout/WorkoutHeader";
import { WorkoutOverviewSheet } from "@/components/ActiveWorkout/WorkoutOverviewSheet";
import { formatClock } from "@/components/ActiveWorkout/activeWorkoutLogic";
import { templateTitle } from "@/components/ActiveWorkout/templateTitle";
import { useActiveWorkout } from "@/components/ActiveWorkout/useActiveWorkout";
import {
  useElapsedSeconds,
  useLeaveGuard,
  useNotificationPermission,
  useWakeLock,
} from "@/components/ActiveWorkout/useWorkoutGuards";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
    </div>
  );
}

export default function ActiveWorkoutPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ActiveWorkoutContent />
    </Suspense>
  );
}

function ActiveWorkoutContent() {
  const router = useRouter();
  const sessionId = useSearchParams().get("sessionId");
  const workout = useActiveWorkout(sessionId);
  const { status, session, settings, plan, sets, entry, activeIndex } = workout;

  const [overviewOpen, setOverviewOpen] = useState(false);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useWakeLock();
  useNotificationPermission();
  const openEndDialog = useCallback(() => setShowEndDialog(true), []);
  useLeaveGuard(status === "active" && !leaving, openEndDialog);
  const elapsed = formatClock(useElapsedSeconds(workout.workoutStartTime));

  // A workout that is already saved has nothing left to log: show its summary.
  useEffect(() => {
    if (status === "finished" && session) {
      router.replace(`/workout/summary?sessionId=${session.id}`);
    }
  }, [status, session, router]);

  const remainingExercises = useMemo(
    () =>
      plan
        .filter((e) => !e.isWarmUp && e.completedSets < e.targetSets)
        .map((e) => ({
          name: getExercise(e.substituteExerciseId || e.exerciseId).name,
          tier: e.tier,
          setsCompleted: e.completedSets,
          targetSets: e.targetSets,
        })),
    [plan]
  );

  const handleSave = async () => {
    if (!session) return;
    if (await workout.finish()) {
      router.push(`/workout/summary?sessionId=${session.id}`);
    }
  };

  const handleDiscard = async () => {
    setLeaving(true);
    setShowEndDialog(false);
    setShowDiscardDialog(false);
    await workout.discard();
    router.push("/");
  };

  const handleEndEarly = () => {
    setShowEndDialog(false);
    workout.endEarly();
  };

  if (status === "missing" && !leaving) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-5 text-center">
        <h1 className="text-xl font-bold">Workout not found</h1>
        <p className="text-sm text-muted-foreground">
          It may have been discarded. Start a new one from the home screen.
        </p>
        <Button asChild>
          <Link href="/">Back to home</Link>
        </Button>
      </div>
    );
  }

  if (status === "loading" || status === "finished" || leaving || !session || !settings) {
    return <LoadingScreen />;
  }

  const title = templateTitle(session.templateId);

  if (status === "complete" || !entry) {
    return (
      <div className="mx-auto min-h-screen max-w-lg bg-background px-5 pt-4 pb-8">
        <WorkoutHeader title={title} elapsed={elapsed} exercises={plan} />
        <WorkoutFinished
          setsLogged={sets.length}
          duration={elapsed}
          isSaving={workout.isCompleting}
          onSave={handleSave}
          onDiscard={handleDiscard}
          error={workout.error}
        />
      </div>
    );
  }

  const showEffort = settings.showRPE && !entry.isWarmUp;
  const nextSet = Math.min(entry.completedSets + 1, entry.targetSets);

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 bg-background px-5 pt-4 pb-36">
      <WorkoutHeader
        title={title}
        elapsed={elapsed}
        exercises={plan}
        currentExerciseIndex={activeIndex}
        onOpenOverview={() => setOverviewOpen(true)}
      />

      <ExerciseBlock
        exercise={entry}
        location={session.location}
        isAMRAPSet={workout.isAMRAPSet}
      />

      <WeightDisplay
        exercise={entry}
        location={session.location}
        equipment={settings.equipment}
        isAMRAPSet={workout.isAMRAPSet}
      />

      {workout.e1rmFlash !== null && (
        <Callout variant="success" title={`Estimated 1RM: ${workout.e1rmFlash} lbs`} />
      )}

      {workout.dropSuggestion && (
        <AutoRegCallout
          rpe={workout.dropSuggestion.rpe}
          reducedWeight={workout.dropSuggestion.reducedWeight}
          onAccept={workout.acceptDrop}
          onKeep={workout.keepWeight}
          evidence={<EvidenceLine ruleId="t2-autoregulation" hideLibraryLink />}
        />
      )}

      {workout.prOpportunity && (
        <PrOpportunityLine
          opportunity={workout.prOpportunity}
          recentAMRAPReps={workout.recentAMRAPReps}
        />
      )}

      <RepPicker
        targetReps={entry.targetReps}
        isAMRAP={workout.isAMRAPSet}
        value={workout.selectedReps}
        onChange={workout.setSelectedReps}
        highlightFrom={workout.prOpportunity?.repsNeeded}
      />

      {showEffort && (
        <RPESelector selectedRPE={workout.selectedRPE} onSelectRPE={workout.setSelectedRPE} />
      )}

      <LogDock
        reps={workout.selectedReps}
        onLog={workout.logSet}
        disabled={workout.isSaving}
        audioEnabled={settings.restTimerAudio}
        vibrationEnabled={settings.restTimerVibration}
        trainingPhase={workout.trainingPhase}
        nextLabel={`Next: set ${nextSet} of ${entry.targetSets} at ${entry.weight} lbs`}
        message={workout.error}
      />

      <WorkoutOverviewSheet
        open={overviewOpen}
        onOpenChange={setOverviewOpen}
        exercises={plan}
        sets={sets}
        currentExerciseIndex={activeIndex}
        onSelectExercise={workout.jumpTo}
        elapsedTime={elapsed}
        onEndWorkout={openEndDialog}
        onDiscard={() => setShowDiscardDialog(true)}
      />

      <EndWorkoutConfirmDialog
        open={showEndDialog}
        onOpenChange={setShowEndDialog}
        onConfirm={handleEndEarly}
        onCancel={handleDiscard}
        remainingExercises={remainingExercises}
        setsLogged={sets.length}
      />

      <DiscardWorkoutDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
        setsLogged={sets.length}
        onDiscard={handleDiscard}
      />
    </div>
  );
}
