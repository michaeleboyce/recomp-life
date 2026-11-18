import { sessionPaceCorrection, type PaceSession } from "@/lib/forecast/sessionLength";
import type { StrengthSet } from "@/lib/strength";
import { applySteps } from "@/lib/trace/replay";
import { change, num, stageWords, step } from "@/lib/trace/text";
import { workoutDisplayName } from "@/lib/workoutNames";
import { getNextWorkoutId } from "@/lib/workoutTemplates";
import type {
  DecisionTrace,
  EquipmentProfile,
  LiftState,
  NextSetPlan,
  PlannedSet,
  ProgressionOutcome,
  ProgressionOutcomeKind,
  SetLog,
  Tier,
  TraceStep,
  UserSettings,
  VariantOutcome,
  VariantState,
  WorkoutLocation,
  WorkoutSession,
  WorkoutTemplate,
} from "@/types";
import type { AccessoryPlan, AccessorySource } from "./accessoryPlan";
import { buildWorkoutPlan, describeNextWorkout } from "./buildPlan";
import { computeCompletion } from "./completeWorkout";
import { createSetLog } from "./logSet";
import { performedSetPlanKey } from "./nextSetPlans";
import { resolveNextWorkout } from "./nextWorkout";
import { planWorkoutStart, type WorkoutStartPlan } from "./startPlan";
import type { WorkoutExerciseState, WorkoutPlan } from "./types";

export interface UpcomingEntry {
  exerciseId: string;
  /** The home substitute actually performed, when there is one. */
  substituteExerciseId?: string;
  tier: Tier;
  weight: number;
  sets: number;
  reps: number;
  isAMRAP: boolean;
  /**
   * True when this weight or stage assumes an earlier projected workout was
   * completed as prescribed (that lift's tier was advanced by the projection).
   */
  assumed: boolean;
}

export interface UpcomingWorkout {
  templateId: string;
  template: WorkoutTemplate;
  /**
   * The full plan, warm-ups included when asked for, and with `accessoriesNow` the
   * accessories that fit in the session length, so its length is the one Ready plans.
   */
  plan: WorkoutPlan;
  /** Working entries only: no warm-ups, no accessories. */
  entries: UpcomingEntry[];
  /** With `accessoriesNow`: the accessories planned and the session length they were kept to; else null. */
  accessories: AccessoryPlan | null;
  /** False for the next workout (today's real plan); true for every later one. */
  projected: boolean;
}

export interface ProjectUpcomingInput {
  /**
   * The finished workouts: the rotation, and the lifter's pace the session length is
   * measured with (`sessionPaceCorrection`, as the lengths shown are).
   */
  completedWorkouts: (Pick<WorkoutSession, "templateId" | "startedAt" | "completedAt"> & Partial<PaceSession>)[];
  templates: Record<string, WorkoutTemplate>;
  liftStates: LiftState[];
  location: WorkoutLocation;
  equipment: EquipmentProfile;
  includeWarmUps: boolean;
  count: number;
  /** Supplies the training phase for the completion step; `equipment` above wins. */
  settings: UserSettings;
  /** Timestamp given to every simulated workout, so the result is deterministic. */
  now: Date;
  /** The home exercises' states; at home each lift is planned from its own. */
  variantStates?: VariantState[];
  /** Every logged set as strength evidence: seeds home exercises never used (H3). */
  strengthSets?: readonly StrengthSet[];
  /**
   * Resolve the states for a first session back at `location` once, before the first
   * workout (`resolveReentry`, H6), as `describeNextWorkout` does with `reentry`; the
   * projected workouts then follow from those states.
   */
  reentry?: boolean;
  /**
   * Next-session set plans (`UserSettings.nextSetPlans`, E6): each applies to the first
   * coming workout with that exercise performed at that tier, and is used up there.
   */
  nextSetPlans?: Readonly<Record<string, NextSetPlan>>;
  /**
   * Plan each workout's accessories as the start would (`planAccessories` from
   * `settings` and `strengthSets`, chosen for this calendar day and kept to the session
   * length `settings.sessionMinutes`) and add them to `plan`. Left out, no accessories.
   * It is also the date planned for: a first home weight's own history counts back from
   * it (`seedVariantWeight`); left out, from the newest set.
   */
  accessoriesNow?: Date;
}

