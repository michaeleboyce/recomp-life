"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getExercise } from "@/lib/exercises";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Term } from "@/components/ui/term";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { AutoRegCallout } from "@/components/ActiveWorkout/AutoRegCallout";
import { DiscardWorkoutDialog } from "@/components/ActiveWorkout/DiscardWorkoutDialog";
import { DropSetPanel } from "@/components/ActiveWorkout/DropSetPanel";
import { SetChips } from "@/components/ActiveWorkout/SetChips";
import { weightUnit } from "@/components/SetPlan/setPlanModel";
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
import { formatClock, restNextLabel } from "@/components/ActiveWorkout/activeWorkoutLogic";
import { templateTitle } from "@/components/ActiveWorkout/templateTitle";
import { useActiveWorkout } from "@/components/ActiveWorkout/useActiveWorkout";
import {
  useElapsedSeconds,
  useLeaveGuard,
  useNotificationPermission,
  useWakeLock,
} from "@/components/ActiveWorkout/useWorkoutGuards";
import {
  ForecastNoteLine,
  LastSetBanner,
  UpNextCard,
} from "@/components/ActiveWorkout/GlassPanels";
import {
  forecastNote,
  forecastWindow,
  lastSetVerdict,
  liftForecasts,
} from "@/components/ActiveWorkout/glassForecast";
import { WhySheet } from "@/components/ui/why-sheet";
import { useSessionForecasts, useStoredDecisions } from "@/hooks";
import { findStoredDecision } from "@/lib/trace";

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

  // What was saved when the workout started: the forecasts and the "why" of each number.
  const sessionForecasts = useSessionForecasts(session?.id);
  const decisions = useStoredDecisions(session?.id) ?? undefined;
  const [whyOpen, setWhyOpen] = useState(false);

  // A workout that is already saved has nothing left to log: go on to Today. This is
  // how Back from its summary lands (the summary replaced this screen, but the leave
  // guard's entry is still under it), also after a reload, so Back never loops.
  useEffect(() => {
    if (status === "finished" && session) router.replace("/");
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
      router.replace(`/workout/summary?sessionId=${session.id}`);
    }
  };

  // Step away: nothing is changed or saved; Today's main button becomes Resume.
  const handleLeave = () => {
    setLeaving(true);
    setShowEndDialog(false);
    router.push("/");
  };

  // Discarding from the end dialog asks once more, in the discard dialog.
  const confirmDiscard = () => {
    setShowEndDialog(false);
    setShowDiscardDialog(true);
  };

  const handleDiscard = async () => {
    setLeaving(true);
    setShowEndDialog(false);
    setShowDiscardDialog(false);
    try {
      await workout.discard();
    } catch (err) {
      console.error("Failed to discard workout:", err);
      setLeaving(false);
      return;
    }
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
  const isOver = status === "complete" || !entry;

  // A drop after the latest set: one tap from the rest screen (or the finished screen).
  const latestSet = sets.at(-1);
  const dropUnit =
    latestSet?.substituteExerciseId && getExercise(latestSet.substituteExerciseId).grip === "per_hand"
      ? "lbs/hand"
      : "lbs";
  const dropSetLabel =
    workout.dropPreview != null ? `Drop to ${workout.dropPreview} ${dropUnit}` : undefined;
  const onDropSet = workout.dropPreview != null ? workout.startDropSet : undefined;

  // Drop sets in progress: the screen is the drop, with no rest and no other way off.
  const dropSet = workout.dropSet;
  if (dropSet) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 bg-background px-5 pt-4 pb-44">
        <WorkoutHeader title={title} location={session.location} elapsed={elapsed} exercises={plan} currentExerciseIndex={activeIndex} />
        <DropSetPanel
          root={dropSet.root}
          drops={dropSet.drops}
          exercise={dropSet.exercise}
          location={session.location}
          equipment={settings.equipment}
          weight={dropSet.weight}
          step={dropSet.step}
          minWeight={dropSet.minWeight}
          onWeight={workout.setDropWeight}
          reps={dropSet.reps}
          suggestedReps={dropSet.suggestedReps}
          onReps={workout.setDropReps}
          onLog={workout.logDropSet}
          onDone={workout.endDropSets}
          restFollows={!isOver}
          disabled={workout.isSaving}
          message={workout.error}
        />
      </div>
    );
  }

  // The overview stays reachable once the workout is over, so the last set can still
  // be corrected before saving; jumping and ending early no longer apply then.
  const overview = (
    <>
      <WorkoutOverviewSheet
        open={overviewOpen}
        onOpenChange={setOverviewOpen}
        exercises={plan}
        sets={sets}
        currentExerciseIndex={activeIndex}
        onSelectExercise={isOver ? undefined : workout.jumpTo}
        elapsedTime={elapsed}
        onEndWorkout={isOver ? undefined : openEndDialog}
        onDiscard={() => setShowDiscardDialog(true)}
        workoutId={session.id}
        onCorrectSet={workout.correctSet}
        correctionError={workout.correctionError}
        onCorrectionStart={workout.clearCorrectionError}
      />
      <DiscardWorkoutDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
        setsLogged={sets.length}
        onDiscard={handleDiscard}
      />
    </>
  );

  if (isOver) {
    return (
      <div className="mx-auto min-h-screen max-w-lg bg-background px-5 pt-4 pb-8">
        <WorkoutHeader
          title={title}
          location={session.location}
          elapsed={elapsed}
          exercises={plan}
          onOpenOverview={sets.length > 0 ? () => setOverviewOpen(true) : undefined}
        />
        <WorkoutFinished
          setsLogged={sets.length}
          duration={elapsed}
          isSaving={workout.isCompleting}
          onSave={handleSave}
          onDiscard={handleDiscard}
          error={workout.error}
          onDropSet={workout.endedEarly ? undefined : onDropSet}
          dropSetLabel={dropSetLabel}
        />
        {overview}
      </div>
    );
  }

  const showEffort = settings.showRPE && !entry.isWarmUp;
  const shown = getExercise(entry.substituteExerciseId || entry.exerciseId);
  const perHand = !!entry.substituteExerciseId && shown.grip === "per_hand";
  const nextLabel = restNextLabel(entry, shown.name, perHand);

  // The last set of a T1 lift: the rep forecast stored at start, when there is one.
  // No row (a first session, a swapped-in lift, another weight) means nothing is shown.
  const forecast =
    workout.isAMRAPSet && entry.tier === "T1" && !entry.isWarmUp
      ? liftForecasts(sessionForecasts, entry)
      : null;
  const forecastView = forecast
    ? {
        pmf: forecast.reps.prediction.pmf!,
        low: forecast.reps.prediction.low!,
        high: forecast.reps.prediction.high!,
        ...forecastWindow(forecast.reps.prediction.pmf!, forecast.reps.prediction.low!),
      }
    : null;
  const note = forecast
    ? forecastNote(forecast, {
        weight: entry.weight,
        reps: workout.selectedReps,
        rpe: workout.selectedRPE,
      })
    : null;
  const forecastBestFrom =
    typeof forecast?.newBest?.inputs.repsNeeded === "number" ? forecast.newBest.inputs.repsNeeded : null;

  // How this weight was reached, as saved at start.
  const weightWhy = entry.isWarmUp
    ? undefined
    : findStoredDecision(decisions, "weight", entry.exerciseId, entry.tier);

  // The rest screen: the set just logged is the most recent one (after drops, the set
  // they continued: drops have no forecast of their own).
  const lastSet = [...sets].reverse().find((set) => set.role !== "drop");
  const restWhy = lastSet ? findStoredDecision(decisions, "rest", lastSet.exerciseId, lastSet.tier) : undefined;
  const lastForecast =
    lastSet && lastSet.isAMRAP && lastSet.tier === "T1"
      ? liftForecasts(sessionForecasts, {
          exerciseId: lastSet.exerciseId,
          tier: lastSet.tier,
          weight: lastSet.weight,
        })
      : null;
  const restBanner =
    lastSet && lastForecast ? (
      <LastSetBanner
        verdict={lastSetVerdict(lastForecast, lastSet, session)}
        previousBest={lastForecast.newBest?.event.level ?? null}
      />
    ) : null;
  // The lift's chance to pass is about its working weight, whatever the next set weighs.
  const workingWeight = workout.planEntry?.weight ?? entry.weight;
  const passForecast = sessionForecasts?.find(
    ({ forecast: row }) =>
      row.kind === "liftPass" &&
      row.exerciseId === entry.exerciseId &&
      row.tier === entry.tier &&
      row.event.weight === workingWeight
  )?.forecast;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col gap-4 bg-background px-5 pt-4 pb-36">
      <WorkoutHeader
        title={title}
        location={session.location}
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
        onWhy={weightWhy ? () => setWhyOpen(true) : undefined}
      />
      <SetChips
        key={workout.activeIndex}
        name={shown.name}
        chips={workout.setChips}
        unit={weightUnit(perHand)}
        step={workout.weightStep}
        minWeight={workout.minWeight}
        onChange={workout.setSetWeight}
      />
      {weightWhy && (
        <WhySheet
          open={whyOpen}
          onOpenChange={setWhyOpen}
          title={`${entry.tier} · ${shown.name} · why this weight`}
          trace={weightWhy}
        >
          {/* The trace was saved at start, for the planned weight. */}
          {workout.droppedFrom !== null && (
            <div data-testid="why-dropped" className="flex flex-col gap-1 px-4 pb-4 text-[13px] leading-snug">
              <p>
                Lowered during the workout from {workout.droppedFrom} to {entry.weight} lbs: you
                accepted the drop after a hard first set. The steps above are how{" "}
                {workout.droppedFrom} lbs was planned.
              </p>
              <EvidenceLine ruleId="t2-autoregulation" hideLibraryLink />
            </div>
          )}
        </WhySheet>
      )}

      {workout.e1rmFlash !== null && (
        <Callout
          variant="success"
          title={
            <>
              <Term id="e1rm" hideLinks>
                Estimated 1RM
              </Term>
              : {workout.e1rmFlash} lbs
            </>
          }
        />
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

      {/* The stored forecast's sentence replaces the PR line when it names a new best. */}
      {workout.prOpportunity && forecastBestFrom === null && (
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
        highlightFrom={forecastBestFrom ?? workout.prOpportunity?.repsNeeded}
        forecast={forecastView}
      >
        {note && <ForecastNoteLine note={note} />}
      </RepPicker>

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
        nextLabel={nextLabel}
        message={workout.error}
        restWhy={restWhy}
        restBanner={restBanner}
        restUpNext={<UpNextCard entry={entry} label={nextLabel} passForecast={passForecast} />}
        onDropSet={onDropSet}
        dropSetLabel={dropSetLabel}
      />

      {overview}

      <EndWorkoutConfirmDialog
        open={showEndDialog}
        onOpenChange={setShowEndDialog}
        onConfirm={handleEndEarly}
        onLeave={handleLeave}
        onCancel={confirmDiscard}
        remainingExercises={remainingExercises}
        setsLogged={sets.length}
      />
    </div>
  );
}
