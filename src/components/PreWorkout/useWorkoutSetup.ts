"use client";

import { useCallback, useMemo, useState } from "react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import {
  useLiftStates,
  useNextWorkout,
  usePainEntries,
  useRuns,
  useSettings,
} from "@/hooks";
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { updateSettings } from "@/lib/data/records";
import { saveLiftState, startWorkout } from "@/lib/data/workouts";
import { EXERCISES } from "@/lib/exercises";
import { applyPreferences } from "@/lib/exercisePreferences";
import { RECOVERY_HOURS } from "@/lib/recovery";
import { evaluateRunImpact, workoutHasLowerBody } from "@/lib/runRecovery";
import { getExerciseDecaySuggestions } from "@/lib/weightDecay";
import { buildWorkoutPlan, getPrescription, substituteModification } from "@/lib/workout";
import { ACCESSORY_RECOMMENDATIONS, WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  ExerciseAdaptation,
  LiftState,
  SleepHours,
  StressLevel,
  WorkoutLocation,
  WorkoutModification,
  WorkoutTemplateExercise,
} from "@/types";

const HOUR_MS = 60 * 60 * 1000;
const PAIN_WINDOW_MS = 7 * 24 * HOUR_MS;
const RUN_WINDOW_MS = 24 * HOUR_MS;
const NO_LIFT_STATES: LiftState[] = [];

export interface RecoveryWarning {
  exerciseName: string;
  hoursAgo: number;
}

/** A template exercise at home: what it becomes and what else could replace it. */
export interface HomeAdaptation {
  templateExercise: WorkoutTemplateExercise;
  /** Prescribed barbell weight. */
  weight: number;
  adaptation: ExerciseAdaptation;
  /** The substitute the plan will actually use; undefined when nothing is substituted. */
  chosenExerciseId: string | undefined;
}

function recoveryWarningsFor(
  exercises: WorkoutTemplateExercise[],
  liftStates: LiftState[],
  now: Date
): RecoveryWarning[] {
  const warnings: RecoveryWarning[] = [];
  for (const templateEx of exercises) {
    const ls = liftStates.find((l) => l.exerciseId === templateEx.exerciseId);
    if (!ls) continue;
    const dates = [ls.t1LastWorkoutDate, ls.t2LastWorkoutDate]
      .filter((d): d is Date => d != null)
      .map((d) => new Date(d).getTime());
    if (dates.length === 0) continue;

    const hoursSince = (now.getTime() - Math.max(...dates)) / HOUR_MS;
    if (hoursSince < RECOVERY_HOURS.ready) {
      warnings.push({
        exerciseName: EXERCISES[templateEx.exerciseId]?.name ?? templateEx.exerciseId,
        hoursAgo: Math.round(hoursSince),
      });
    }
  }
  return warnings;
}

/**
 * Everything behind the "ready?" screen. The preview comes from `buildWorkoutPlan`,
 * the same function the active workout uses, and a chosen home substitute is saved
 * on the session, so what is shown here is what gets performed.
 *
 * `requestedTemplateId` (from the URL) wins when it names a real template; otherwise
 * the next workout in the rotation, counting completed workouts only.
 */