/** `plans` without those `plan` uses (its working entries' exercise performed and tier). */
function withoutPlansUsedBy(
  plans: Readonly<Record<string, NextSetPlan>> | undefined,
  plan: WorkoutPlan
): Record<string, NextSetPlan> | undefined {
  if (!plans) return undefined;
  const used = new Set(plan.filter((e) => !e.isWarmUp).map(performedSetPlanKey));
  return Object.fromEntries(Object.entries(plans).filter(([key]) => !used.has(key)));
}

export interface SimulateCompletedWorkoutInput {
  template: WorkoutTemplate;
  plan: WorkoutPlan;
  liftStates: LiftState[];
  settings: UserSettings;
  location: WorkoutLocation;
  now: Date;
  /** The home exercises' states going in. */
  variantStates?: VariantState[];
}

/**
 * The full lift-state list after `plan` is performed with every set at exactly its
 * target reps (AMRAP sets too: no extra reps are assumed), run through the same
 * `computeCompletion` that finishing a real workout uses. Unchanged lifts are
 * included. Warm-ups and accessories are not logged: neither changes lift state.
 */
export function simulateCompletedWorkout(input: SimulateCompletedWorkoutInput): LiftState[] {
  return simulateCompletedWorkoutStates(input).liftStates;
}

/**
 * `simulateCompletedWorkout` with the home exercises' states too: at home the plan's
 * home exercises progress, not the lift states.
 */
export function simulateCompletedWorkoutStates(input: SimulateCompletedWorkoutInput): {
  liftStates: LiftState[];
  variantStates: VariantState[];
} {
  const { liftStates, variantStates } = simulateWithOutcomes(input);
  return { liftStates, variantStates };
}

/** The states after the simulated session, with what the program rules did to each lift. */
function simulateWithOutcomes(input: SimulateCompletedWorkoutInput): {
  liftStates: LiftState[];
  variantStates: VariantState[];
  outcomes: ProgressionOutcome[];
  variantOutcomes: VariantOutcome[];
} {
  const { template, plan, liftStates, settings, location, now } = input;
  const variantStates = input.variantStates ?? [];
  const sets: SetLog[] = [];
  for (const entry of plan) {
    if (entry.isWarmUp || entry.tier === "accessory") continue;
    for (let done = 0; done < entry.targetSets; done++) {
      const id = `simulated-${template.id}-${entry.exerciseId}-${entry.tier}-${done + 1}`;
      sets.push(
        createSetLog({
          exercise: { ...entry, completedSets: done },
          actualReps: entry.targetReps,
          repsInReserve: null,
          location,
          autoRegulated: false,
          now,
          id,
          clientId: id,
        })
      );
    }
  }

  const session: WorkoutSession = {
    id: `simulated-${template.id}`,
    clientId: `simulated-${template.id}`,
    templateId: template.id,
    location,
    startedAt: now,
    completedAt: null,
    totalDurationSeconds: 0,
    includeWarmUps: false,
    selectedAccessories: [],
    sets: [],
    preWorkoutPainEntries: [],
    modifications: [],
    synced: false,
  };

  const { liftStateUpdates, variantStateUpdates, outcomes, variantOutcomes } = computeCompletion({
    session,
    plan,
    sets,
    liftStates,
    settings,
    recentE1RMsByExercise: {},
    currentExerciseIndex: plan.length,
    workoutStartTime: null,
    now,
    variantStates,
  });
  const updated = new Map(liftStateUpdates.map((ls) => [ls.exerciseId, ls]));
  const variants = new Map(variantStates.map((v) => [v.id, v]));
  for (const update of variantStateUpdates) variants.set(update.id, update);
  return {
    liftStates: liftStates.map((ls) => updated.get(ls.exerciseId) ?? ls),
    variantStates: [...variants.values()],
    outcomes,
    variantOutcomes,
  };
}


