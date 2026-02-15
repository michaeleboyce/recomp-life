"use client";

import { Suspense, useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";

import { db } from "@/db/local";
import {
  WORKOUT_TEMPLATES,
  getNextWorkoutId,
  ACCESSORY_RECOMMENDATIONS,
} from "@/lib/workoutTemplates";
import { EXERCISES } from "@/lib/exercises";
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { generateWarmUpSets } from "@/lib/warmups";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";

import { LocationToggle } from "@/components/PreWorkout/LocationToggle";
import { WarmUpToggle } from "@/components/PreWorkout/WarmUpToggle";
import { ReadinessCheck } from "@/components/PreWorkout/ReadinessCheck";
import { TechniqueChecklist } from "@/components/PreWorkout/TechniqueChecklist";
import { AccessoryPicker } from "@/components/PreWorkout/AccessoryPicker";
import { TimeEstimate } from "@/components/PreWorkout/TimeEstimate";

import type {
  WorkoutLocation,
  SleepHours,
  StressLevel,
  WorkoutTemplate,
  LiftState,
  ExerciseAdaptation,
  EquipmentProfile,
  TrainingPhase,
  WarmUpSet,
  PainSorenessEntry,
  BodyRegion,
} from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

type Step =
  | "location"
  | "readiness"
  | "technique"
  | "bodycheck"
  | "preview";

const STEP_ORDER: Step[] = [
  "location",
  "readiness",
  "technique",
  "bodycheck",
  "preview",
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function getProgressPercent(step: Step): number {
  const idx = STEP_ORDER.indexOf(step);
  return ((idx + 1) / STEP_ORDER.length) * 100;
}

function getT1ExerciseType(
  template: WorkoutTemplate
): "squat" | "deadlift" | null {
  const t1 = template.exercises.find((e) => e.tier === "T1");
  if (!t1) return null;
  if (t1.exerciseId === "squat") return "squat";
  if (t1.exerciseId === "deadlift") return "deadlift";
  return null;
}

function getWeightForExercise(
  exerciseId: string,
  tier: "T1" | "T2" | "T3",
  liftStates: LiftState[]
): number {
  const state = liftStates.find((ls) => ls.exerciseId === exerciseId);
  if (!state) return 0;
  if (tier === "T1") return state.t1Weight;
  if (tier === "T2") return state.t2Weight;
  return 0;
}

function getTemplateFriendlyName(templateId: string): string {
  const names: Record<string, string> = {
    A1: "Squat Day",
    B1: "OHP Day",
    A2: "Bench Day",
    B2: "Deadlift Day",
  };
  return names[templateId] ?? templateId;
}

function ConfidenceBadge({ level }: { level: "high" | "medium" | "low" }) {
  switch (level) {
    case "high":
      return (
        <Badge className="bg-green-600 text-white border-0">
          {"\uD83D\uDFE2"} High conf.
        </Badge>
      );
    case "medium":
      return (
        <Badge className="bg-yellow-600 text-white border-0">
          {"\uD83D\uDFE1"} Medium conf.
        </Badge>
      );
    case "low":
      return (
        <Badge className="bg-red-600 text-white border-0">
          {"\uD83D\uDD34"} Low conf.
        </Badge>
      );
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "fits":
      return <Badge variant="secondary">{"\u2705"} Fits</Badge>;
    case "borderline":
      return (
        <Badge className="bg-yellow-600/20 text-yellow-400 border-0">
          {"\u26A0\uFE0F"} Borderline
        </Badge>
      );
    case "exceeds":
      return <Badge variant="destructive">{"\u274C"} Exceeds</Badge>;
    case "no_substitute":
      return <Badge variant="outline">No substitute</Badge>;
    default:
      return null;
  }
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_EQUIPMENT: EquipmentProfile = {
  maxDumbbellWeight: 50,
  dumbbellIncrementLbs: 5,
  hasBench: true,
  hasResistanceBands: false,
  hasPullUpBar: false,
  gymBarbellIncrementLbs: 5,
  availablePlates: [45, 25, 10, 5, 2.5],
  barWeight: 45,
};

const DEFAULT_PHASE: TrainingPhase = {
  mode: "cutting",
};

// ─── Page wrapper (Suspense required for useSearchParams) ───────────────────

export default function ConfigureWorkoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      }
    >
      <ConfigureWorkoutContent />
    </Suspense>
  );
}

