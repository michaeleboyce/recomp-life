import { toRecentE1RMSeries } from "@/lib/e1rm";
import { buildWorkoutPlan, overridesFromSession } from "@/lib/workout/buildPlan";
import { computeCompletion } from "@/lib/workout/completeWorkout";
import { T1_STAGE_SCHEME, T2_STAGE_SCHEME } from "@/lib/workout/prescription";
import { anchorVariant, isVariantTier, seedVariantState, variantKey } from "@/lib/workout/variant";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  AdjustableField,
  LiftAdjustment,
  LiftState,
  PrescribedEntry,
  ProgressionOutcome,
  T1Stage,
  T2Stage,
  UserSettings,
  VariantOutcome,
  VariantState,
  WorkoutSession,
} from "@/types";
import { e1rmsForWorkout, sortE1RMs, timeOf } from "./e1rm";
import type { RebuildInput, RebuildResult } from "./types";

/** Stages in cascade order: the index is how many fails deep a stage is. */
const T1_STAGES = Object.keys(T1_STAGE_SCHEME) as T1Stage[];
const T2_STAGES = Object.keys(T2_STAGE_SCHEME) as T2Stage[];

const ADJUSTABLE_FIELDS: readonly AdjustableField[] = [
  "t1Weight",
  "t1Stage",
  "t1FailCount",
  "t1LastResetWeight",
  "t2Weight",
  "t2Stage",
  "t2FailCount",
  "t2LastResetWeight",
  "t3Weight",
];

/** A lift nothing has happened to yet: weights 0, first stages, no history. */
export function emptyLiftState(exerciseId: string): LiftState {
  return {
    exerciseId,
    clientId: exerciseId,
    t1Weight: 0,
    t1Stage: "5x3",
    t1FailCount: 0,
    t2Weight: 0,
    t2Stage: "3x10",
    t2FailCount: 0,
    t3Weight: 0,
    t1LastResetWeight: null,
    t2LastResetWeight: null,
    t1LastWorkoutDate: null,
    t2LastWorkoutDate: null,
    deloadActive: false,
    deloadSessionsRemaining: 0,
    preDeloadT1Weight: null,
    preDeloadT2Weight: null,
    t2LoadDropCount: 0,
    recentE1RMs: [],
    recentAvgRPEs: [],
    recentAMRAPReps: [],
    synced: true,
  };
}