function toEntries(plan: WorkoutPlan, advanced: Set<string>): UpcomingEntry[] {
  return plan
    .filter((e) => !e.isWarmUp && e.tier !== "accessory")
    .map((e) => ({
      exerciseId: e.exerciseId,
      ...(e.substituteExerciseId ? { substituteExerciseId: e.substituteExerciseId } : {}),
      tier: e.tier,
      weight: e.weight,
      sets: e.targetSets,
      reps: e.targetReps,
      isAMRAP: e.isAMRAP,
      assumed: advanced.has(`${e.exerciseId}:${e.tier}`),
    }));
}

/** One workout of the projection, before any accessories, with the states it was planned from. */
interface ProjectedSession {
  templateId: string;
  template: WorkoutTemplate;
  /** The program's plan (warm-ups as asked for, no accessories). */
  plan: WorkoutPlan;
  liftStates: LiftState[];
  variantStates: VariantState[];
  /** The next-session set plans still unused going in. */
  setPlans: Record<string, NextSetPlan> | undefined;
  /** T1 and T2 lifts (`exerciseId:tier`) advanced by the sessions before it. */
  advanced: Set<string>;
}

/** What completing one projected session at its targets did, as the progression code reports it. */
interface SimulatedOutcomes {
  position: number;
  templateId: string;
  outcomes: ProgressionOutcome[];
  variantOutcomes: VariantOutcome[];
}

type ProjectionInput = Omit<ProjectUpcomingInput, "count">;

const planOptionsOf = (input: ProjectionInput) => ({
  location: input.location,
  equipment: input.equipment,
  includeWarmUps: input.includeWarmUps,
  selectedAccessories: [] as string[],
  ...(input.strengthSets ? { strengthSets: input.strengthSets } : {}),
  ...(input.accessoriesNow ? { now: input.accessoriesNow } : {}),
});

/**
 * The first `count` sessions of the projection and what simulating each of them (but the
 * last) did. The first is the next workout exactly as every screen resolves it; each
 * later one is planned from the states after every earlier one is completed at target.
 */
