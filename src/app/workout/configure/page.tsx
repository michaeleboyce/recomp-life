"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LocationChip } from "@/components/ui/location-chip";
import { PageHeader, PageShell } from "@/components/ui/page-shell";
import { EvidenceLine } from "@/components/Evidence/EvidenceLine";
import { templateTitle } from "@/components/ActiveWorkout/templateTitle";
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
import { useWorkoutSetup } from "@/components/PreWorkout/useWorkoutSetup";
// The same estimate as Today's "about N min", so the two screens agree.
import { estimateWorkoutMinutes } from "@/components/Today/format";

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
  const setup = useWorkoutSetup(useSearchParams().get("templateId"));

  if (setup.isLoading || !setup.templateId || !setup.template) {
    return <LoadingScreen />;
  }

  const handleStart = async () => {
    const sessionId = await setup.start();
    if (sessionId) router.push(`/workout/active?sessionId=${sessionId}`);
  };

  const hasSubstitutes = setup.homeAdaptations.length > 0;

  return (
    <PageShell className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">Ready?</p>
        <PageHeader
          title={templateTitle(setup.templateId)}
          action={<LocationChip location={setup.location} />}
        />
      </div>

      {/* Needs attention: shown above the list, never tucked away. */}
      <SetupAdvisories
        runAdvisory={setup.runAdvisory}
        onDismissRunAdvisory={setup.dismissRunAdvisory}
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
        recoveryEvidence={<EvidenceLine ruleId="recovery-windows" />}
        decaySuggestions={setup.decaySuggestions}
        onAcceptDecay={setup.acceptDecay}
        onDismissDecay={setup.dismissDecay}
        decayEvidence={(suggestion) => <EvidenceLine ruleId={suggestion.evidenceId} />}
      />

      {/* The workout exactly as the active screen will perform it. */}
      <PlannedExerciseList plan={setup.plan} trainingPhase={setup.trainingPhase} />

      <div className="flex items-center gap-4">
        <LocationToggle
          location={setup.location}
          onChange={setup.setLocation}
          className="flex-1"
        />
        <WarmUpToggle enabled={setup.warmUps} onChange={setup.setWarmUps} />
      </div>

      <TimeEstimate minutes={estimateWorkoutMinutes(setup.plan, setup.trainingPhase)} />

      {/* Everything optional. */}
      <div className="border-t border-border">
        <SetupExpander title="How are you feeling?">
          <ReadinessCheck
            sleepHours={setup.sleepHours}
            stressLevel={setup.stressLevel}
            onSleepChange={setup.setSleepHours}
            onStressChange={setup.setStressLevel}
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
          <Button
            className="h-14 w-full rounded-2xl text-lg font-extrabold tracking-wide"
            onClick={handleStart}
            disabled={setup.isStarting}
          >
            {setup.isStarting ? "Starting..." : "START WORKOUT"}
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