/** Every lift that is a T1, T2 or T3 in some workout template, sorted. */
export function programLiftIds(): string[] {
  const ids = new Set<string>();
  for (const template of Object.values(WORKOUT_TEMPLATES)) {
    for (const ex of template.exercises) {
      if (ex.tier === "T1" || ex.tier === "T2" || ex.tier === "T3") ids.add(ex.exerciseId);
    }
  }
  return [...ids].sort();
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Derived rows are local-only and keyed by lift. */
function normalise(state: LiftState): LiftState {
  return { ...state, clientId: state.exerciseId, synced: true };
}

/** An adjustment sets the fields it lists to absolute values; nothing else moves. */
function applyAdjustment(states: Map<string, LiftState>, adjustment: LiftAdjustment): void {
  const current = states.get(adjustment.exerciseId) ?? emptyLiftState(adjustment.exerciseId);
  const next: Record<string, unknown> = { ...current };
  for (const field of ADJUSTABLE_FIELDS) {
    const value = adjustment.set?.[field];
    if (value !== undefined) next[field] = value;
  }
  states.set(adjustment.exerciseId, next as unknown as LiftState);
}

function stageFromReps<S extends string>(
  scheme: Record<S, { sets: number; reps: number }>,
  reps: number
): S | undefined {
  return (Object.keys(scheme) as S[]).find((stage) => scheme[stage].reps === reps);
}

/**
 * Rule 4: the session's stored prescription is a fact, so the running state takes its
 * weight and stage before the session is evaluated.
 *
 * Fail count and last-reset weight when the anchored stage differs from the running
 * one: `evaluateT1Progression` / `evaluateT2Progression` only ever move the fail count
 * together with the stage (0 at the first stage, +1 per stage down, 0 again on a pass
 * or a reset), so the fail count becomes the anchored stage's position in the cascade
 * (5x3 / 3x10 = 0, 6x2 / 3x8 = 1, 10x1 / 3x6 = 2). When the stage is unchanged the
 * running fail count is kept, whatever the weight. The last-reset weight stays as the
 * running state has it: a prescription says nothing about past resets, and progression
 * only writes that field (on a reset), it never reads it.
 *
 * A stored entry without `stage` gets the stage whose reps match, else the running one.
 */
export function anchorToPrescription(state: LiftState, entry: PrescribedEntry): LiftState {
  if (entry.tier === "T1") {
    const stage =
      entry.stage && T1_STAGES.includes(entry.stage as T1Stage)
        ? (entry.stage as T1Stage)
        : (stageFromReps(T1_STAGE_SCHEME, entry.reps) ?? state.t1Stage);
    return {
      ...state,
      t1Weight: entry.weight,
      t1Stage: stage,
      t1FailCount: stage === state.t1Stage ? state.t1FailCount : T1_STAGES.indexOf(stage),
    };
  }
  if (entry.tier === "T2") {
    const stage =
      entry.stage && T2_STAGES.includes(entry.stage as T2Stage)
        ? (entry.stage as T2Stage)
        : (stageFromReps(T2_STAGE_SCHEME, entry.reps) ?? state.t2Stage);
    return {
      ...state,
      t2Weight: entry.weight,
      t2Stage: stage,
      t2FailCount: stage === state.t2Stage ? state.t2FailCount : T2_STAGES.indexOf(stage),
    };
  }
  if (entry.tier === "T3") return { ...state, t3Weight: entry.weight };
  return state;
}

/**
 * Current settings with the session's stored completion context laid over them. The
 * heaviest dumbbell is the one stored with the session; a session finished before it
 * was stored is rebuilt with the current setting.
 */
export function settingsFor(settings: UserSettings, session: WorkoutSession): UserSettings {
  const context = session.completionContext;
  if (!context) return settings;
  return {
    ...settings,
    trainingPhase: { ...settings.trainingPhase, mode: context.phaseMode },
    equipment: {
      ...settings.equipment,
      gymBarbellIncrementLbs: context.gymBarbellIncrementLbs,
      dumbbellIncrementLbs: context.dumbbellIncrementLbs,
      ...(context.maxDumbbellWeight != null
        ? { maxDumbbellWeight: context.maxDumbbellWeight }
        : {}),
    },
  };
}

/** Fresh copies sorted by id, safe to hand out. */
function sortedVariants(variants: Map<string, VariantState>): VariantState[] {
  return [...variants.values()]
    .map((v) => ({ ...v, recentLastSetReps: [...v.recentLastSetReps], seed: { ...v.seed } }))
    .sort((a, b) => compareStrings(a.id, b.id));
}

/**
 * Rule 4 for home exercises: a session that stored a home prescription for a lift takes
 * it as a fact, so the variant takes the stored weight and scheme before the session is
 * evaluated. A variant that already exists keeps the anchored values (in `variants`); one
 * the session would use for the first time is anchored only in the returned map, and is
 * stored only if the session performed it, as the live app stores it.
 */
function anchorHomePrescriptions(
  variants: Map<string, VariantState>,
  states: Map<string, LiftState>,
  session: WorkoutSession,
  settings: UserSettings
): Map<string, VariantState> {
  const forSession = new Map(variants);
  const template = WORKOUT_TEMPLATES[session.templateId];
  for (const entry of session.prescribed ?? []) {
    if (!entry.home || !isVariantTier(entry.tier)) continue;
    const tier = entry.tier;
    const id = variantKey(entry.exerciseId, entry.home.exerciseId, tier);
    const existing = variants.get(id);
    const going =
      existing ??
      seedVariantState({
        liftId: entry.exerciseId,
        exerciseId: entry.home.exerciseId,
        tier,
        liftState: states.get(entry.exerciseId),
        equipment: settings.equipment,
      });
    const slot = template?.exercises.find(
      (ex) => ex.exerciseId === entry.exerciseId && ex.tier === tier
    );
    const anchored = anchorVariant(going, entry.home, slot ? { sets: slot.sets, reps: slot.reps } : undefined);
    if (existing) variants.set(id, anchored);
    forSession.set(id, anchored);
  }
  return forSession;
}

/** Fresh, normalised copies sorted by exerciseId, safe to hand out. */
function sortedStates(states: Map<string, LiftState>): LiftState[] {
  return [...states.values()]
    .map((state) => ({
      ...normalise(state),
      recentE1RMs: [...(state.recentE1RMs ?? [])],
      recentAvgRPEs: [...(state.recentAvgRPEs ?? [])],
      recentAMRAPReps: [...(state.recentAMRAPReps ?? [])],
    }))
    .sort((a, b) => compareStrings(a.exerciseId, b.exerciseId));
}

/**
 * Lift states and e1RM rows computed from the log alone. Pure and deterministic: the
 * fold of "Engine rules" 1 to 9 in docs/plans/2026-11-12-edit-rebuild-plan.md.
 */
export function rebuildDerived(input: RebuildInput): RebuildResult {
  // Rule 1.
  const workouts = input.workouts.filter((w) => w.deletedAt == null);
  const adjustments = input.adjustments
    .filter((a) => a.deletedAt == null)
    .sort((a, b) => timeOf(a.at) - timeOf(b.at) || compareStrings(a.id, b.id));

  // Rule 7: e1RM rows come from every non-deleted workout, finished or not.
  const e1rms = sortE1RMs(workouts.flatMap(e1rmsForWorkout));

  // Rule 2: `start` adjustments are ordinary adjustments applied in date order below.
  const states = new Map<string, LiftState>();
  for (const id of programLiftIds()) states.set(id, emptyLiftState(id));
  for (const adjustment of adjustments) {
    if (!states.has(adjustment.exerciseId)) {
      states.set(adjustment.exerciseId, emptyLiftState(adjustment.exerciseId));
    }
  }

  // Rule 3.
  const completed = workouts
    .filter((w) => w.completedAt != null)
    .sort(
      (a, b) =>
        timeOf(a.completedAt!) - timeOf(b.completedAt!) ||
        timeOf(a.startedAt) - timeOf(b.startedAt) ||
        compareStrings(a.id, b.id)
    );

  const snapshots = new Map<string, LiftState[]>();
  const before = new Map<string, LiftState[]>();
  const outcomes = new Map<string, ProgressionOutcome[]>();
  // Home exercises: one state per lift, exercise performed and tier, folded alongside.
  const variants = new Map<string, VariantState>();
  const variantSnapshots = new Map<string, VariantState[]>();
  const variantOutcomes = new Map<string, VariantOutcome[]>();
  let nextAdjustment = 0;

  for (const session of completed) {
    const startedAt = timeOf(session.startedAt);
    const completedAt = timeOf(session.completedAt!);

    // Rule 4: adjustments first, then the stored prescription on top.
    while (
      nextAdjustment < adjustments.length &&
      timeOf(adjustments[nextAdjustment].at) <= startedAt
    ) {
      applyAdjustment(states, adjustments[nextAdjustment]);
      nextAdjustment += 1;
    }
    for (const entry of session.prescribed ?? []) {
      const state = states.get(entry.exerciseId);
      if (state) states.set(entry.exerciseId, anchorToPrescription(state, entry));
    }
    const settings = settingsFor(input.settings, session);
    const sessionVariants = anchorHomePrescriptions(variants, states, session, settings);
    before.set(session.id, sortedStates(states));

    let sessionOutcomes: ProgressionOutcome[] = [];
    let sessionVariantOutcomes: VariantOutcome[] = [];
    const template = WORKOUT_TEMPLATES[session.templateId];
    if (template) {
      // Rule 5.
      const anchored = [...states.values()];
      const variantStates = [...sessionVariants.values()];
      const plan = buildWorkoutPlan({
        template,
        liftStates: anchored,
        location: session.location,
        equipment: settings.equipment,
        includeWarmUps: false,
        selectedAccessories: session.selectedAccessories ?? [],
        overrides: overridesFromSession(session),
        edits: session.planEdits,
        variantStates,
      });

      // Rule 6. The series is what the live app reads at finish: every row that existed
      // by then, plus this workout's own rows (a late set is dated after `completedAt`).
      const known = e1rms.filter(
        (row) => row.workoutSessionId === session.id || timeOf(row.date) <= completedAt
      );
      const recentE1RMsByExercise: Record<string, number[]> = {};
      for (const ex of template.exercises) {
        if (ex.tier !== "T1" && ex.tier !== "T2") continue;
        recentE1RMsByExercise[ex.exerciseId] = toRecentE1RMSeries(
          known.filter((row) => row.exerciseId === ex.exerciseId)
        );
      }

      const completion = computeCompletion({
        session,
        plan,
        sets: session.sets ?? [],
        liftStates: anchored,
        settings,
        recentE1RMsByExercise,
        currentExerciseIndex: plan.length,
        workoutStartTime: new Date(session.startedAt),
        now: new Date(session.completedAt!),
        variantStates,
      });
      for (const update of completion.liftStateUpdates) {
        states.set(update.exerciseId, normalise(update));
      }
      for (const update of completion.variantStateUpdates) variants.set(update.id, update);
      sessionOutcomes = completion.outcomes;
      sessionVariantOutcomes = completion.variantOutcomes;
    }

    outcomes.set(session.id, sessionOutcomes);
    snapshots.set(session.id, sortedStates(states));
    variantOutcomes.set(session.id, sessionVariantOutcomes);
    variantSnapshots.set(session.id, sortedVariants(variants));
  }

  // Rule 8.
  for (; nextAdjustment < adjustments.length; nextAdjustment += 1) {
    applyAdjustment(states, adjustments[nextAdjustment]);
  }

  return {
    liftStates: sortedStates(states),
    e1rms,
    snapshots,
    before,
    outcomes,
    variantStates: sortedVariants(variants),
    variantSnapshots,
    variantOutcomes,
  };
}