function walkProjection(
  input: ProjectionInput,
  count: number
): { sessions: ProjectedSession[]; simulated: SimulatedOutcomes[] } {
  const { completedWorkouts, templates, location, equipment, includeWarmUps, now } = input;
  const settings: UserSettings = { ...input.settings, equipment };
  const planOptions = planOptionsOf(input);
  // The first is the next workout exactly as every screen resolves it. Re-entry is
  // worked out once, for every lift, from the real states: the simulated sessions after
  // it carry its weights on, and their made-up dates must not trigger it again.
  const first = input.reentry
    ? resolveNextWorkout({
        completedWorkouts,
        templates,
        liftStates: input.liftStates,
        variantStates: input.variantStates ?? [],
        ...(input.strengthSets ? { strengthSets: input.strengthSets } : {}),
        settings: { equipment, showWarmUps: includeWarmUps, nextSetPlans: input.nextSetPlans },
        location,
        reentry: "everyLift",
        accessories: false,
        ...(input.accessoriesNow ? { now: input.accessoriesNow } : {}),
      })
    : describeNextWorkout({
        completedWorkouts,
        templates,
        liftStates: input.liftStates,
        plan: {
          ...planOptions,
          variantStates: input.variantStates,
          ...(input.nextSetPlans ? { nextSetPlans: input.nextSetPlans } : {}),
        },
      });

  const sessions: ProjectedSession[] = [
    {
      templateId: first.templateId,
      template: first.template,
      plan: first.plan,
      liftStates: first.liftStates ?? input.liftStates,
      variantStates: first.variantStates ?? input.variantStates ?? [],
      setPlans: input.nextSetPlans ? { ...input.nextSetPlans } : undefined,
      advanced: new Set(),
    },
  ];
  const simulated: SimulatedOutcomes[] = [];
  let setPlans = withoutPlansUsedBy(input.nextSetPlans, first.plan);
  while (sessions.length < count) {
    const previous = sessions[sessions.length - 1];
    const done = simulateWithOutcomes({
      template: previous.template,
      plan: previous.plan,
      liftStates: previous.liftStates,
      settings,
      location,
      now,
      variantStates: previous.variantStates,
    });
    simulated.push({
      position: sessions.length - 1,
      templateId: previous.templateId,
      outcomes: done.outcomes,
      variantOutcomes: done.variantOutcomes,
    });
    const advanced = new Set(previous.advanced);
    for (const e of previous.plan) {
      if (!e.isWarmUp && (e.tier === "T1" || e.tier === "T2")) advanced.add(`${e.exerciseId}:${e.tier}`);
    }
    const templateId = getNextWorkoutId(previous.templateId);
    const template = templates[templateId];
    if (!template) throw new Error(`Workout template not found: ${templateId}`);
    const goingIn = setPlans;
    const plan = buildWorkoutPlan({
      ...planOptions,
      template,
      liftStates: done.liftStates,
      variantStates: done.variantStates,
      ...(goingIn ? { nextSetPlans: goingIn } : {}),
    });
    setPlans = withoutPlansUsedBy(goingIn, plan);
    sessions.push({
      templateId,
      template,
      plan,
      liftStates: done.liftStates,
      variantStates: done.variantStates,
      setPlans: goingIn,
      advanced,
    });
  }
  return { sessions, simulated };
}

/** Where the accessories of a coming day are chosen from, as the start chooses them; null without `accessoriesNow`. */
function accessorySourceOf(input: ProjectionInput): AccessorySource | null {
  if (!input.accessoriesNow) return null;
  return {
    settings: { ...input.settings, equipment: input.equipment },
    strengthSets: input.strengthSets ?? [],
    now: input.accessoriesNow,
    pace: sessionPaceCorrection(input.completedWorkouts, input.accessoriesNow, input.settings.trainingPhase),
  };
}

/**
 * The plan shown for the session at `position` of the projection, exactly as the start
 * would plan it (`planWorkoutStart`), with the accessories for `accessoriesNow`'s day:
 * the next workout through `resolveNextWorkout` (re-entry for the day, as Today and
 * Ready), a later one from the states the projection carried to it (no re-entry). The
 * card (`projectUpcomingWorkouts`) and the full view (`describeUpcomingWorkout`) both
 * read it, so they cannot differ.
 */
function shownStartPlan(
  input: ProjectionInput,
  sessions: readonly ProjectedSession[],
  position: number,
  source: AccessorySource | null
): WorkoutStartPlan {
  const target = sessions[position];
  const planOptions = planOptionsOf(input);
  if (position === 0) {
    if (input.reentry) {
      return resolveNextWorkout({
        completedWorkouts: input.completedWorkouts,
        templates: input.templates,
        liftStates: input.liftStates,
        variantStates: input.variantStates ?? [],
        ...(input.strengthSets ? { strengthSets: input.strengthSets } : {}),
        settings: {
          ...input.settings,
          equipment: input.equipment,
          showWarmUps: input.includeWarmUps,
          nextSetPlans: input.nextSetPlans,
        },
        location: input.location,
        accessories: source !== null,
        ...(input.accessoriesNow ? { now: input.accessoriesNow } : {}),
      });
    }
    return planWorkoutStart({
      ...planOptions,
      template: target.template,
      liftStates: input.liftStates,
      variantStates: input.variantStates ?? [],
      ...(input.nextSetPlans ? { nextSetPlans: input.nextSetPlans } : {}),
      reentry: "none",
      ...(source ? { accessories: source } : {}),
    });
  }
  return planWorkoutStart({
    ...planOptions,
    template: target.template,
    liftStates: target.liftStates,
    variantStates: target.variantStates,
    ...(target.setPlans ? { nextSetPlans: target.setPlans } : {}),
    reentry: "none",
    ...(source ? { accessories: source } : {}),
  });
}

