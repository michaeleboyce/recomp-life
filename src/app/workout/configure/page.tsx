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
import { applyPreferences } from "@/lib/exercisePreferences";
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { generateWarmUpSets } from "@/lib/warmups";
import { evaluateRunImpact, workoutHasLowerBody } from "@/lib/runRecovery";
import { calculateRecoveryStatus } from "@/lib/recovery";
import { getExerciseDecaySuggestions } from "@/lib/weightDecay";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, AlertTriangle, X, Circle } from "lucide-react";
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
  | "warnings"
  | "technique"
  | "bodycheck"
  | "preview";

const STEP_ORDER: Step[] = [
  "location",
  "readiness",
  "warnings",
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
  if (tier === "T3") return state.t3Weight;
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
          <Circle className="h-3 w-3 fill-current" /> High conf.
        </Badge>
      );
    case "medium":
      return (
        <Badge className="bg-yellow-600 text-white border-0">
          <Circle className="h-3 w-3 fill-current" /> Medium conf.
        </Badge>
      );
    case "low":
      return (
        <Badge className="bg-red-600 text-white border-0">
          <Circle className="h-3 w-3 fill-current" /> Low conf.
        </Badge>
      );
  }
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "fits":
      return <Badge variant="secondary"><Check className="h-3 w-3" /> Fits</Badge>;
    case "borderline":
      return (
        <Badge className="bg-yellow-600/20 text-yellow-400 border-0">
          <AlertTriangle className="h-3 w-3" /> Borderline
        </Badge>
      );
    case "exceeds":
      return <Badge variant="destructive"><X className="h-3 w-3" /> Exceeds</Badge>;
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
          <div className="h-6 w-40 rounded bg-muted animate-pulse" />
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

  // Recent runs (last 24h) for run fatigue advisory
  const recentRuns = useLiveQuery(() => {
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    return db.runs
      .where("date")
      .above(oneDayAgo)
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

  // Warning step state
  const [runAdvisoryDismissed, setRunAdvisoryDismissed] = useState(false);
  const [recoveryChoice, setRecoveryChoice] = useState<"proceed" | "reduce" | null>(null);

  // Loading state for start button
  const [isStarting, setIsStarting] = useState(false);

  // User overrides for alternative exercise selections
  const [exerciseOverrides, setExerciseOverrides] = useState<Record<string, string>>({});

  // Accepted/dismissed decay suggestions
  const [dismissedDecays, setDismissedDecays] = useState<Set<string>>(new Set());

  // ─── Derived data ─────────────────────────────────────────────────────

  const equipment: EquipmentProfile =
    userProfile?.settings?.equipment ?? DEFAULT_EQUIPMENT;

  const trainingPhase: TrainingPhase =
    userProfile?.settings?.trainingPhase ?? DEFAULT_PHASE;

  // Weight decay suggestions for stale lifts
  const decaySuggestions = useMemo(() => {
    if (!template) return [];
    return getExerciseDecaySuggestions(
      template.exercises,
      liftStates,
      trainingPhase,
      new Date()
    );
  }, [template, liftStates, trainingPhase]);

  const handleAcceptDecay = useCallback(
    async (exerciseId: string, tier: "T1" | "T2", newWeight: number) => {
      const ls = liftStates.find((l) => l.exerciseId === exerciseId);
      if (!ls) return;
      const update =
        tier === "T1" ? { t1Weight: newWeight } : { t2Weight: newWeight };
      await db.liftStates.put({ ...ls, ...update, synced: false });
    },
    [liftStates]
  );

  const handleDismissDecay = useCallback((exerciseId: string, tier: string) => {
    setDismissedDecays((prev) => new Set(prev).add(`${exerciseId}-${tier}`));
  }, []);

  const t1Type = template ? getT1ExerciseType(template) : null;

  const exercisePreferences = userProfile?.settings?.exercisePreferences;

  // Run fatigue advisory
  const runAdvisory = useMemo(() => {
    if (!template || recentRuns.length === 0) return null;
    const hasLower = workoutHasLowerBody(templateId);
    const advisory = evaluateRunImpact(recentRuns, hasLower, new Date(), trainingPhase);
    if (advisory.level === "none") return null;
    return advisory;
  }, [template, recentRuns, templateId, trainingPhase]);

  // Recovery warning: check if any lift in today's workout was trained <48h ago
  const recoveryWarnings = useMemo(() => {
    if (!template || liftStates.length === 0) return [];
    const now = new Date();
    const warnings: { exerciseName: string; hoursAgo: number }[] = [];

    for (const tmplEx of template.exercises) {
      const ls = liftStates.find((l) => l.exerciseId === tmplEx.exerciseId);
      if (!ls) continue;

      const lastTrained = ls.t1LastWorkoutDate || ls.t2LastWorkoutDate;
      if (!lastTrained) continue;

      // Use the most recent of t1 and t2 dates
      let mostRecent = new Date(lastTrained);
      if (ls.t1LastWorkoutDate && ls.t2LastWorkoutDate) {
        const t1 = new Date(ls.t1LastWorkoutDate);
        const t2 = new Date(ls.t2LastWorkoutDate);
        mostRecent = t1.getTime() >= t2.getTime() ? t1 : t2;
      }

      const hoursSince = (now.getTime() - mostRecent.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 48) {
        const exercise = EXERCISES[tmplEx.exerciseId];
        warnings.push({
          exerciseName: exercise?.name ?? tmplEx.exerciseId,
          hoursAgo: Math.round(hoursSince),
        });
      }
    }
    return warnings;
  }, [template, liftStates]);
  const accessoryRecommendations = useMemo(
    () => applyPreferences(ACCESSORY_RECOMMENDATIONS[templateId] ?? [], exercisePreferences),
    [templateId, exercisePreferences]
  );

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

  // ─── Apply user overrides for alternative exercises ────────────────────

  const effectiveAdaptations = useMemo(() => {
    return exerciseAdaptations.map((ea) => {
      if (!ea?.adaptation || ea.adaptation.alternatives.length === 0) return ea;

      const overrideId = exerciseOverrides[ea.templateExercise.exerciseId];
      if (!overrideId) return ea;

      const selectedAlt = ea.adaptation.alternatives.find(
        (alt) => alt.exercise.id === overrideId
      );
      if (!selectedAlt) return ea;

      const newStatus = selectedAlt.weight <= equipment.maxDumbbellWeight
        ? 'fits' as const
        : 'exceeds' as const;

      return {
        ...ea,
        adaptation: {
          ...ea.adaptation,
          adaptedExercise: selectedAlt.exercise,
          adaptedWeight: selectedAlt.weight,
          adaptationStatus: newStatus,
          confidenceLevel: ea.adaptation.confidenceLevel,
        },
      };
    });
  }, [exerciseAdaptations, exerciseOverrides, equipment]);

  // ─── Warm-up sets for preview ─────────────────────────────────────────

  const warmUpSetsMap = useMemo(() => {
    if (!warmUps) return new Map<string, WarmUpSet[]>();
    const map = new Map<string, WarmUpSet[]>();

    effectiveAdaptations.forEach((ea) => {
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
  }, [warmUps, effectiveAdaptations, location, equipment]);

  // ─── Navigation ───────────────────────────────────────────────────────

  const goToStep = useCallback(
    (step: Step) => {
      if (step === "warnings" && !runAdvisory && recoveryWarnings.length === 0) {
        // Skip to technique (or bodycheck if no technique)
        if (!t1Type) {
          setCurrentStep("bodycheck");
        } else {
          setCurrentStep("technique");
        }
        return;
      }
      if (step === "technique" && !t1Type) {
        setCurrentStep("bodycheck");
        return;
      }
      setCurrentStep(step);
    },
    [t1Type, runAdvisory, recoveryWarnings.length]
  );

  const handleLocationNext = async () => {
    // Save location preference
    if (userProfile) {
      try {
        const updatedSettings = { ...userProfile.settings, defaultLocation: location };
        await db.userProfile.update(userProfile.id, { settings: updatedSettings, synced: false });
      } catch {
        // Non-critical — continue even if save fails
      }
    }
    goToStep("readiness");
  };

  const handleReadinessNext = () => {
    // Skip warnings step if there are no warnings to show
    if (!runAdvisory && recoveryWarnings.length === 0) {
      goToStep("technique");
    } else {
      goToStep("warnings");
    }
  };
  const handleReadinessSkip = () => {
    if (!runAdvisory && recoveryWarnings.length === 0) {
      goToStep("technique");
    } else {
      goToStep("warnings");
    }
  };

  const handleWarningsNext = () => goToStep("technique");

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
          clientId: uuidv4(),
          sessionId,
          sleepHours,
          stressLevel,
          date: new Date(),
          synced: false,
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
        <div className="h-6 w-40 rounded bg-muted animate-pulse" />
      </div>
    );
  }

  const templateName = `${templateId} \u2014 ${getTemplateFriendlyName(templateId)}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-5 pt-5 pb-28 space-y-4">
        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-foreground/80 transition-all duration-300 ease-out"
            style={{
              width: `${getProgressPercent(currentStep)}%`,
              boxShadow: "0 0 8px oklch(0.85 0 0 / 0.3)",
            }}
          />
        </div>

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

        {/* ─── Step 1.6: Pre-Workout Warnings ────────────────────── */}
        {currentStep === "warnings" && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Pre-Workout Warnings</CardTitle>
                  <CardDescription>Review before continuing</CardDescription>
                </div>
                <Badge variant="outline">{location === "home" ? "Home" : "Gym"}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Run Fatigue Advisory */}
              {runAdvisory && !runAdvisoryDismissed && runAdvisory.level === "advisory" && (
                <div className="rounded-xl border border-amber-700 bg-amber-900/30 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-amber-400">Run Fatigue Advisory</p>
                      <p className="text-sm text-muted-foreground">{runAdvisory.message}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setRunAdvisoryDismissed(true)}>
                      Proceed
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRunAdvisoryDismissed(true)}>
                      Add warm-ups
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRunAdvisoryDismissed(true)}>
                      Reduce 10%
                    </Button>
                  </div>
                </div>
              )}

              {runAdvisory && !runAdvisoryDismissed && runAdvisory.level === "strong_rest" && (
                <div className="rounded-xl border border-red-700 bg-red-900/30 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-red-400">Strong Rest Recommended</p>
                      <p className="text-sm text-muted-foreground">{runAdvisory.message}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setRunAdvisoryDismissed(true)}>
                      Proceed anyway
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => router.push("/")}>
                      Rest today
                    </Button>
                  </div>
                </div>
              )}

              {/* Recovery Warning */}
              {recoveryWarnings.length > 0 && (
                <div className="rounded-xl border border-amber-700 bg-amber-900/30 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                    <div className="space-y-2">
                      {recoveryWarnings.map((w) => (
                        <p key={w.exerciseName} className="text-sm text-muted-foreground">
                          You trained {w.exerciseName} <span className="font-mono tabular-nums">{w.hoursAgo}h</span> ago.
                        </p>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                      <input
                        type="radio"
                        name="recoveryChoice"
                        checked={recoveryChoice === "proceed"}
                        onChange={() => setRecoveryChoice("proceed")}
                        className="accent-foreground"
                      />
                      Proceed as planned
                    </label>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                      <input
                        type="radio"
                        name="recoveryChoice"
                        checked={recoveryChoice === "reduce"}
                        onChange={() => setRecoveryChoice("reduce")}
                        className="accent-foreground"
                      />
                      Reduce T1 weight by 10%
                    </label>
                  </div>
                </div>
              )}

              {/* No warnings remaining */}
              {((!runAdvisory || runAdvisoryDismissed) && recoveryWarnings.length === 0) && (
                <p className="text-sm text-muted-foreground">No warnings to show.</p>
              )}

              <Button
                className="w-full"
                onClick={handleWarningsNext}
                disabled={
                  (runAdvisory && !runAdvisoryDismissed) ||
                  (recoveryWarnings.length > 0 && recoveryChoice === null)
                }
              >
                Continue {"\u2192"} Technique
              </Button>
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
              {/* Weight Decay Suggestions */}
              {decaySuggestions
                .filter((s) => !dismissedDecays.has(`${s.exerciseId}-${s.tier}`))
                .map((suggestion) => {
                  const exerciseName =
                    EXERCISES[suggestion.exerciseId]?.name ?? suggestion.exerciseId;
                  const weeks = Math.floor(suggestion.daysSinceLastWorkout / 7);

                  return (
                    <div
                      key={`decay-${suggestion.exerciseId}-${suggestion.tier}`}
                      className="rounded-xl border border-amber-700 bg-amber-900/30 p-4 space-y-3"
                    >
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-amber-400">
                          {exerciseName} ({suggestion.tier})
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {weeks} week{weeks !== 1 ? "s" : ""} since last session.
                          Suggest reducing from{" "}
                          <span className="font-mono tabular-nums">{suggestion.currentWeight}</span> to{" "}
                          <span className="font-mono tabular-nums">{suggestion.suggestedWeight} lbs</span>.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() =>
                            handleAcceptDecay(
                              suggestion.exerciseId,
                              suggestion.tier,
                              suggestion.suggestedWeight
                            )
                          }
                        >
                          Accept ({suggestion.suggestedWeight} lbs)
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleDismissDecay(suggestion.exerciseId, suggestion.tier)
                          }
                        >
                          Keep {suggestion.currentWeight} lbs
                        </Button>
                      </div>
                    </div>
                  );
                })}

              {/* Exercise list */}
              {effectiveAdaptations.map((ea) => {
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
                      {exercise.name} <span className="font-mono tabular-nums">{setsLabel}</span>
                      {weight > 0 && <span className="font-mono tabular-nums"> @ {weight} lbs</span>}
                    </div>

                    {/* Adapted exercise (home only) */}
                    {location === "home" && adaptation && (
                      <div className="pl-4 space-y-1">
                        {adaptation.adaptationStatus !== "no_substitute" ? (
                          <>
                            <div className="text-sm">
                              {"\u2192"} {adaptation.adaptedExercise.name} <span className="font-mono tabular-nums">@{" "}
                              {adaptation.adaptedWeight} lbs</span>
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
                            {/* Alternative picker */}
                            {adaptation.alternatives.length > 1 && (
                              <div className="mt-2 space-y-1">
                                <p className="text-xs text-muted-foreground">Alternatives:</p>
                                {adaptation.alternatives.map((alt) => (
                                  <button
                                    key={alt.exercise.id}
                                    type="button"
                                    className={`w-full text-left text-xs px-2 py-1.5 rounded border transition-all ${
                                      adaptation.adaptedExercise.id === alt.exercise.id
                                        ? "border-foreground/40 bg-foreground/5"
                                        : "border-border hover:border-foreground/20"
                                    }`}
                                    onClick={() =>
                                      setExerciseOverrides((prev) => ({
                                        ...prev,
                                        [templateExercise.exerciseId]: alt.exercise.id,
                                      }))
                                    }
                                  >
                                    <span className="font-medium">{alt.exercise.name}</span>{" "}
                                    <span className="font-mono tabular-nums">@ {alt.weight} {alt.exercise.grip === "per_hand" ? "lbs/hand" : "lbs"}</span>
                                    {alt.pros && (
                                      <span className="text-muted-foreground ml-1">— {alt.pros}</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
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
                              className="text-xs text-muted-foreground font-mono tabular-nums"
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
                exercisePreferences={exercisePreferences}
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