// ─── Main content ───────────────────────────────────────────────────────────

function ConfigureWorkoutContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ─── Dexie live queries ───────────────────────────────────────────────

  const userProfile = useLiveQuery(() =>
    db.userProfile.toCollection().first()
  );

  const liftStates = useLiveQuery(() => db.liftStates.toArray()) ?? [];

  const latestWorkout = useLiveQuery(() =>
    db.workouts.orderBy("startedAt").reverse().first()
  );

  const recentPainEntries = useLiveQuery(() => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return db.painEntries
      .where("date")
      .above(sevenDaysAgo)
      .reverse()
      .toArray();
  }) ?? [];

  // ─── Determine the template ───────────────────────────────────────────

  const templateId = useMemo(() => {
    const paramId = searchParams.get("templateId");
    if (paramId && WORKOUT_TEMPLATES[paramId]) return paramId;
    if (latestWorkout?.templateId) {
      return getNextWorkoutId(latestWorkout.templateId);
    }
    return "A1";
  }, [searchParams, latestWorkout]);

  const template = WORKOUT_TEMPLATES[templateId];

  // ─── Step state ───────────────────────────────────────────────────────

  const [currentStep, setCurrentStep] = useState<Step>("location");

  // Step 1: location + warm-ups
  const [location, setLocation] = useState<WorkoutLocation>("gym");
  const [warmUps, setWarmUps] = useState<boolean>(true);

  // Sync from profile once it loads
  const [profileLoaded, setProfileLoaded] = useState(false);
  useEffect(() => {
    if (userProfile && !profileLoaded) {
      setProfileLoaded(true);
      if (userProfile.settings?.defaultLocation) {
        setLocation(userProfile.settings.defaultLocation);
      }
      if (userProfile.settings?.showWarmUps !== undefined) {
        setWarmUps(userProfile.settings.showWarmUps);
      }
    }
  }, [userProfile, profileLoaded]);

  // Step 1.5: readiness
  const [sleepHours, setSleepHours] = useState<SleepHours | null>(null);
  const [stressLevel, setStressLevel] = useState<StressLevel | null>(null);

  // Step 3: accessories
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>([]);

  // Loading state for start button
  const [isStarting, setIsStarting] = useState(false);

  // ─── Derived data ─────────────────────────────────────────────────────

  const equipment: EquipmentProfile =
    userProfile?.settings?.equipment ?? DEFAULT_EQUIPMENT;

  const trainingPhase: TrainingPhase =
    userProfile?.settings?.trainingPhase ?? DEFAULT_PHASE;

  const t1Type = template ? getT1ExerciseType(template) : null;

  const accessoryRecommendations =
    ACCESSORY_RECOMMENDATIONS[templateId] ?? [];

  const exerciseAdaptations = useMemo(() => {
    if (!template) return [];

    return template.exercises
      .map((tmplExercise) => {
        const exercise = EXERCISES[tmplExercise.exerciseId];
        if (!exercise) return null;

        const weight = getWeightForExercise(
          tmplExercise.exerciseId,
          tmplExercise.tier as "T1" | "T2" | "T3",
          liftStates
        );

        if (location === "home") {
          const substituteExercise = exercise.dumbbellAlternative
            ? EXERCISES[exercise.dumbbellAlternative]
            : undefined;

          const adaptation = adaptExerciseForHome(
            exercise,
            weight,
            equipment,
            substituteExercise
          );

          return {
            templateExercise: tmplExercise,
            exercise,
            weight,
            adaptation,
          };
        }

        return {
          templateExercise: tmplExercise,
          exercise,
          weight,
          adaptation: null as ExerciseAdaptation | null,
        };
      })
      .filter(Boolean) as Array<{
      templateExercise: (typeof template.exercises)[number];
      exercise: (typeof EXERCISES)[string];
      weight: number;
      adaptation: ExerciseAdaptation | null;
    }>;
  }, [template, liftStates, location, equipment]);

  // ─── Warm-up sets for preview ─────────────────────────────────────────

  const warmUpSetsMap = useMemo(() => {
    if (!warmUps) return new Map<string, WarmUpSet[]>();
    const map = new Map<string, WarmUpSet[]>();

    exerciseAdaptations.forEach((ea) => {
      if (!ea) return;
      const tier = ea.templateExercise.tier;
      if (tier !== "T1" && tier !== "T2") return;

      let workingWeight = ea.weight;
      if (location === "home" && ea.adaptation) {
        workingWeight = ea.adaptation.adaptedWeight;
      }

      if (workingWeight <= 0) return;

      const sets = generateWarmUpSets(workingWeight, location, equipment);
      map.set(ea.templateExercise.exerciseId, sets);
    });

    return map;
  }, [warmUps, exerciseAdaptations, location, equipment]);

  // ─── Navigation ───────────────────────────────────────────────────────

  const goToStep = useCallback(
    (step: Step) => {
      if (step === "technique" && !t1Type) {
        setCurrentStep("bodycheck");
        return;
      }
      setCurrentStep(step);
    },
    [t1Type]
  );

  const handleLocationNext = async () => {
    // Save location preference
    if (userProfile) {
      try {
        const updatedSettings = { ...userProfile.settings, defaultLocation: location };
        await db.userProfile.update(userProfile.id, { settings: updatedSettings });
      } catch {
        // Non-critical — continue even if save fails
      }
    }
    goToStep("readiness");
  };

  const handleReadinessNext = () => goToStep("technique");
  const handleReadinessSkip = () => goToStep("technique");

  const handleTechniqueNext = () => goToStep("bodycheck");
  const handleTechniqueSkip = () => goToStep("bodycheck");

  const handleBodyCheckNext = () => goToStep("preview");

  const handleToggleAccessory = (exerciseId: string) => {
    setSelectedAccessories((prev) =>
      prev.includes(exerciseId)
        ? prev.filter((id) => id !== exerciseId)
        : [...prev, exerciseId]
    );
  };

  // ─── Start Workout ────────────────────────────────────────────────────

  const handleStartWorkout = async () => {
    if (isStarting) return;
    setIsStarting(true);

    try {
      const sessionId = uuidv4();
      const clientId = uuidv4();

      const session = {
        id: sessionId,
        clientId,
        templateId,
        location,
        startedAt: new Date(),
        completedAt: null,
        totalDurationSeconds: 0,
        includeWarmUps: warmUps,
        selectedAccessories,
        sets: [],
        preWorkoutPainEntries: [],
        modifications: [],
        synced: false,
      };

      await db.workouts.add(session);

      if (sleepHours && stressLevel) {
        await db.readinessLogs.add({
          id: uuidv4(),
          sessionId,
          sleepHours,
          stressLevel,
          date: new Date(),
        });
      }

      router.push(`/workout/active?sessionId=${sessionId}`);
    } catch (error) {
      console.error("Failed to start workout:", error);
      setIsStarting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────

  if (!template) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading workout template...</p>
      </div>
    );
  }

  const templateName = `${templateId} \u2014 ${getTemplateFriendlyName(templateId)}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-6 space-y-4">
        {/* Progress bar */}
        <Progress value={getProgressPercent(currentStep)} className="h-1.5" />

        {/* ─── Step 1: Location + Warm-ups ──────────────────────────── */}
        {currentStep === "location" && (
          <Card>
            <CardHeader>
              <CardTitle>Configure Workout</CardTitle>
              <CardDescription>{templateName}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <LocationToggle location={location} onChange={setLocation} />
              <WarmUpToggle enabled={warmUps} onChange={setWarmUps} />
              <Button className="w-full" onClick={handleLocationNext}>
                NEXT {"\u2192"} Readiness
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ─── Step 1.5: Readiness Check ────────────────────────────── */}
        {currentStep === "readiness" && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-end mb-3">
                <Badge variant="outline">{location === "home" ? "Home" : "Gym"}</Badge>
              </div>
              <ReadinessCheck
                sleepHours={sleepHours}
                stressLevel={stressLevel}
                onSleepChange={setSleepHours}
                onStressChange={setStressLevel}
                onNext={handleReadinessNext}
                onSkip={handleReadinessSkip}
              />
            </CardContent>
          </Card>
        )}

        {/* ─── Step 1.75: Technique Checklist ───────────────────────── */}
        {currentStep === "technique" && t1Type && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-end mb-3">
                <Badge variant="outline">{location === "home" ? "Home" : "Gym"}</Badge>
              </div>
              <TechniqueChecklist
                exerciseType={t1Type}
                onNext={handleTechniqueNext}
                onSkip={handleTechniqueSkip}
              />
            </CardContent>
          </Card>
        )}

        {/* ─── Step 2: Body Check ───────────────────────────────────── */}
        {currentStep === "bodycheck" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Body Check</CardTitle>
                  <CardDescription>Any pain or soreness?</CardDescription>
                </div>
                <Badge variant="outline">{location === "home" ? "Home" : "Gym"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentPainEntries.length > 0 && (
                <div className="space-y-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3">
                  <p className="text-xs font-semibold text-yellow-400">
                    Active entries (last 7 days)
                  </p>
                  {recentPainEntries.slice(0, 3).map((entry) => (
                    <div key={entry.id} className="text-xs text-muted-foreground">
                      {entry.region.replace(/_/g, " ")} — {entry.sensation} (severity {entry.severity}/5)
                    </div>
                  ))}
                  {recentPainEntries.length > 3 && (
                    <p className="text-xs text-muted-foreground">
                      +{recentPainEntries.length - 3} more
                    </p>
                  )}
                </div>
              )}
              <Button className="w-full" onClick={handleBodyCheckNext}>
                I feel fine {"\u2192"} Next
              </Button>
              <Link href="/body-check">
                <Button variant="outline" className="w-full">
                  Log pain/soreness
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* ─── Step 3: Exercise Preview + Accessories ───────────────── */}
        {currentStep === "preview" && (
          <Card>
            <CardHeader>
              <CardTitle>
                {templateName}
                {location === "home" ? " (at HOME)" : " (at GYM)"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Exercise list */}
              {exerciseAdaptations.map((ea) => {
                if (!ea) return null;
                const { templateExercise, exercise, weight, adaptation } = ea;

                const exerciseWarmUpSets = warmUpSetsMap.get(
                  templateExercise.exerciseId
                );

                const setsLabel = templateExercise.isAMRAP
                  ? `${templateExercise.sets}x${templateExercise.reps}+`
                  : `${templateExercise.sets}x${templateExercise.reps}`;

                return (
                  <div
                    key={templateExercise.exerciseId + templateExercise.tier}
                    className="space-y-2"
                  >
                    {/* Original exercise line */}
                    <div className="text-sm font-medium">
                      <span className="text-muted-foreground">
                        {templateExercise.tier}
                      </span>{" "}
                      {exercise.name} {setsLabel}
                      {weight > 0 && ` @ ${weight} lbs`}
                    </div>

                    {/* Adapted exercise (home only) */}
                    {location === "home" && adaptation && (
                      <div className="pl-4 space-y-1">
                        {adaptation.adaptationStatus !== "no_substitute" ? (
                          <>
                            <div className="text-sm">
                              {"\u2192"} {adaptation.adaptedExercise.name} @{" "}
                              {adaptation.adaptedWeight} lbs
                              {adaptation.adaptedExercise.grip === "per_hand" &&
                                "/hand"}
                            </div>
                            <div className="flex gap-2 flex-wrap">
                              <StatusBadge
                                status={adaptation.adaptationStatus}
                              />
                              <ConfidenceBadge
                                level={adaptation.confidenceLevel}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            No home substitute available
                          </div>
                        )}
                      </div>
                    )}

                    {/* Warm-up sets */}
                    {warmUps &&
                      exerciseWarmUpSets &&
                      exerciseWarmUpSets.length > 0 && (
                        <div className="pl-4">
                          <p className="text-xs text-muted-foreground mb-1">
                            Warm-up:
                          </p>
                          {exerciseWarmUpSets.map((ws, i) => (
                            <p
                              key={i}
                              className="text-xs text-muted-foreground"
                            >
                              {ws.label}: {ws.weight} lbs x {ws.reps}
                            </p>
                          ))}
                        </div>
                      )}
                  </div>
                );
              })}

              <Separator />

              {/* Accessories */}
              <AccessoryPicker
                recommendations={accessoryRecommendations}
                selectedAccessories={selectedAccessories}
                onToggle={handleToggleAccessory}
                trainingPhase={trainingPhase}
                location={location}
              />

              <Separator />

              {/* Time estimate */}
              <TimeEstimate accessoryCount={selectedAccessories.length} />

              {/* Start button */}
              <Button
                className="w-full h-12 text-lg font-bold"
                onClick={handleStartWorkout}
                disabled={isStarting}
              >
                {isStarting ? "Starting..." : "START WORKOUT"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