/**
 * The next `count` workouts in rotation order. The first is exactly
 * `describeNextWorkout`; each later one assumes every earlier one was completed
 * with every set at its target reps (`simulateCompletedWorkout`). Pure: the given
 * lift states are not changed. A sequence, not a calendar: no dates are forecast.
 * Each shown plan is `shownStartPlan`'s, the one the full view shows; the entries
 * are the program's lifts the projection carried on.
 */
export function projectUpcomingWorkouts(input: ProjectUpcomingInput): UpcomingWorkout[] {
  if (input.count <= 0) return [];
  const { sessions } = walkProjection(input, input.count);
  const source = accessorySourceOf(input);
  return sessions.map((session, index) => {
    const start = shownStartPlan(input, sessions, index, source);
    return {
      templateId: session.templateId,
      template: session.template,
      plan: start.plan,
      accessories: start.accessories,
      entries: toEntries(session.plan, session.advanced),
      projected: index > 0,
    };
  });
}

// ---------------------------------------------------------------------------
// One coming workout in full (W1 to W5)
// ---------------------------------------------------------------------------

/** The furthest position the full view plans: twice round the rotation. */
export const MAX_UPCOMING_POSITION = 7;

/** What completing one earlier projected session at its targets did to a lift at a tier. */
export interface ProjectedChange {
  /** The position of the session assumed done. */
  position: number;
  templateId: string;
  kind: ProgressionOutcomeKind;
  /** The evidence rule the progression code applied. */
  ruleId: string;
  /** The exercise performed: the home exercise at home. */
  exerciseId: string;
  from: { weight: number; reps?: number; stage?: string };
  to: { weight: number; reps?: number; stage?: string };
}

/** One program lift of a coming workout, with what its weight assumes. */
export interface UpcomingLift {
  /** The plan entry, exactly as the start would plan it (per-set weights included). */
  entry: WorkoutExerciseState;
  /** True when an earlier projected session advanced this lift at this tier. */
  assumed: boolean;
  /** Each earlier session of the projection that did this lift at this tier, in order. */
  changes: ProjectedChange[];
  /** The latest of `changes` that moved the weight, reps or stage; null when none did. */
  dependsOn: { position: number; templateId: string } | null;
  /**
   * How the weight was projected, step by step (`applySteps` gives `entry.weight`); null
   * for the next workout, whose why is the live decision trace.
   */
  projection: DecisionTrace | null;
}

export interface UpcomingWorkoutDetail {
  position: number;
  templateId: string;
  template: WorkoutTemplate;
  location: WorkoutLocation;
  /** False for the next workout; true for every later one. */
  projected: boolean;
  /** The day the rotation says is next (position 0's). */
  dueTemplateId: string;
  /** Every entry in order: warm-ups (when asked for), the lifts, the accessories. */
  plan: WorkoutPlan;
  /** The accessories planned and the session length they were kept to; null without `accessoriesNow`. */
  accessories: AccessoryPlan | null;
  /** The program lifts in plan order. */
  lifts: UpcomingLift[];
  /**
   * True when doing this day today, from the states as they are now, plans the same
   * program sets; false when the projection's earlier sessions moved them.
   */
  sameIfDoneToday: boolean;
}

export interface DescribeUpcomingInput extends ProjectionInput {
  /** 0 for the next workout, 1 for the one after, and so on. */
  position: number;
}

/** Each set of an entry as planned: its own weights when it has them, else every set alike. */
export function plannedSetsOf(entry: WorkoutExerciseState): PlannedSet[] {
  if (entry.perSet?.length) return entry.perSet;
  return Array.from({ length: entry.targetSets }, () => ({ weight: entry.weight, reps: entry.targetReps }));
}

