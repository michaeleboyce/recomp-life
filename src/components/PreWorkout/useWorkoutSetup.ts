"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import {
  useActivities,
  useCompletedWorkouts,
  useLiftStates,
  useNextWorkout,
  usePainEntries,
  useRuns,
  useSettings,
  useTrainingLocation,
  useLastNightSleep,
} from "@/hooks";
import { ACTIVITY_NOTE_WINDOW_HOURS, evaluateActivityImpact } from "@/lib/activities";
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { recordAdjustment } from "@/lib/data/adjustments";
import { recordCoachEvent, type CoachEventInput } from "@/lib/data/coachEvents";
import { startWorkout } from "@/lib/data/workouts";
import { ACCESSORY_IDS, EXERCISES } from "@/lib/exercises";
import { resolvePreferences, withPreferredAccessories } from "@/lib/exercisePreferences";
import { lastLoggedWeights, type ResolvedFavorite } from "@/lib/favorites";
import { RECOVERY_HOURS } from "@/lib/recovery";
import { evaluateRunImpact, workoutHasLowerBody } from "@/lib/runRecovery";
import { sleepBucket } from "@/lib/health/sleep";
import { getExerciseDecaySuggestions } from "@/lib/weightDecay";
import {
  buildWorkoutPlan,
  getPrescription,
  prescribedFor,
  substituteModification,
} from "@/lib/workout";
import { ACCESSORY_RECOMMENDATIONS, WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { addEdit, removeEdit, schemeEdit, swapEdit, weightEdit } from "./editList";
import { computeImpact } from "./impact";
import { lighterWeight, notesToWrite, queueNote, type PendingNote } from "./setupNotes";
import type {
  ExerciseAdaptation,
  LiftState,
  PlanEdit,
  PrescribedEntry,
  Tier,
  SleepHours,
  StressLevel,
  WorkoutLocation,
  WorkoutModification,
  WorkoutTemplateExercise,
} from "@/types";

const HOUR_MS = 60 * 60 * 1000;
const PAIN_WINDOW_MS = 7 * 24 * HOUR_MS;
const RUN_WINDOW_MS = 24 * HOUR_MS;
const ACTIVITY_WINDOW_MS = ACTIVITY_NOTE_WINDOW_HOURS * HOUR_MS;
const NO_LIFT_STATES: LiftState[] = [];
const NO_EDITS: PlanEdit[] = [];
const NO_PRESCRIBED: PrescribedEntry[] = [];

/** What the user can do about a run advisory. */
export type RunChoice = "proceed" | "extra_warmups" | "reduce_10" | "skip";

/**
 * Notes a choice made about a setup advisory in the coach's log, so it shows in the
 * adjustment log. Never awaited and never throws: the workout matters more than the
 * note. Choices that shape the workout are queued and written by `start`, once the
 * workout exists; only "Skip today" is written when it is made, as no workout follows.
 */
function noteAdvisory(input: CoachEventInput): void {
  recordCoachEvent(input).catch((err) => console.error("Failed to record advisory choice:", err));
}

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
 *
 * `favorite` (a favourite resolved for one of its two modes) fills in the day, the
 * choices and the edits once, when it first arrives; the user can change any of them
 * afterwards. Its location becomes the training location.
 */
export function useWorkoutSetup(
  requestedTemplateId?: string | null,
  favorite?: ResolvedFavorite | null
) {
  const loadedSettings = useSettings();
  const loadedLiftStates = useLiftStates();
  const nextWorkout = useNextWorkout();
  const painEntries = usePainEntries();
  const runs = useRuns();
  const activities = useActivities();
  const completedWorkouts = useCompletedWorkouts();

  const settings = loadedSettings ?? DEFAULT_USER_PROFILE.settings;
  const liftStates = loadedLiftStates ?? NO_LIFT_STATES;
  const { equipment, trainingPhase } = settings;

  // A day picked on this screen wins, then the URL's, then the rotation's next day.
  const [chosenTemplateId, setChosenTemplateId] = useState<string | null>(null);
  const dueTemplateId = nextWorkout?.templateId;
  const templateId =
    chosenTemplateId && WORKOUT_TEMPLATES[chosenTemplateId]
      ? chosenTemplateId
      : requestedTemplateId && WORKOUT_TEMPLATES[requestedTemplateId]
        ? requestedTemplateId
        : dueTemplateId;
  const template = templateId ? WORKOUT_TEMPLATES[templateId] : undefined;
  const setTemplateId = useCallback((next: string) => {
    if (WORKOUT_TEMPLATES[next]) setChosenTemplateId(next);
  }, []);

  // Edits belong to the day they were made on; another day starts from the program.
  const [editState, setEditState] = useState<{ templateId: string | undefined; edits: PlanEdit[] }>(
    { templateId: undefined, edits: [] }
  );
  const edits = editState.templateId === templateId ? editState.edits : NO_EDITS;
  const changeEdits = useCallback(
    (change: (current: PlanEdit[]) => PlanEdit[]) =>
      setEditState((prev) => ({
        templateId,
        edits: change(prev.templateId === templateId ? prev.edits : NO_EDITS),
      })),
    [templateId]
  );
  // An exercise the program does not prescribe starts at the last weight logged for it.
  const lastWeights = useMemo(() => lastLoggedWeights(completedWorkouts ?? []), [completedWorkouts]);
  const swapExercise = useCallback(
    (exerciseId: string, tier: Tier, replacementId: string) =>
      changeEdits((list) => {
        const swapped = swapEdit(list, exerciseId, tier, replacementId);
        const last = lastWeights[replacementId];
        return last == null ? swapped : weightEdit(swapped, replacementId, tier, last);
      }),
    [changeEdits, lastWeights]
  );
  const removeExercise = useCallback(
    (exerciseId: string, tier: Tier) => changeEdits((list) => removeEdit(list, exerciseId, tier)),
    [changeEdits]
  );
  const addExercise = useCallback(
    (exerciseId: string, accessory: { sets: number; reps: number; weight: number; isAMRAP: boolean }) =>
      changeEdits((list) =>
        addEdit(list, exerciseId, {
          ...accessory,
          weight: lastWeights[exerciseId] ?? accessory.weight,
        })
      ),
    [changeEdits, lastWeights]
  );
  const setScheme = useCallback(
    (exerciseId: string, tier: Tier, sets: number, reps: number) =>
      changeEdits((list) => schemeEdit(list, exerciseId, tier, sets, reps)),
    [changeEdits]
  );
  const setWeight = useCallback(
    (exerciseId: string, tier: Tier, weight: number) =>
      changeEdits((list) => weightEdit(list, exerciseId, tier, weight)),
    [changeEdits]
  );
  const resetEdits = useCallback(() => changeEdits(() => NO_EDITS), [changeEdits]);

  // The location is the saved training location, shared with Today and More.
  // A change made here is shown at once and saved as the new default; `pending`
  // only bridges the moment until the saved value comes back from the database.
  const training = useTrainingLocation();
  const saveLocation = training.setLocation;
  const [pending, setPending] = useState<{ value: WorkoutLocation; over: WorkoutLocation } | null>(
    null
  );
  // `?location=` (from Coming up's gym/home preview) is where this workout starts,
  // without saving it as the default; a change made here then takes over as above.
  const urlLocation = useSearchParams()?.get("location");
  const [fromUrl, setFromUrl] = useState<WorkoutLocation | null>(() =>
    urlLocation === "gym" || urlLocation === "home" ? urlLocation : null
  );
  const location =
    pending && pending.over === training.location ? pending.value : (fromUrl ?? training.location);
  // The profile supplies the default; toggling warm-ups here is for this workout only.
  const [warmUpsChoice, setWarmUpsChoice] = useState<boolean | null>(null);
  const warmUps = warmUpsChoice ?? settings.showWarmUps ?? true;

  // Preferences in effect at the chosen location (overall, plus that location's overrides).
  const overallPreferences = settings.exercisePreferences;
  const locationPreferences = settings.exercisePreferencesByLocation;
  const exercisePreferences = useMemo(
    () => resolvePreferences(overallPreferences, locationPreferences, location),
    [overallPreferences, locationPreferences, location]
  );

  // The sleep answer is the user's own choice when they made one, otherwise last
  // night's sleep from Apple Health when there is any.
  const [chosenSleep, setSleepHours] = useState<SleepHours | null>(null);
  const healthSleepMinutes = useLastNightSleep() ?? null;
  const healthSleep = healthSleepMinutes !== null ? sleepBucket(healthSleepMinutes) : null;
  const sleepHours = chosenSleep ?? healthSleep;
  /** True while the answer shown is the one Apple Health gave. */
  const sleepIsFromHealth = healthSleep !== null && sleepHours === healthSleep;
  const [stressLevel, setStressLevel] = useState<StressLevel | null>(null);
  const [selectedAccessories, setSelectedAccessories] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [runAdvisoryDismissed, setRunAdvisoryDismissed] = useState(false);
  const [activityNoteDismissed, setActivityNoteDismissed] = useState(false);
  const [recoveryChoice, setRecoveryChoiceState] = useState<"proceed" | "reduce" | null>(null);
  const [dismissedDecays, setDismissedDecays] = useState<ReadonlySet<string>>(new Set());
  // Advisory choices, written to the coach's log by `start` once the workout exists.
  const [pendingNotes, setPendingNotes] = useState<PendingNote[]>([]);
  const queue = useCallback(
    (note: Omit<PendingNote, "templateId">) => {
      if (!templateId) return;
      setPendingNotes((prev) => queueNote(prev, { ...note, templateId }));
    },
    [templateId]
  );
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fill the setup from a favourite, once per favourite and mode (state adjusted
  // during render, so the first plan shown is already the favourite's).
  const [seededFrom, setSeededFrom] = useState<ResolvedFavorite | null>(null);
  if (favorite && favorite !== seededFrom && WORKOUT_TEMPLATES[favorite.templateId]) {
    setSeededFrom(favorite);
    setChosenTemplateId(favorite.templateId);
    setWarmUpsChoice(favorite.includeWarmUps);
    setSelectedAccessories(favorite.selectedAccessories);
    setOverrides(favorite.overrides);
    setEditState({ templateId: favorite.templateId, edits: favorite.planEdits });
  }
  const favoriteId = seededFrom?.favoriteId;

  const savedLocation = training.location;
  const setLocation = useCallback(
    (next: WorkoutLocation) => {
      setFromUrl(null);
      setPending({ value: next, over: savedLocation });
      saveLocation(next).catch((err) => console.error("Failed to save training location:", err));
    },
    [saveLocation, savedLocation]
  );

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
            edits,
          })
        : [],
    [template, liftStates, location, equipment, warmUps, selectedAccessories, overrides, edits]
  );

  /** What the program prescribes for the day's lifts, before any edit. */
  const prescribed = useMemo(
    () => (template ? prescribedFor(template, liftStates) : NO_PRESCRIBED),
    [template, liftStates]
  );
  /** Per program lift: counts toward progression, logged only, or not done. Empty without edits. */
  const impact = useMemo(() => computeImpact(plan, prescribed, edits), [plan, prescribed, edits]);

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

  const favoriteLocation = seededFrom?.location;
  useEffect(() => {
    if (favoriteLocation) setLocation(favoriteLocation);
    // Only when a favourite is applied: the user may change the location afterwards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seededFrom]);

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

  const t1Entry = plan.find((e) => e.tier === "T1" && !e.isWarmUp);
  /**
   * What an advisory's "reduce" does to today's T1: 10% off, in the steps its
   * equipment moves in. Null when that changes nothing (a light dumbbell at home),
   * and then no reduce is offered.
   */
  const t1Reduction = useMemo(() => {
    if (!t1Entry) return null;
    const to = lighterWeight(t1Entry, equipment);
    return to === null ? null : { exerciseId: t1Entry.exerciseId, from: t1Entry.weight, to };
  }, [t1Entry, equipment]);
  const t1Name = t1Entry
    ? (EXERCISES[t1Entry.substituteExerciseId ?? t1Entry.exerciseId]?.name ?? t1Entry.exerciseId)
    : "";

  /**
   * Lowers today's T1 to `t1Reduction.to` as a plan edit (so, like any lighter lift,
   * it is logged without changing progression) and returns what to log, or null when
   * there is nothing to lower.
   */
  const reduceT1 = useCallback(() => {
    if (!t1Reduction) return null;
    const { exerciseId, from, to } = t1Reduction;
    changeEdits((list) => weightEdit(list, exerciseId, "T1", to));
    return {
      change: `${t1Name} lowered from ${from} to ${to} lbs for today`,
      data: { from, to, exerciseId },
      requires: { exerciseId, tier: "T1" as const, weight: to },
    };
  }, [t1Reduction, t1Name, changeEdits]);

  /**
   * Acts on a run advisory and queues the choice for the log. Extra warm-ups turns
   * warm-ups on; reduce lowers today's T1 (see `reduceT1`); skip leaves it to the
   * caller (who goes back to Today) and is logged at once; proceed changes nothing.
   */
  const chooseRunOption = useCallback(
    (choice: RunChoice) => {
      setRunAdvisoryDismissed(true);
      if (!runAdvisory) return;
      let data: Record<string, number | string | null> = {
        advisory: "run",
        level: runAdvisory.level,
        choice,
      };
      let title = "Run before lifting: carried on as planned";
      let requires: PendingNote["requires"];
      if (choice === "extra_warmups") {
        setWarmUpsChoice(true);
        title = "Run before lifting: added warm-up sets";
      } else if (choice === "reduce_10") {
        const reduced = reduceT1();
        if (!reduced) return;
        title = `Run before lifting: ${reduced.change}`;
        data = { ...data, ...reduced.data };
        requires = reduced.requires;
      } else if (choice === "skip") {
        title = "Run before lifting: skipped today's workout";
      }
      const input: CoachEventInput = {
        kind: choice === "proceed" ? "advisoryDismissed" : "advisoryAccepted",
        title,
        detail: runAdvisory.message,
        ruleId: runAdvisory.evidenceId,
        data,
      };
      // Skipping is the end of it: no workout starts to carry the note.
      if (choice === "skip") noteAdvisory(input);
      else queue({ key: "run", input, requires });
    },
    [runAdvisory, reduceT1, queue]
  );
  /** Carry on as planned (the run advisory's "Proceed"). */
  const dismissRunAdvisory = useCallback(() => chooseRunOption("proceed"), [chooseRunOption]);

  // A hard yoga, cycling, hiking or other session shortly before this workout.
  const activityNote = useMemo(() => {
    if (!templateId || !activities || activityNoteDismissed) return null;
    const now = new Date();
    const recent = activities.filter(
      (a) => now.getTime() - new Date(a.date).getTime() < ACTIVITY_WINDOW_MS
    );
    if (recent.length === 0) return null;
    return evaluateActivityImpact(recent, workoutHasLowerBody(templateId), now);
  }, [templateId, activities, activityNoteDismissed]);
  const dismissActivityNote = useCallback(() => {
    setActivityNoteDismissed(true);
    if (!activityNote) return;
    queue({
      key: "activity",
      input: {
        kind: "advisoryDismissed",
        title: "Hard session before lifting: noted, workout unchanged",
        detail: activityNote.message,
        ruleId: activityNote.evidenceId,
        data: { advisory: "activity" },
      },
    });
  }, [activityNote, queue]);

  const recoveryWarnings = useMemo(
    () => (template ? recoveryWarningsFor(template.exercises, liftStates, new Date()) : []),
    [template, liftStates]
  );

  /**
   * "Trained recently", answered once like the run advisory: proceed keeps the plan;
   * reduce lowers today's T1 the same way the run advisory's reduce does, and is
   * queued for the log.
   */
  const setRecoveryChoice = useCallback(
    (choice: "proceed" | "reduce") => {
      if (choice === "proceed") {
        setRecoveryChoiceState("proceed");
        return;
      }
      const reduced = reduceT1();
      if (!reduced) return;
      setRecoveryChoiceState("reduce");
      queue({
        key: "recovery",
        input: {
          kind: "advisoryAccepted",
          title: `Trained recently: ${reduced.change}`,
          detail: recoveryWarnings
            .map((w) => `${w.exerciseName} was trained ${w.hoursAgo}h ago.`)
            .join(" "),
          ruleId: "recovery-windows",
          data: { advisory: "recovery", choice, ...reduced.data },
        },
        requires: reduced.requires,
      });
    },
    [reduceT1, queue, recoveryWarnings]
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

  const settleDecay = useCallback((exerciseId: string, tier: string) => {
    setDismissedDecays((prev) => new Set(prev).add(`${exerciseId}-${tier}`));
  }, []);

  /** Keeps the weight after time off, and records that the suggestion was turned down. */
  const dismissDecay = useCallback(
    (exerciseId: string, tier: string) => {
      settleDecay(exerciseId, tier);
      const suggestion = decaySuggestions.find((s) => s.exerciseId === exerciseId && s.tier === tier);
      if (!suggestion) return;
      const name = EXERCISES[exerciseId]?.name ?? exerciseId;
      queue({
        key: `decay:${exerciseId}-${tier}`,
        input: {
          kind: "advisoryDismissed",
          title: `Time off: kept ${name} at ${suggestion.currentWeight} lbs`,
          detail: `The app suggested ${suggestion.suggestedWeight} lbs after ${suggestion.daysSinceLastWorkout} days away.`,
          ruleId: suggestion.evidenceId,
          data: {
            advisory: "decay",
            exerciseId,
            tier,
            current: suggestion.currentWeight,
            suggested: suggestion.suggestedWeight,
          },
        },
      });
    },
    [settleDecay, decaySuggestions, queue]
  );

  /** Lowers the stored working weight to the suggested one. */
  const acceptDecay = useCallback(
    async (exerciseId: string, tier: "T1" | "T2", newWeight: number) => {
      const ls = liftStates.find((l) => l.exerciseId === exerciseId);
      if (!ls) return;
      await recordAdjustment({
        exerciseId,
        source: "decay",
        set: tier === "T1" ? { t1Weight: newWeight } : { t2Weight: newWeight },
      });
      // Settled: without this the lowered weight would be offered a further cut. Its
      // own "decay" adjustment is what the log shows, so no coach event is added.
      settleDecay(exerciseId, tier);
    },
    [liftStates, settleDecay]
  );

  const recentPainEntries = useMemo(() => {
    const cutoff = new Date().getTime() - PAIN_WINDOW_MS;
    return (painEntries ?? []).filter((entry) => new Date(entry.date).getTime() > cutoff);
  }, [painEntries]);

  // Every preferred accessory is offered, then the rest of the day's recommendations.
  const accessoryRecommendations = useMemo(
    () =>
      withPreferredAccessories(
        templateId ? (ACCESSORY_RECOMMENDATIONS[templateId] ?? []) : [],
        exercisePreferences,
        ACCESSORY_IDS
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

    let sessionId: string;
    try {
      sessionId = await startWorkout({
        prescribed,
        planEdits: edits,
        favoriteId,
        templateId,
        location,
        includeWarmUps: warmUps,
        selectedAccessories,
        modifications,
        readiness:
          sleepHours && stressLevel
            ? {
                sleepHours,
                stressLevel,
                ...(sleepIsFromHealth && healthSleepMinutes !== null
                  ? { sleepMinutes: healthSleepMinutes, sleepSource: "apple_health" as const }
                  : {}),
              }
            : undefined,
      });
    } catch (err) {
      console.error("Failed to start workout:", err);
      setError("The workout could not be started. Try again.");
      setIsStarting(false);
      return null;
    }
    // The choices made on this screen, now that they belong to a real workout.
    for (const note of notesToWrite(pendingNotes, { sessionId, templateId, edits })) {
      noteAdvisory(note);
    }
    setPendingNotes([]);
    return sessionId;
  }, [
    templateId,
    isStarting,
    pendingNotes,
    homeAdaptations,
    overrides,
    plan,
    location,
    warmUps,
    selectedAccessories,
    sleepHours,
    stressLevel,
    prescribed,
    edits,
    favoriteId,
    sleepIsFromHealth,
    healthSleepMinutes,
  ]);

  return {
    isLoading:
      loadedSettings === undefined || loadedLiftStates === undefined || templateId === undefined,
    templateId,
    setTemplateId,
    dueTemplateId,
    template,
    plan,
    edits,
    prescribed,
    impact,
    favoriteId,
    lastWeights,
    swapExercise,
    removeExercise,
    addExercise,
    setScheme,
    setWeight,
    resetEdits,
    trainingPhase,
    exercisePreferences,
    equipment,
    location,
    setLocation,
    warmUps,
    setWarmUps: setWarmUpsChoice,
    sleepHours,
    setSleepHours,
    /** Minutes asleep last night from Apple Health; null when there is none. */
    healthSleepMinutes,
    stressLevel,
    setStressLevel,
    selectedAccessories,
    toggleAccessory,
    accessoryRecommendations,
    homeAdaptations,
    chooseSubstitute,
    runAdvisory,
    chooseRunOption,
    dismissRunAdvisory,
    /** What "reduce" would do to today's T1; null when it would change nothing. */
    t1Reduction,
    activityNote,
    dismissActivityNote,
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
