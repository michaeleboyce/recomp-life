"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useUnfinishedWorkout } from "@/hooks";
import { discardIfUnfinished } from "@/lib/data/unfinished";
import { workoutDisplayName } from "@/lib/workoutNames";
import type { WorkoutSession } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { LocationChip } from "@/components/ui/location-chip";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { templateTitle } from "@/components/ActiveWorkout/templateTitle";
import { DaySelector } from "@/components/PreWorkout/DaySelector";
import { FavouriteActions } from "@/components/PreWorkout/FavouriteActions";
import { EditWorkoutButton } from "@/components/PreWorkout/EditWorkoutButton";
import { AccessoryPicker } from "@/components/PreWorkout/AccessoryPicker";
import { HomeAlternatives } from "@/components/PreWorkout/HomeAlternatives";
import { LocationToggle } from "@/components/PreWorkout/LocationToggle";
import { PainSummary } from "@/components/PreWorkout/PainSummary";
import { PlannedExerciseList } from "@/components/PreWorkout/PlannedExerciseList";
import { ReadinessCheck } from "@/components/PreWorkout/ReadinessCheck";
import { SetupAdvisories } from "@/components/PreWorkout/SetupAdvisories";
import { SetupExpander } from "@/components/PreWorkout/SetupExpander";
import { TechniqueChecklist } from "@/components/PreWorkout/TechniqueChecklist";
import { TimeEstimate } from "@/components/PreWorkout/TimeEstimate";
import { WarmUpToggle } from "@/components/PreWorkout/WarmUpToggle";
import { useFavoriteFromUrl } from "@/components/PreWorkout/useFavoriteFromUrl";
import { useWorkoutSetup } from "@/components/PreWorkout/useWorkoutSetup";
// The same session-length model as Today's tile, so the two screens agree.
import { useReadyLength } from "@/components/PreWorkout/useReadyLength";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-6 w-40 animate-pulse rounded bg-muted" />
    </div>
  );
}

// Suspense is required around useSearchParams.
export default function ConfigureWorkoutPage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <ConfigureWorkoutContent />
    </Suspense>
  );
}