const programEntries = (plan: WorkoutPlan) => plan.filter((e) => !e.isWarmUp && e.tier !== "accessory");

function sameProgramSets(a: WorkoutPlan, b: WorkoutPlan): boolean {
  const key = (plan: WorkoutPlan) =>
    JSON.stringify(
      programEntries(plan).map((e) => [e.exerciseId, e.substituteExerciseId ?? null, e.tier, plannedSetsOf(e), e.isAMRAP])
    );
  return key(a) === key(b);
}

/** The earlier sessions' effect on one lift at one tier, read from their outcomes. */
function changesFor(entry: WorkoutExerciseState, simulated: readonly SimulatedOutcomes[]): ProjectedChange[] {
  const changes: ProjectedChange[] = [];
  for (const session of simulated) {
    const base = { position: session.position, templateId: session.templateId };
    if (entry.substituteExerciseId) {
      // At home the home exercise's own weight progresses; the barbell lift holds.
      const variant = session.variantOutcomes.find((o) => o.liftId === entry.exerciseId && o.tier === entry.tier);
      if (!variant) continue;
      changes.push({
        ...base,
        kind: variant.kind,
        ruleId: variant.ruleId,
        exerciseId: variant.exerciseId,
        from: { weight: variant.from.weight, reps: variant.from.reps, ...(variant.from.stage ? { stage: variant.from.stage } : {}) },
        to: { weight: variant.to.weight, reps: variant.to.reps, ...(variant.to.stage ? { stage: variant.to.stage } : {}) },
      });
      continue;
    }
    const outcome = session.outcomes.find((o) => o.exerciseId === entry.exerciseId && o.tier === entry.tier);
    if (!outcome) continue;
    changes.push({
      ...base,
      kind: outcome.kind,
      ruleId: outcome.ruleId,
      exerciseId: outcome.exerciseId,
      from: outcome.from,
      to: outcome.to,
    });
  }
  return changes;
}

const moved = (c: ProjectedChange) =>
  c.to.weight !== c.from.weight || c.to.reps !== c.from.reps || c.to.stage !== c.from.stage;

/** What the program rule did, in plain words, for a projected session done at its targets. */
function outcomeWords(c: ProjectedChange): string {
  if (c.kind === "t3Same") {
    // No number here: the reps needed depend on the size of the next step (t3IncreaseThreshold).
    return "The weight holds: it goes up only when the last set reaches the reps the next step asks for, and the projection counts only the target reps.";
  }
  const delta = c.to.weight - c.from.weight;
  const stage = c.to.stage && c.to.stage !== c.from.stage ? ` and moves to ${stageWords(c.to.stage)}` : "";
  const reps =
    c.to.reps !== undefined && c.from.reps !== undefined && c.to.reps !== c.from.reps
      ? ` and moves to ${c.to.reps} reps a set`
      : "";
  if (delta > 0) return `A pass adds ${num(delta)}${stage}${reps}.`;
  if (delta < 0) return `The weight drops ${num(-delta)}${stage}${reps}.`;
  return `The weight holds${stage}${reps}.`;
}

/**
 * How a later workout's weight for a lift was projected, as trace steps: where it stands
 * now, then each earlier session of the projection that did it, assumed done at every
 * target, with the rule the progression code applied. The steps add up to the planned
 * weight; a weight set for the day (a per-set plan) is the last step.
 */
