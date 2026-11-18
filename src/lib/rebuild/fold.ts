import { toRecentE1RMSeries } from "@/lib/e1rm";
import type { StrengthSet } from "@/lib/strength";
import { strengthSetOf } from "@/lib/workout/strength";
import { computeCompletion } from "@/lib/workout/completeWorkout";
import { planFromLifts, type LiftResolution } from "@/lib/workout/liftResolution";
import { applyPlanEdits } from "@/lib/workout/planEdits";
import { T1_STAGE_SCHEME, T2_STAGE_SCHEME } from "@/lib/workout/prescription";
import { resolveSavedSession } from "@/lib/workout/savedSession";
import {
  isVariantTier,
  plannedWeightAfterHandSet,
  seedVariantState,
  BACK_TO_PLAN_NOTE,
  variantKey,
  withHandSetWeight,
  withoutGymPasses,
} from "@/lib/workout/variant";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  AdjustableField,
  LiftAdjustment,
  LiftState,
  PrescribedEntry,
  ProgressionOutcome,
  SetLog,
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
    recentAvgRepsInReserve: [],
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

/** The lift-state fields of a tier that a home exercise's adjustment reads. */
const VARIANT_FIELDS = {
  T1: { weight: "t1Weight", stage: "t1Stage", failCount: "t1FailCount", lastResetWeight: "t1LastResetWeight" },
  T2: { weight: "t2Weight", stage: "t2Stage", failCount: "t2FailCount", lastResetWeight: "t2LastResetWeight" },
  T3: { weight: "t3Weight" },
} as const satisfies Record<VariantState["tier"], Partial<Record<string, AdjustableField>>>;

/** Per tier of a barbell lift: its weight, the plan's weight beside a hand-set one, and when it was set (E7). */
const LIFT_PLAN_FIELDS = {
  T1: { weight: "t1Weight", planned: "t1PlannedWeight", byHand: "t1SetByHandAt" },
  T2: { weight: "t2Weight", planned: "t2PlannedWeight", byHand: "t2SetByHandAt" },
  T3: { weight: "t3Weight", planned: "t3PlannedWeight", byHand: null },
} as const satisfies Record<
  "T1" | "T2" | "T3",
  { weight: AdjustableField; planned: keyof LiftState; byHand: keyof LiftState | null }
>;

/**
 * `state` after a session that logged sets of the lift itself (not a home exercise for
 * it) at some tiers: a weight set by hand at those tiers has been lifted, so it is the
 * plan's now (`t1PlannedWeight` etc. cleared, as `withoutHandOverride` does at home).
 */
export function withoutLoggedOverrides(state: LiftState, sets: readonly SetLog[]): LiftState {
  let out = state;
  for (const [tier, fields] of Object.entries(LIFT_PLAN_FIELDS)) {
    if (out[fields.planned] === undefined) continue;
    const logged = sets.some(
      (set) => set.exerciseId === state.exerciseId && set.tier === tier && !set.substituteExerciseId
    );
    if (!logged) continue;
    out = { ...out };
    delete out[fields.planned];
  }
  return out;
}

/**
 * When an adjustment set a weight by hand: a manual change or starting weights, with a
 * real date (seeded starting weights are dated at the epoch, before everything, and
 * carry no date). Null for a time-off reduction, an import, or no date.
 */
function handSetDate(adjustment: LiftAdjustment): Date | null {
  if (adjustment.source !== "manual" && adjustment.source !== "start") return null;
  const at = new Date(adjustment.at);
  return Number.isFinite(at.getTime()) && at.getTime() > 0 ? at : null;
}

/**
 * An adjustment sets the fields it lists to absolute values; nothing else moves.
 *
 * One for a home exercise (`variant`) sets that exercise's own state from its tier's
 * fields (t1Weight is its weight at T1, and so on), creating the state from its seed
 * when it has none; a weight set by hand replaces the steps gym passes had earned for
 * it, and the exercise becomes the lift's current one at that tier (the others of the
 * lift and tier stop being current), so the plan uses the confirmed weight and a
 * conversion flip cannot pass it by. One for the barbell lift that sets a tier's weight replaces the steps home passes
 * had earned at that tier: the weight is the user's, re-entry adds nothing to it. A
 * weight set by hand (`handSetDate`) records when (`setByHandAt`, `t1SetByHandAt`,
 * `t2SetByHandAt`), so re-entry leaves it as it is until the other location is trained.
 * A manual one for a home exercise also keeps the plan's weight from before
 * (`withHandSetWeight`: `plannedWeight`, until the exercise is logged or put back on
 * the plan's weight). A manual one for the barbell lift does the same per tier
 * (`t1PlannedWeight`, `t2PlannedWeight`, `t3PlannedWeight`; E7): the weight before the
 * first change since the tier was logged, cleared (with `t1SetByHandAt` /
 * `t2SetByHandAt`) when the weight is put back, and by `withoutLoggedOverrides` when
 * the tier is logged.
 */