function ConfigureWorkoutContent() {
  const router = useRouter();
  const params = useSearchParams();
  // Every way in (Today, Coming up, quick add, a favourite, a why sheet) lands here,
  // so this screen is the one place that knows a workout is already open.
  const open = useUnfinishedWorkout();
  const fromUrl = useFavoriteFromUrl(params.get("favorite"), params.get("mode"));
  const setup = useWorkoutSetup(
    params.get("templateId"),
    fromUrl.status === "applied" ? fromUrl.resolved : null
  );
  const length = useReadyLength(setup.plan, setup.trainingPhase);

  // Wait for the favourite too, so the rotation's day is never flashed first, and for
  // the open workout, so START never shows for a moment before Resume replaces it.
  if (
    open === undefined ||
    fromUrl.status === "loading" ||
    setup.isLoading ||
    !setup.templateId ||
    !setup.template
  ) {
    return <LoadingScreen />;
  }

  const handleStart = async () => {
    // "Start a new one instead": the open workout goes once the new one exists, and
    // only while it is still unfinished. A failure here never blocks the start.
    const replacing = open;
    const sessionId = await setup.start();
    if (!sessionId) return;
    if (replacing && replacing.id !== sessionId) {
      await discardIfUnfinished(replacing.id).catch((err) =>
        console.error("Failed to discard the replaced workout:", err)
      );
    }
    // Replace, not push: Back from the workout (or later from its summary) never
    // reopens this Ready screen for a workout that has already started.
    router.replace(`/workout/active?sessionId=${sessionId}`);
  };

  const hasSubstitutes = setup.homeAdaptations.length > 0;

  return (
    <PageShell className={open ? "space-y-4 pb-56" : "space-y-4"}>
      <div>
        <p className="text-sm text-muted-foreground">Ready?</p>
        <PageHeader
          title={templateTitle(setup.templateId)}
          backHref="/"
          action={<LocationChip location={setup.location} />}
        />
      </div>

      {fromUrl.status === "applied" && (
        <p className="text-sm text-muted-foreground">
          From favourite: {fromUrl.name} · {fromUrl.mode === "as-saved" ? "Exactly as saved" : "Today's weights"}
        </p>
      )}
      {fromUrl.status === "missing" && <Callout variant="warning">That favourite no longer exists.</Callout>}
      <FavouriteActions
        setup={setup}
        appliedName={fromUrl.status === "applied" ? fromUrl.name : undefined}
      />

      <DaySelector
        value={setup.templateId}
        dueTemplateId={setup.dueTemplateId}
        onChange={setup.setTemplateId}
      />

      {/* Needs attention: shown above the list, never tucked away. */}
      <SetupAdvisories
        runAdvisory={setup.runAdvisory}
        onRunChoice={setup.chooseRunOption}
        onSkipToday={() => router.push("/")}
        runEvidence={
          setup.runAdvisory?.evidenceId && <EvidenceLine ruleId={setup.runAdvisory.evidenceId} />
        }
        activityNote={setup.activityNote}
        onDismissActivityNote={setup.dismissActivityNote}
        activityEvidence={<EvidenceLine ruleId="activity-fatigue" />}
        recoveryWarnings={setup.recoveryWarnings}
        recoveryChoice={setup.recoveryChoice}
        onRecoveryChoice={setup.setRecoveryChoice}
        reduction={setup.t1Reduction}
        recoveryEvidence={<EvidenceLine ruleId="recovery-windows" />}
        decaySuggestions={setup.decaySuggestions}
        onAcceptDecay={setup.acceptDecay}
        onDismissDecay={setup.dismissDecay}
        decayEvidence={(suggestion) => <EvidenceLine ruleId={suggestion.evidenceId} />}
      />

      {/* The workout exactly as the active screen will perform it. */}
      <PlannedExerciseList
        plan={setup.plan}
        trainingPhase={setup.trainingPhase}
        impact={setup.impact}
      />
      <EditWorkoutButton setup={setup} />

      <div className="flex items-center gap-4">
        <LocationToggle
          location={setup.location}
          onChange={setup.setLocation}
          className="flex-1"
        />
        <WarmUpToggle enabled={setup.warmUps} onChange={setup.setWarmUps} />
      </div>

      <TimeEstimate length={length} />

      {/* Everything optional. */}
      <div className="border-t border-border">
        <SetupExpander title="How are you feeling?">
          <ReadinessCheck
            sleepHours={setup.sleepHours}
            stressLevel={setup.stressLevel}
            onSleepChange={setup.setSleepHours}
            onStressChange={setup.setStressLevel}
            healthSleepMinutes={setup.healthSleepMinutes}
            location={setup.location}
          />
        </SetupExpander>

        <SetupExpander
          title="Any pain or soreness?"
          badge={
            setup.recentPainEntries.length > 0 && (
              <Badge variant="outline">{setup.recentPainEntries.length}</Badge>
            )
          }
        >
          <PainSummary entries={setup.recentPainEntries} />
        </SetupExpander>

        {setup.techniqueFocus && (
          <SetupExpander
            title={`Technique review (${setup.techniqueFocus === "squat" ? "Squat" : "Deadlift"})`}
          >
            <TechniqueChecklist exerciseType={setup.techniqueFocus} />
          </SetupExpander>
        )}

        <SetupExpander
          title="Add accessories"
          badge={
            setup.selectedAccessories.length > 0 && (
              <Badge variant="outline">{setup.selectedAccessories.length}</Badge>
            )
          }
        >
          <AccessoryPicker
            recommendations={setup.accessoryRecommendations}
            selectedAccessories={setup.selectedAccessories}
            onToggle={setup.toggleAccessory}
            trainingPhase={setup.trainingPhase}
            location={setup.location}
            exercisePreferences={setup.exercisePreferences}
          />
        </SetupExpander>

        {hasSubstitutes && (
          <SetupExpander title="Alternatives for home">
            <HomeAlternatives
              adaptations={setup.homeAdaptations}
              maxDumbbellWeight={setup.equipment.maxDumbbellWeight}
              onChoose={setup.chooseSubstitute}
              evidence={<EvidenceLine ruleId="dumbbell-conversion" variant="icon" />}
            />
          </SetupExpander>
        )}
      </div>

      {/* Fixed just above the tab bar (h-16 plus the safe area), so it is always in view. */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-40 border-t border-border bg-background/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto max-w-lg space-y-2">
          {setup.error && (
            <p role="alert" className="text-center text-sm text-destructive">
              {setup.error}
            </p>
          )}
          {open ? (
            <OpenWorkoutChoice session={open} onStartNew={handleStart} isStarting={setup.isStarting} />
          ) : (
            <Button className={START_BUTTON} onClick={handleStart} disabled={setup.isStarting}>
              {setup.isStarting ? "Starting..." : "START WORKOUT"}
            </Button>
          )}
        </div>
      </div>
    </PageShell>
  );
}

const START_BUTTON = "h-14 w-full rounded-2xl text-lg font-extrabold tracking-wide";

/**
 * A workout is already open: resuming it is the main action, so no way into this
 * screen can leave a second one behind. Starting a new one is still possible and says
 * what happens to the open one.
 */
function OpenWorkoutChoice({
  session,
  onStartNew,
  isStarting,
}: {
  session: WorkoutSession;
  onStartNew: () => void;
  isStarting: boolean;
}) {
  return (
    <>
      <p data-testid="open-workout-note" className="text-center text-[13px] text-muted-foreground">
        <span className="font-semibold text-foreground">{workoutDisplayName(session.templateId)}</span>{" "}
        is still open. Starting a new one discards it once the new one has started.
      </p>
      <Button asChild className={START_BUTTON}>
        <Link href={`/workout/active?sessionId=${session.id}`}>Resume it</Link>
      </Button>
      <Button variant="outline" className="h-11 w-full" onClick={onStartNew} disabled={isStarting}>
        {isStarting ? "Starting..." : "Start a new one instead"}
      </Button>
    </>
  );
}