export function useWorkoutSetup(requestedTemplateId?: string | null) {
  const loadedSettings = useSettings();
  const loadedLiftStates = useLiftStates();
  const nextWorkout = useNextWorkout();
  const painEntries = usePainEntries();
  const runs = useRuns();

  const settings = loadedSettings ?? DEFAULT_USER_PROFILE.settings;
  const liftStates = loadedLiftStates ?? NO_LIFT_STATES;
  const { equipment, trainingPhase, exercisePreferences } = settings;

  const templateId =
    requestedTemplateId && WORKOUT_TEMPLATES[requestedTemplateId]
      ? requestedTemplateId
      : nextWorkout?.templateId;
  const template = templateId ? WORKOUT_TEMPLATES[templateId] : undefined;

  // The profile supplies the defaults; a choice made on this screen overrides them.
  const [locationChoice, setLocationChoice] = useState<WorkoutLocation | null>(null);
  const [warmUpsChoice, setWarmUpsChoice] = useState<boolean | null>(null);
  const location = locationChoice ?? settings.defaultLocation ?? "gym";
  const warmUps = warmUpsChoice ?? settings.showWarmUps ?? true;

  const [sleepHours, setSleepHours] = useState<SleepHours | null>(null);
  const [stressLevel, setStressLevel] = useState<StressLevel | null>(null);
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [runAdvisoryDismissed, setRunAdvisoryDismissed] = useState(false);
  const [recoveryChoice, setRecoveryChoice] = useState<"proceed" | "reduce" | null>(null);
  const [dismissedDecays, setDismissedDecays] = useState<ReadonlySet<string>>(new Set());
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLocation = useCallback((next: WorkoutLocation) => {
    setLocationChoice(next);
    // Remembered as the default for next time.
    updateSettings({ defaultLocation: next }).catch(() => {});
  }, []);

  /** Exactly what the active workout will perform. */
  const plan = useMemo(
    () =>
      template
        ? buildWorkoutPlan({
            template,
            liftStates,
            location,
            equipment,
            includeWarmUps: warmUps,
            selectedAccessories,
            overrides,
          })
        : [],
    [template, liftStates, location, equipment, warmUps, selectedAccessories, overrides]
  );

  const homeAdaptations = useMemo<HomeAdaptation[]>(() => {
    if (!template || location !== "home") return [];
    return template.exercises.flatMap((templateExercise) => {
      const exercise = EXERCISES[templateExercise.exerciseId];
      if (!exercise) return [];
      const weight = getPrescription(
        templateExercise,
        liftStates.find((ls) => ls.exerciseId === templateExercise.exerciseId)
      ).weight;
      const adaptation = adaptExerciseForHome(
        exercise,
        weight,
        equipment,
        exercise.dumbbellAlternative ? EXERCISES[exercise.dumbbellAlternative] : undefined
      );
      const entry = plan.find(
        (e) =>
          !e.isWarmUp &&
          e.exerciseId === templateExercise.exerciseId &&
          e.tier === templateExercise.tier
      );
      return [
        { templateExercise, weight, adaptation, chosenExerciseId: entry?.substituteExerciseId },
      ];
    });
  }, [template, location, liftStates, equipment, plan]);

  const chooseSubstitute = useCallback((templateExerciseId: string, substituteId: string) => {
    setOverrides((prev) => ({ ...prev, [templateExerciseId]: substituteId }));
  }, []);

  const runAdvisory = useMemo(() => {
    if (!templateId || !runs || runAdvisoryDismissed) return null;
    const now = new Date();
    const recent = runs.filter((r) => now.getTime() - new Date(r.date).getTime() < RUN_WINDOW_MS);
    if (recent.length === 0) return null;
    const advisory = evaluateRunImpact(
      recent,
      workoutHasLowerBody(templateId),
      now,
      trainingPhase
    );
    return advisory.level === "none" ? null : advisory;
  }, [templateId, runs, runAdvisoryDismissed, trainingPhase]);

  const dismissRunAdvisory = useCallback(() => setRunAdvisoryDismissed(true), []);

  const recoveryWarnings = useMemo(
    () => (template ? recoveryWarningsFor(template.exercises, liftStates, new Date()) : []),
    [template, liftStates]
  );

  const decaySuggestions = useMemo(() => {
    if (!template) return [];
    return getExerciseDecaySuggestions(
      template.exercises,
      liftStates,
      trainingPhase,
      new Date()
    ).filter((s) => !dismissedDecays.has(`${s.exerciseId}-${s.tier}`));
  }, [template, liftStates, trainingPhase, dismissedDecays]);

  const dismissDecay = useCallback((exerciseId: string, tier: string) => {
    setDismissedDecays((prev) => new Set(prev).add(`${exerciseId}-${tier}`));
  }, []);

  /** Lowers the stored working weight to the suggested one. */
  const acceptDecay = useCallback(
    async (exerciseId: string, tier: "T1" | "T2", newWeight: number) => {
      const ls = liftStates.find((l) => l.exerciseId === exerciseId);
      if (!ls) return;
      await saveLiftState({
        ...ls,
        ...(tier === "T1" ? { t1Weight: newWeight } : { t2Weight: newWeight }),
      });
      // Settled: without this the lowered weight would be offered a further cut.
      dismissDecay(exerciseId, tier);
    },
    [liftStates, dismissDecay]
  );

  const recentPainEntries = useMemo(() => {
    const cutoff = Date.now() - PAIN_WINDOW_MS;
    return (painEntries ?? []).filter((entry) => new Date(entry.date).getTime() > cutoff);
  }, [painEntries]);

  const accessoryRecommendations = useMemo(
    () =>
      applyPreferences(
        templateId ? (ACCESSORY_RECOMMENDATIONS[templateId] ?? []) : [],
        exercisePreferences
      ),
    [templateId, exercisePreferences]
  );

  const toggleAccessory = useCallback((exerciseId: string) => {
    setSelectedAccessories((prev) =>
      prev.includes(exerciseId) ? prev.filter((id) => id !== exerciseId) : [...prev, exerciseId]
    );
  }, []);

  const t1ExerciseId = template?.exercises.find((e) => e.tier === "T1")?.exerciseId;
  const techniqueFocus: "squat" | "deadlift" | null =
    t1ExerciseId === "squat" || t1ExerciseId === "deadlift" ? t1ExerciseId : null;

  /** Creates the workout and resolves to its id, or null if it could not be created. */
  const start = useCallback(async (): Promise<string | null> => {
    if (!templateId || isStarting) return null;
    setIsStarting(true);
    setError(null);

    // Only substitutes the user picked, and only where the plan really uses them.
    const modifications: WorkoutModification[] = homeAdaptations.flatMap((item) => {
      const id = item.templateExercise.exerciseId;
      const chosen = item.chosenExerciseId;
      if (!chosen || overrides[id] !== chosen) return [];
      const entry = plan.find((e) => !e.isWarmUp && e.exerciseId === id);
      return [substituteModification(id, chosen, item.weight, entry?.weight ?? item.weight)];
    });

    try {
      return await startWorkout({
        templateId,
        location,
        includeWarmUps: warmUps,
        selectedAccessories,
        modifications,
        readiness: sleepHours && stressLevel ? { sleepHours, stressLevel } : undefined,
      });
    } catch (err) {
      console.error("Failed to start workout:", err);
      setError("The workout could not be started. Try again.");
      setIsStarting(false);
      return null;
    }
  }, [
    templateId,
    isStarting,
    homeAdaptations,
    overrides,
    plan,
    location,
    warmUps,
    selectedAccessories,
    sleepHours,
    stressLevel,
  ]);

  return {
    isLoading:
      loadedSettings === undefined || loadedLiftStates === undefined || templateId === undefined,
    templateId,
    template,
    plan,
    trainingPhase,
    exercisePreferences,
    equipment,
    location,
    setLocation,
    warmUps,
    setWarmUps: setWarmUpsChoice,
    sleepHours,
    setSleepHours,
    stressLevel,
    setStressLevel,
    selectedAccessories,
    toggleAccessory,
    accessoryRecommendations,
    homeAdaptations,
    chooseSubstitute,
    runAdvisory,
    dismissRunAdvisory,
    recoveryWarnings,
    recoveryChoice,
    setRecoveryChoice,
    decaySuggestions,
    acceptDecay,
    dismissDecay,
    recentPainEntries,
    techniqueFocus,
    start,
    isStarting,
    error,
  };
}

export type WorkoutSetup = ReturnType<typeof useWorkoutSetup>;