function applyAdjustment(
  states: Map<string, LiftState>,
  variants: Map<string, VariantState>,
  adjustment: LiftAdjustment,
  settings: UserSettings
): void {
  const set = adjustment.set ?? {};
  const target = adjustment.variant;
  const byHand = handSetDate(adjustment);
  if (target) {
    if (!isVariantTier(target.tier)) return;
    const tier = target.tier;
    const id = variantKey(adjustment.exerciseId, target.exerciseId, tier);
    const current =
      variants.get(id) ??
      seedVariantState({
        liftId: adjustment.exerciseId,
        exerciseId: target.exerciseId,
        tier,
        liftState: states.get(adjustment.exerciseId),
        equipment: settings.equipment,
      });
    const fields: Partial<Record<"weight" | "stage" | "failCount" | "lastResetWeight", AdjustableField>> =
      VARIANT_FIELDS[tier];
    let next: VariantState = { ...current };
    for (const [key, field] of Object.entries(fields) as Array<[keyof typeof fields, AdjustableField]>) {
      const value = set[field];
      if (value !== undefined) next = { ...next, [key]: value };
    }
    if (fields.weight && set[fields.weight] !== undefined) {
      next = { ...withoutGymPasses(next), current: true };
      if (byHand && adjustment.source === "manual") {
        next = withHandSetWeight(current, next, byHand, adjustment.note === BACK_TO_PLAN_NOTE);
      } else if (byHand) {
        next = { ...next, setByHandAt: byHand };
      }
      for (const other of variants.values()) {
        if (other.id !== id && other.liftId === adjustment.exerciseId && other.tier === tier && other.current) {
          variants.set(other.id, { ...other, current: false });
        }
      }
    }
    variants.set(id, next);
    return;
  }

  const current = states.get(adjustment.exerciseId) ?? emptyLiftState(adjustment.exerciseId);
  const next: Record<string, unknown> = { ...current };
  for (const field of ADJUSTABLE_FIELDS) {
    const value = set[field];
    if (value !== undefined) next[field] = value;
  }
  if (byHand && set.t1Weight !== undefined) next.t1SetByHandAt = byHand;
  if (byHand && set.t2Weight !== undefined) next.t2SetByHandAt = byHand;
  if (byHand && adjustment.source === "manual") {
    const backToPlan = adjustment.note === BACK_TO_PLAN_NOTE;
    for (const fields of Object.values(LIFT_PLAN_FIELDS)) {
      const value = set[fields.weight];
      if (value === undefined) continue;
      const planned = plannedWeightAfterHandSet(
        { weight: current[fields.weight], plannedWeight: current[fields.planned] },
        value,
        backToPlan
      );
      if (planned === undefined) {
        delete next[fields.planned];
        if (fields.byHand) delete next[fields.byHand];
      } else {
        next[fields.planned] = planned;
      }
    }
  }
  states.set(adjustment.exerciseId, next as unknown as LiftState);

  for (const [tier, fields] of Object.entries(VARIANT_FIELDS)) {
    if (set[fields.weight] === undefined) continue;
    for (const variant of variants.values()) {
      if (variant.liftId === adjustment.exerciseId && variant.tier === tier && variant.passesSinceGym > 0) {
        variants.set(variant.id, { ...variant, passesSinceGym: 0 });
      }
    }
  }
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
 * Rule 4: the session's stored prescription is a fact, read as resume reads it
 * (`resolveSavedSession`). The running lift states take its weights and stages, and
 * each stored home exercise its weight and scheme, before the session is evaluated. A
 * variant that already exists keeps the anchored values (in `variants`); one the session
 * used for the first time is anchored only in the returned map, and is stored only if
 * the session performed it, as the live app stores it. The lifts are what the session
 * did: the exercise, weight and scheme it recorded. A home exercise the session did first
 * is seeded for the day the session started: its own history counts back from
 * `session.startedAt` (`resolveSavedSession`), as `completeWorkout` seeds it, never from
 * the newest set.
 *
 * `restore` puts back, for every lift the session was prescribed but logged no set of
 * (taken out of the plan, or simply not done), the lift's running state and the running
 * states of its home exercises at that tier: the session did nothing to that lift. The
 * prescription says how to read the session; it is not a result. Without this, a
 * correction to an earlier session would be undone by a later one that never did the
 * lift, because that one stored the old prescription. A re-entry weight the session
 * never lifted is likewise still owed, and is worked out again next time.
 */
function readSavedSession(
  states: Map<string, LiftState>,
  variants: Map<string, VariantState>,
  session: WorkoutSession,
  settings: UserSettings,
  strengthSets: readonly StrengthSet[]
): { forSession: Map<string, VariantState>; lifts: LiftResolution[]; restore: () => void } {
  const saved = resolveSavedSession({
    session,
    template: WORKOUT_TEMPLATES[session.templateId],
    liftStates: [...states.values()],
    variantStates: [...variants.values()],
    equipment: settings.equipment,
    strengthSets,
  });
  const anchoredLifts = new Map(saved.liftStates.map((state) => [state.exerciseId, state]));
  const lifted = new Set(
    (session.sets ?? []).filter((set) => set.tier !== "warmup").map((set) => set.exerciseId)
  );
  const undo: Array<() => void> = [];
  for (const entry of session.prescribed ?? []) {
    const running = states.get(entry.exerciseId);
    if (!lifted.has(entry.exerciseId)) {
      const homeStates = [...variants.values()].filter(
        (v) => v.liftId === entry.exerciseId && v.tier === entry.tier
      );
      undo.push(() => {
        if (running) states.set(entry.exerciseId, running);
        for (const v of homeStates) variants.set(v.id, v);
      });
    }
    if (running) states.set(entry.exerciseId, anchoredLifts.get(entry.exerciseId)!);
  }
  const forSession = new Map(variants);
  for (const [id, anchored] of saved.anchored) {
    if (variants.has(id)) variants.set(id, anchored);
    forSession.set(id, anchored);
  }
  return { forSession, lifts: saved.lifts, restore: () => undo.forEach((put) => put()) };
}

/** Fresh, normalised copies sorted by exerciseId, safe to hand out. */
function sortedStates(states: Map<string, LiftState>): LiftState[] {
  return [...states.values()]
    .map((state) => ({
      ...normalise(state),
      recentE1RMs: [...(state.recentE1RMs ?? [])],
      recentAvgRepsInReserve: [...(state.recentAvgRepsInReserve ?? [])],
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
  // Strength evidence of the sessions folded so far, with when each was finished: the
  // plan of a session saw the sets of those finished before it started (H3).
  const foldedSets: StrengthSet[] = [];
  const foldedEnds: Array<{ completedAt: number; setCount: number }> = [];

  for (const session of completed) {
    const startedAt = timeOf(session.startedAt);
    const completedAt = timeOf(session.completedAt!);
    let known = foldedEnds.length;
    while (known > 0 && foldedEnds[known - 1].completedAt > startedAt) known -= 1;
    const strengthSets = foldedSets.slice(0, known > 0 ? foldedEnds[known - 1].setCount : 0);

    // Rule 4: adjustments first, then the stored prescription on top.
    while (
      nextAdjustment < adjustments.length &&
      timeOf(adjustments[nextAdjustment].at) <= startedAt
    ) {
      applyAdjustment(states, variants, adjustments[nextAdjustment], input.settings);
      nextAdjustment += 1;
    }
    const settings = settingsFor(input.settings, session);
    const saved = readSavedSession(states, variants, session, settings, strengthSets);
    before.set(session.id, sortedStates(states));

    let sessionOutcomes: ProgressionOutcome[] = [];
    let sessionVariantOutcomes: VariantOutcome[] = [];
    const template = WORKOUT_TEMPLATES[session.templateId];
    if (template) {
      // Rule 5: the plan of what the session did, as resume plans it.
      const anchored = [...states.values()];
      const variantStates = [...saved.forSession.values()];
      const program = planFromLifts(saved.lifts, {
        location: session.location,
        equipment: settings.equipment,
        includeWarmUps: false,
        selectedAccessories: session.selectedAccessories ?? [],
      });
      const plan = session.planEdits?.length ? applyPlanEdits(program, session.planEdits) : program;

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
        strengthSets,
      });
      for (const update of completion.liftStateUpdates) {
        states.set(update.exerciseId, normalise(update));
      }
      for (const update of completion.variantStateUpdates) variants.set(update.id, update);
      sessionOutcomes = completion.outcomes;
      sessionVariantOutcomes = completion.variantOutcomes;
    }
    // What the session was prescribed but never lifted goes back to where it stood.
    saved.restore();

    // A weight set by hand at a tier the session logged is the plan's from now on (E7).
    for (const [id, state] of states) {
      const cleared = withoutLoggedOverrides(state, session.sets ?? []);
      if (cleared !== state) states.set(id, cleared);
    }

    outcomes.set(session.id, sessionOutcomes);
    snapshots.set(session.id, sortedStates(states));
    variantOutcomes.set(session.id, sessionVariantOutcomes);
    variantSnapshots.set(session.id, sortedVariants(variants));
    for (const set of session.sets ?? []) foldedSets.push(strengthSetOf(set, session.id));
    foldedEnds.push({ completedAt, setCount: foldedSets.length });
  }

  // Rule 8.
  for (; nextAdjustment < adjustments.length; nextAdjustment += 1) {
    applyAdjustment(states, variants, adjustments[nextAdjustment], input.settings);
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
