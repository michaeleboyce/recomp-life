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
import { EffortSelector } from "@/components/ActiveWorkout/EffortSelector";
import { WeightDisplay } from "@/components/ActiveWorkout/WeightDisplay";
import { WorkoutFinished } from "@/components/ActiveWorkout/WorkoutFinished";
import { WorkoutHeader } from "@/components/ActiveWorkout/WorkoutHeader";
import { WorkoutOverviewSheet } from "@/components/ActiveWorkout/WorkoutOverviewSheet";
import { formatClock, restNextLabel } from "@/components/ActiveWorkout/activeWorkoutLogic";
import { templateTitle } from "@/lib/workoutNames";
import { useActiveWorkout } from "@/components/ActiveWorkout/useActiveWorkout";
import { useWorkoutAccessories } from "@/components/ActiveWorkout/useWorkoutAccessories";
import { AccessoryNextTime, AddAccessoryButton } from "@/components/ActiveWorkout/AccessoryNextTime";
import { T3NextTime } from "@/components/ActiveWorkout/T3NextTime";
import { t3IncreaseForEntry, t3MoveUpHint, t3NextTimeAfterSet } from "@/lib/workout/t3Increase";
import { AccessorySheet } from "@/components/PreWorkout/AccessorySheet";
import { SwapSheet } from "@/components/Swap/SwapSheet";
import { useSwapContext } from "@/components/Swap/useSwapContext";
import type { SwapCandidate, SwapSlot } from "@/lib/swap";
import type { WorkoutExerciseState } from "@/lib/workout/types";
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
import { toast } from "@/components/ui/toast";
import { errorText } from "@/components/LogEdit/format";
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

  // Accessories: add one mid-workout (appended to the plan), and what each does next time.
  const accessories = useWorkoutAccessories(session, plan, settings);
  const [addOpen, setAddOpen] = useState(false);
  const addAccessory = async (exerciseId: string) => {
    const prescription = accessories.prescriptionFor(exerciseId);
    if (!prescription) return;
    try {
      await workout.addExercise(exerciseId, prescription);
      toast({ message: `${getExercise(exerciseId).name} added at the end` });
    } catch (err) {
      console.error("Failed to add an accessory:", err);
      toast({ message: `Could not add it: ${errorText(err)}` });
    }
  };
  // Swapping or removing an exercise mid-workout (W11): the entry as it was when the
  // sheet opened, and that moment (what the candidates are ranked at).
  const [swapping, setSwapping] = useState<{ entry: WorkoutExerciseState; at: Date } | null>(null);
  const swapEntry = swapping?.entry;
  const swapSlot = useMemo<SwapSlot | undefined>(
    () =>
      swapEntry
        ? {
            tier: swapEntry.tier,
            sets: swapEntry.targetSets,
            reps: swapEntry.targetReps,
            isAMRAP: swapEntry.isAMRAP,
            weight: swapEntry.weight,
            ...(swapEntry.originalWeight != null ? { originalWeight: swapEntry.originalWeight } : {}),
          }
        : undefined,
    [swapEntry]
  );
  const [openedAt] = useState(() => new Date());
  const swapContext = useSwapContext({
    location: session?.location ?? "gym",
    exclude: accessories.inPlan,
    ...(swapSlot ? { slot: swapSlot } : {}),
    inWorkout: true,
    now: swapping?.at ?? openedAt,
  });
  /** The working entry a block or row stands for (a warm-up's is the lift after it). */
  const workingIndex = (index: number) => {
    const at = plan[index];
    if (!at?.isWarmUp) return index;
    return plan.findIndex((e, i) => i > index && !e.isWarmUp && e.exerciseId === at.exerciseId);
  };
  const openSwap = (index: number) => {
    const working = workingIndex(index);
    if (working >= 0) setSwapping({ entry: plan[working], at: new Date() });
  };
  const confirmSwap = async (picks: SwapCandidate[]) => {
    if (!swapEntry) return;
    await workout.swapExercise(swapEntry.exerciseId, swapEntry.tier, picks);
    toast({ message: `${getExercise(picks[0].exerciseId).name} swapped in` });
  };
  const removeAt = async (index: number) => {
    const at = plan[index];
    if (!at) return;
    try {
      await workout.removeExercise(at.exerciseId, at.tier);
      toast({ message: `${getExercise(at.substituteExerciseId || at.exerciseId).name} removed from this workout` });
    } catch (err) {
      console.error("Failed to remove an exercise:", err);
      toast({ message: `Could not remove it: ${errorText(err)}` });
    }
  };

  // The accessory whose sets were all just done: what it does next time (A9).
  const lastAccessorySet = sets.at(-1)?.tier === "accessory" ? sets.at(-1) : undefined;
  const lastAccessoryId = lastAccessorySet ? lastAccessorySet.substituteExerciseId || lastAccessorySet.exerciseId : null;
  const lastAccessoryEntry = lastAccessoryId
    ? plan.find((e) => !e.isWarmUp && e.tier === "accessory" && (e.substituteExerciseId || e.exerciseId) === lastAccessoryId)
    : undefined;
  const accessoryNext =
    lastAccessoryId && lastAccessoryEntry && lastAccessoryEntry.completedSets >= lastAccessoryEntry.targetSets
      ? accessories.nextTime(lastAccessoryId, sets)
      : null;

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
      toast({ message: `Could not discard the workout: ${errorText(err)}` });
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
  // A T3's last set just logged: what its weight does next time, against its own threshold.
  const t3Next = t3NextTimeAfterSet(
    [...sets].reverse().find((set) => set.role !== "drop"),
    plan,
    sets,
    settings.equipment
  );

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
        onSwapExercise={isOver ? undefined : openSwap}
        onRemoveExercise={isOver ? undefined : (index) => void removeAt(index)}
      />
      {swapEntry && (
        <SwapSheet
          open={swapping != null}
          onOpenChange={(next) => !next && setSwapping(null)}
          exerciseId={swapEntry.exerciseId}
          shownId={swapEntry.substituteExerciseId || swapEntry.exerciseId}
          tier={swapEntry.tier}
          context={swapContext}
          inWorkout
          setsLogged={swapEntry.completedSets}
          onConfirm={confirmSwap}
        />
      )}
      <DiscardWorkoutDialog
        open={showDiscardDialog}
        onOpenChange={setShowDiscardDialog}
        setsLogged={sets.length}
        onDiscard={handleDiscard}
      />
    </>
  );

  const addSheet = accessories.source ? (
    <AccessorySheet
      open={addOpen}
      onOpenChange={setAddOpen}
      addOnly
      inWorkout
      dayLabel={title}
      rows={[]}
      choice={accessories.choice}
      source={accessories.source}
      inPlan={accessories.inPlan}
      phase={workout.trainingPhase}
      onAdd={addAccessory}
    />
  ) : null;

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
        {accessoryNext && lastAccessoryId && (
          <AccessoryNextTime name={getExercise(lastAccessoryId).name} text={accessoryNext} className="mb-4" />
        )}
        {t3Next && <T3NextTime name={getExercise(t3Next.exerciseId).name} text={t3Next.text} className="mb-4" />}
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
        {!workout.endedEarly && (
          <AddAccessoryButton onClick={() => setAddOpen(true)} className="mt-4" />
        )}
        {overview}
        {addSheet}
      </div>
    );
  }

  const showEffort = settings.showEffort && !entry.isWarmUp;
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
        repsInReserve: workout.selectedRepsInReserve,
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
    ) : accessoryNext && lastAccessoryId ? (
      <AccessoryNextTime name={getExercise(lastAccessoryId).name} text={accessoryNext} />
    ) : t3Next ? (
      <T3NextTime name={getExercise(t3Next.exerciseId).name} text={t3Next.text} />
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
        {...(workout.isAMRAPSet && entry.tier === "T3" && !entry.isWarmUp
          ? { moveUpHint: t3MoveUpHint(t3IncreaseForEntry(entry, settings.equipment)) }
          : {})}
        repRange={
          entry.tier === "accessory"
            ? accessories.repRange(entry.substituteExerciseId || entry.exerciseId, entry.targetReps)
            : undefined
        }
        onSwap={() => openSwap(activeIndex)}
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
        {...(workout.maxWeight != null ? { maxWeight: workout.maxWeight } : {})}
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
          repsInReserve={workout.dropSuggestion.repsInReserve}
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
        <EffortSelector
          selected={workout.selectedRepsInReserve}
          onSelect={workout.setSelectedRepsInReserve}
        />
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

      <AddAccessoryButton onClick={() => setAddOpen(true)} />

      {overview}
      {addSheet}

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