export function projectionTrace(entry: WorkoutExerciseState, changes: readonly ProjectedChange[]): DecisionTrace {
  const steps: TraceStep[] = [];
  const start = changes[0]?.from.weight ?? entry.weight;
  steps.push(
    step(
      "projection-start",
      "Where it stands now",
      changes.length
        ? `The next time it is done, it is planned at ${num(start)}.`
        : "No day before this one in the projection does it at this tier, so it is planned from where it stands now.",
      "start",
      "lb",
      start
    )
  );
  for (const c of changes) {
    const { op, value } = change(c.to.weight - c.from.weight);
    steps.push(
      step(
        "projected-session",
        `If ${workoutDisplayName(c.templateId, true)} goes to plan`,
        `Assumes every set at ${num(c.from.weight)} is done at its target reps. ${outcomeWords(c)}`,
        op,
        "lb",
        value,
        c.ruleId
      )
    );
  }
  if (applySteps(steps).lb !== entry.weight) {
    steps.push(
      step(
        "planned-for-day",
        "Planned for the day",
        entry.perSet?.length
          ? "The weights per set you planned for this session; the heaviest is shown."
          : `Planned at ${num(entry.weight)} for this day.`,
        "set",
        "lb",
        entry.weight
      )
    );
  }
  return {
    subject: { kind: "weight", exerciseId: entry.exerciseId, tier: entry.tier },
    result: entry.weight,
    unit: "lb",
    steps,
  };
}

/**
 * One coming workout in full (W1 to W4): every entry the Ready screen would plan for it
 * if every session before it were completed at target, with what each lift's weight
 * assumes. Position 0 is the next workout exactly as Today and Ready plan it
 * (`resolveNextWorkout`, with the accessories for `accessoriesNow`'s day). A later
 * position plans the projection's states for it (the same walk as
 * `projectUpcomingWorkouts`) with `planWorkoutStart`, so its lifts equal that card's.
 * Null for a position out of range. Pure.
 */
export function describeUpcomingWorkout(input: DescribeUpcomingInput): UpcomingWorkoutDetail | null {
  const { position, location } = input;
  if (!Number.isInteger(position) || position < 0 || position > MAX_UPCOMING_POSITION) return null;
  const { sessions, simulated } = walkProjection(input, position + 1);
  const target = sessions[position];
  const source = accessorySourceOf(input);
  const planOptions = planOptionsOf(input);

  // What starting this day from the states as they are now would plan.
  const fromNow = (accessories: AccessorySource | null): WorkoutStartPlan =>
    planWorkoutStart({
      ...planOptions,
      template: target.template,
      liftStates: input.liftStates,
      variantStates: input.variantStates ?? [],
      ...(input.nextSetPlans ? { nextSetPlans: input.nextSetPlans } : {}),
      reentry: input.reentry ? "day" : "none",
      ...(accessories ? { accessories } : {}),
    });

  const start = shownStartPlan(input, sessions, position, source);

  const before = simulated.slice(0, position);
  const lifts: UpcomingLift[] = programEntries(start.plan).map((entry) => {
    const changes = position === 0 ? [] : changesFor(entry, before);
    const last = [...changes].reverse().find(moved);
    return {
      entry,
      assumed: target.advanced.has(`${entry.exerciseId}:${entry.tier}`),
      changes,
      dependsOn: last ? { position: last.position, templateId: last.templateId } : null,
      projection: position === 0 ? null : projectionTrace(entry, changes),
    };
  });

  return {
    position,
    templateId: target.templateId,
    template: target.template,
    location,
    projected: position > 0,
    dueTemplateId: sessions[0].templateId,
    plan: start.plan,
    accessories: start.accessories,
    lifts,
    sameIfDoneToday: position === 0 || sameProgramSets(start.plan, fromNow(null).plan),
  };
}

/**
 * The position of the next time each day comes round, in rotation order from the due
 * day (W6): the index of each day's first appearance in `upcoming`.
 */
export function nextOccurrences(upcoming: readonly Pick<UpcomingWorkout, "templateId">[]): number[] {
  const seen = new Set<string>();
  const positions: number[] = [];
  upcoming.forEach((workout, index) => {
    if (seen.has(workout.templateId)) return;
    seen.add(workout.templateId);
    positions.push(index);
  });
  return positions;
}
