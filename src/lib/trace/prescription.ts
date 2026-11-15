// Why a planned lift has the weight, sets and reps it has. Each step reads the same
// function or record the plan itself came from: the lift state through
// `getPrescription`, last session's outcome as the progression code reported it, plate
// maths from `describePlateLoad`, the home conversion from `adaptExerciseForHome`.
// Nothing here decides a number; the contract test fails if a trace and the plan part.
import { DEFAULT_ACCESSORY_WEIGHTS, EXERCISES } from "@/lib/exercises";
import { SLEEP_SHORT_HOURS } from "@/lib/health/sleep";
import { getExpiredPainEntries } from "@/lib/painAutoClear";
import { describePlateLoad } from "@/lib/plates";
import {
  RESET_FACTOR,
  T3_INCREMENT_LBS,
  T3_LAST_SET_INCREASE_REPS,
  getIncrement,
  outcomeRuleId,
} from "@/lib/progression";
import { formatRestDuration, getRestSeconds, hasCuttingRestBonus } from "@/lib/restTimes";
import { generateWarmUpSets } from "@/lib/warmups";
import { progressionLiftType } from "@/lib/workout/completeWorkout";
import { getPrescription, T1_STAGE_SCHEME, T2_STAGE_SCHEME } from "@/lib/workout/prescription";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type {
  DecisionTrace,
  LiftState,
  ProgressionOutcome,
  SetLog,
  SleepHours,
  StressLevel,
  TraceAlternative,
  TraceStep,
  WorkoutTemplateExercise,
} from "@/types";
import { findLastSession, findWeightAdjustment } from "./history";
import { applySteps } from "./replay";
import {
  dumbbellLimitAtHome,
  dumbbellLimitText,
  homeSteps,
  prescribedTarget,
  yourChangeStep,
  YOUR_CHANGE_RULE,
} from "./substitute";
import { change, joinList, num, regionWords, shortDay, stageWords, step } from "./text";
import type { LastSession, PlanEntry, TraceContext } from "./types";

type ProgramTier = ProgressionOutcome["tier"];

const READINESS_RULE = "readiness";
const PAIN_RULE = "training-with-pain";
const CUT_BONUS_RULE = "rest-cut-bonus";
const TIER_RULE = "tier-structure";

const isProgramTier = (tier: string): tier is ProgramTier =>
  tier === "T1" || tier === "T2" || tier === "T3";

/** The step a lift progresses by, classified exactly as `computeCompletion` does. */
const liftTypeOf = (exerciseId: string) =>
  EXERCISES[exerciseId] ? progressionLiftType(exerciseId) : "upper";

/** The entry as the template exercise `getPrescription` takes. */
function asTemplateExercise(entry: PlanEntry): WorkoutTemplateExercise {
  return {
    exerciseId: entry.exerciseId,
    tier: entry.tier,
    sets: entry.targetSets,
    reps: entry.targetReps,
    isAMRAP: entry.isAMRAP,
  };
}

/** The program's own definition of a lift at a tier, from the workout templates. */
function templateExerciseFor(exerciseId: string, tier: string): WorkoutTemplateExercise | undefined {
  for (const template of Object.values(WORKOUT_TEMPLATES)) {
    const found = template.exercises.find((ex) => ex.exerciseId === exerciseId && ex.tier === tier);
    if (found) return found;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Last time
// ---------------------------------------------------------------------------

/** "205 × 3, 3, 3, 3, 5." */
function setsText(sets: SetLog[]): string {
  if (sets.length === 0) return "No sets logged.";
  const reps = sets.map((set) => set.actualReps);
  const sameWeight = sets.every((set) => set.weight === sets[0].weight);
  const home = sets.some((set) => set.isSubstituted) ? " with dumbbells at home" : "";
  if (!sameWeight) {
    return `${sets.map((set) => `${num(set.weight)} × ${set.actualReps}`).join(", ")}${home}.`;
  }
  const sameReps = reps.every((r) => r === reps[0]);
  const body =
    sameReps && reps.length > 5
      ? `${num(sets[0].weight)} for ${reps.length} sets of ${reps[0]}`
      : `${num(sets[0].weight)} × ${reps.join(", ")}`;
  return `${body}${home}.`;
}

const HOLD_WORDS: Partial<Record<NonNullable<ProgressionOutcome["reason"]>, string>> = {
  pain: "A set was held back for pain.",
  run: "A set was held back after a run.",
  equipment: "A set was held back by equipment.",
  loadDrop: "You took the lighter weight the app suggested.",
  heavier: "Reps were missed at a heavier weight than planned.",
};

/** What the session amounted to, in a sentence. */
function verdict(last: LastSession): string {
  const { outcome, sets } = last;
  switch (outcome.kind) {
    case "passed":
      return "Every set hit its target, so it counts as a pass.";
    case "stageDown":
    case "reset":
      return "A set fell short of its target, so it counts as a miss.";
    case "held":
      return (outcome.reason && HOLD_WORDS[outcome.reason]) ?? "The lift was held.";
    case "partial":
      return "Stopped part-way.";
    case "notDone":
      return "Not done that day.";
    case "loggedOnly":
      return "Done differently from the plan, so it was only logged.";
    case "t3Up":
    case "t3Same": {
      const lastSet = sets[sets.length - 1];
      return lastSet ? `Last set: ${lastSet.actualReps} reps.` : "";
    }
  }
}

function lastSessionStep(last: LastSession): TraceStep {
  const said = [last.outcome.kind === "notDone" ? "" : setsText(last.sets), verdict(last)]
    .filter(Boolean)
    .join(" ");
  return step(
    "last-session",
    `Last time, ${shortDay(last.completedAt)}`,
    said,
    "start",
    "lb",
    last.outcome.from.weight
  );
}

/** What the program rule did with last session's result, in a sentence. */
function progressionDetail(last: LastSession, entry: PlanEntry, context: TraceContext): string {
  const { outcome } = last;
  switch (outcome.kind) {
    case "passed": {
      if (outcome.reason === "heavier") {
        return "You lifted heavier than planned in every set, so the pass builds from what you lifted.";
      }
      // The step is named only when it is the one the settings give for that day's
      // place; the amount itself always comes from the outcome.
      const liftType = liftTypeOf(entry.exerciseId);
      const usual = getIncrement(liftType, last.location, context.equipment);
      if (outcome.to.weight - outcome.from.weight !== usual) return "A pass adds your step.";
      return last.location === "home"
        ? "A pass at home adds your dumbbell step."
        : `A pass adds your ${liftType}-body step.`;
    }
    case "stageDown":
      return `A miss keeps the weight and moves to ${stageWords(outcome.to.stage)}.`;
    case "reset":
      return `A miss at the last stage restarts at ${Math.round(RESET_FACTOR * 100)}% of ${num(outcome.from.weight)}, rounded to 5.`;
    case "held":
      return outcome.to.weight !== outcome.from.weight
        ? "A held lift is neither a pass nor a miss. It carries on from the heavier weight you lifted."
        : "A held lift is neither a pass nor a miss: the weight stays.";
    case "partial":
    case "notDone":
    case "loggedOnly":
      return "Only a lift finished as planned moves the weight.";
    case "t3Up":
      return outcome.reason === "heavier"
        ? "Done heavier than planned, so the weight carries on from what you lifted."
        : `The last set reached ${T3_LAST_SET_INCREASE_REPS} reps, which adds ${T3_INCREMENT_LBS} lb.`;
    case "t3Same":
      return `It goes up when the last set reaches ${T3_LAST_SET_INCREASE_REPS} reps.`;
  }
}

// ---------------------------------------------------------------------------
// Checks that never change the weight
// ---------------------------------------------------------------------------

const SLEEP_WORDS: Record<SleepHours, string> = {
  "<5": `under ${SLEEP_SHORT_HOURS} hours of sleep`,
  "5-7": "5 to 7 hours of sleep",
  "7+": "7 hours of sleep or more",
};
const ENERGY_WORDS: Record<StressLevel, string> = {
  low: "low energy",
  normal: "normal energy",
  good: "good energy",
};

function readinessStep(context: TraceContext): TraceStep {
  const { readiness } = context;
  const answers = [
    readiness?.sleepHours ? SLEEP_WORDS[readiness.sleepHours] : "",
    readiness?.stressLevel ? ENERGY_WORDS[readiness.stressLevel] : "",
  ].filter(Boolean);
  const logged = answers.length > 0 ? `You logged ${joinList(answers)}. ` : "";
  return step(
    "readiness",
    readiness?.score === undefined ? "Readiness" : `Readiness ${Math.round(readiness.score)}`,
    `${logged}Never changes a weight. Under ${SLEEP_SHORT_HOURS} hours of sleep with low energy only suggests skipping accessories.`,
    "none",
    "lb",
    undefined,
    READINESS_RULE
  );
}

function painStep(entry: PlanEntry, context: TraceContext): TraceStep {
  const exercise = EXERCISES[entry.substituteExerciseId ?? entry.exerciseId];
  const regions = exercise?.painSensitiveRegions ?? [];
  const entries = context.painEntries ?? [];
  // The same test Today uses: pain, not soreness, that has not gone stale.
  const stale = new Set(getExpiredPainEntries(entries, context.now).map((e) => e.id));
  const hit = entries
    .filter(
      (e) =>
        e.sensation === "pain" &&
        !stale.has(e.id) &&
        new Date(e.date).getTime() <= context.now.getTime() &&
        regions.includes(e.region)
    )
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

  const detail = hit
    ? `You logged ${regionWords(hit.region)} pain on ${shortDay(hit.date)}. The app shows it before you start and never changes a weight for pain on its own.`
    : regions.length > 0
      ? `No recent pain logged for ${joinList(regions.map(regionWords), "or")}.`
      : "No body area is watched for this lift.";
  return step("pain", "Pain check", detail, "none", "lb", undefined, PAIN_RULE);
}

const PHASE_TITLE = {
  cutting: "Cutting phase",
  maintaining: "Maintaining phase",
  bulking: "Bulking phase",
} as const;

function phaseStep(entry: PlanEntry, context: TraceContext): TraceStep {
  const { phase } = context;
  const bonus = hasCuttingRestBonus(entry.tier, phase);
  return step(
    "phase",
    PHASE_TITLE[phase.mode],
    bonus
      ? `Weight stays. Rest goes from ${formatRestDuration(getRestSeconds(entry.tier))} to ${formatRestDuration(getRestSeconds(entry.tier, phase))}.`
      : "Weight stays. Your phase does not change this lift's rest either.",
    "none",
    "lb",
    undefined,
    bonus ? CUT_BONUS_RULE : undefined
  );
}

/** Plates for a barbell lift at the gym, as the workout screen shows them. */
function plateSteps(entry: PlanEntry, weight: number, context: TraceContext): TraceStep[] {
  const exercise = EXERCISES[entry.substituteExerciseId ?? entry.exerciseId];
  if (exercise?.type !== "barbell" || context.location !== "gym") return [];
  const { barWeight, availablePlates } = context.equipment;
  const load = describePlateLoad(weight, barWeight, availablePlates);
  const side = load.plates.length > 0 ? `${joinList(load.plates.map(num))} a side` : "";
  if (load.exact) {
    return [
      step(
        "plates",
        "Plates",
        side ? `Loads exactly: ${side} on a ${num(barWeight)} lb bar.` : "The empty bar.",
        "round",
        "lb",
        weight
      ),
    ];
  }
  // The plan is not rounded to the plates; the workout screen shows both numbers.
  return [
    step(
      "plates",
      "Plates",
      `Your plates cannot make ${num(weight)} exactly. The bar carries ${num(load.loadableWeight)}${side ? `: ${side}` : ""}. The plan stays at ${num(weight)}.`,
      "none",
      "lb"
    ),
  ];
}

// ---------------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------------

/** The step between the alternatives: the dumbbell step for a home substitute, else the lift's own. */
function alternativeStep(entry: PlanEntry, context: TraceContext): number {
  const substitute = entry.substituteExerciseId ? EXERCISES[entry.substituteExerciseId] : undefined;
  return substitute?.type === "dumbbell"
    ? context.equipment.dumbbellIncrementLbs
    : entry.tier === "T1" || entry.tier === "T2"
      ? getIncrement(liftTypeOf(entry.exerciseId), context.location, context.equipment)
      : T3_INCREMENT_LBS;
}

/**
 * One step lighter, the plan, one step heavier. At home with dumbbells the heavier
 * choice is what the dumbbells can load: it stops at the heaviest dumbbell, and there
 * is none when the plan is already there (`dumbbellLimitAtHome`; the dumbbell step
 * says so).
 */
function weightAlternatives(entry: PlanEntry, context: TraceContext): TraceAlternative[] {
  const increment = alternativeStep(entry, context);
  const options: TraceAlternative[] = [];
  if (increment > 0 && entry.weight - increment > 0) {
    options.push({ label: "easier", value: entry.weight - increment });
  }
  options.push({ label: "the plan", value: entry.weight });
  if (increment > 0) {
    const limit = dumbbellLimitAtHome(entry, increment, context);
    if (!limit) options.push({ label: "harder", value: entry.weight + increment });
    else if (limit.heaviest > entry.weight) {
      options.push({ label: "harder", value: limit.heaviest, note: "heaviest dumbbell" });
    }
  }
  return options;
}

/** The working entry a warm-up entry leads up to, and which warm-up set it is. */
function warmUpSteps(entry: PlanEntry, context: TraceContext, plan: readonly PlanEntry[]): TraceStep[] {
  const working = plan.find((e) => !e.isWarmUp && e.exerciseId === entry.exerciseId);
  const mine = plan.filter((e) => e.isWarmUp && e.exerciseId === entry.exerciseId);
  let index = mine.indexOf(entry);
  if (index < 0) {
    index = mine.findIndex((e) => e.weight === entry.weight && e.targetReps === entry.targetReps);
  }
  const warmUps = working
    ? generateWarmUpSets(working.weight, context.location, context.equipment)
    : [];
  const warmUp = warmUps[index];
  if (!working || !warmUp) {
    return [
      step(
        "warm-up",
        "Warm-up",
        "A lighter set on the way up to your working weight.",
        "start",
        "lb",
        entry.weight
      ),
    ];
  }
  return [
    step(
      "working-weight",
      "Working weight",
      `Today's sets are at ${num(working.weight)}.`,
      "start",
      "lb",
      working.weight
    ),
    step(
      "warm-up",
      `Warm-up ${index + 1} of ${warmUps.length}`,
      `${warmUp.label}: ${num(warmUp.weight)} for ${warmUp.reps}, on the way up. Warm-ups never count toward progression.`,
      "set",
      "lb",
      warmUp.weight
    ),
  ];
}

/**
 * Why a planned entry has the weight it has, as ordered steps that reproduce it:
 * where the weight came from (last session and its sets, or the starting weight), what
 * the program rule did with that session, any change made outside a workout since,
 * then the checks that leave it alone (readiness, pain, phase), the plates and, at
 * home, the dumbbell conversion. A weight the user set for the day is the last step.
 *
 * `plan` is only needed for a warm-up entry, to find the working weight it leads to.
 */
export function explainPrescription(
  entry: PlanEntry,
  context: TraceContext,
  plan: readonly PlanEntry[] = []
): DecisionTrace {
  const subject = { kind: "weight" as const, exerciseId: entry.exerciseId, tier: entry.tier };

  if (entry.isWarmUp) {
    const steps = warmUpSteps(entry, context, plan);
    steps.push(...yourChangeStep(steps, entry, context.prescribed));
    return { subject, result: entry.weight, unit: "lb", steps };
  }

  const liftState = context.liftStates.find((ls) => ls.exerciseId === entry.exerciseId);
  const steps: TraceStep[] = [];
  let programWeight: number;
  // What the program prescribed today. With the session's prescription, a lift it does
  // not name was swapped in or added; without it, having a lift state decides.
  let prescribed = context.prescribed;
  const named = !prescribed || !!prescribedTarget(entry, prescribed);

  if (isProgramTier(entry.tier) && liftState && named) {
    const tier = entry.tier;
    // The weight the plan read: the same function, the same lift state.
    const program = getPrescription(
      templateExerciseFor(entry.exerciseId, tier) ?? asTemplateExercise(entry),
      liftState
    );
    programWeight = program.weight;
    prescribed ??= [{ exerciseId: entry.exerciseId, tier, ...program }];
    const last = findLastSession(context.history, entry.exerciseId, tier, context.now);

    if (last) {
      const { op, value } = change(last.outcome.to.weight - last.outcome.from.weight);
      steps.push(
        lastSessionStep(last),
        step(
          "progression",
          "Progression",
          progressionDetail(last, entry, context),
          op,
          "lb",
          value,
          last.outcome.ruleId
        )
      );
    } else {
      steps.push(
        step(
          "starting-weight",
          "Starting weight",
          "No finished session of this lift at this tier yet, so this is where it starts.",
          "start",
          "lb",
          programWeight
        ),
        step(
          "progression",
          "Progression",
          "Nothing to add until the first session is done.",
          "none",
          "lb",
          undefined,
          outcomeRuleId(tier)
        )
      );
    }

    // A change made outside a workout since then (by hand, after time off, an import).
    if (applySteps(steps).lb !== programWeight) {
      const adjustment = findWeightAdjustment(
        context.history,
        entry.exerciseId,
        tier,
        last?.completedAt,
        context.now
      );
      const why =
        adjustment?.source === "decay"
          ? `Lowered after time off, on ${shortDay(adjustment.at)}.`
          : adjustment
            ? `Set to ${num(programWeight)} outside a workout, on ${shortDay(adjustment.at)}.`
            : `Set to ${num(programWeight)} outside a workout.`;
      steps.push(step("adjustment", "Changed since", why, "set", "lb", programWeight));
    }
  } else if (entry.tier === "accessory") {
    programWeight = DEFAULT_ACCESSORY_WEIGHTS[entry.exerciseId] ?? 0;
    steps.push(
      step(
        "accessory-start",
        "Accessory",
        "Accessories start from a standard weight and do not go up on their own yet.",
        "start",
        "lb",
        programWeight
      )
    );
  } else {
    // Swapped in or added for the day: the program has no weight for it.
    programWeight = entry.originalWeight ?? entry.weight;
    steps.push(
      step(
        "your-choice",
        "Your choice",
        "This is not one of the program's lifts today, so the app does not set its weight.",
        "start",
        "lb",
        programWeight,
        YOUR_CHANGE_RULE
      )
    );
  }

  steps.push(readinessStep(context), painStep(entry, context), phaseStep(entry, context));
  steps.push(...plateSteps(entry, programWeight, context));
  steps.push(...homeSteps(entry, programWeight, context));
  // A dumbbell lift done as itself at home has no conversion step to say it.
  const limit = entry.substituteExerciseId
    ? null
    : dumbbellLimitAtHome(entry, alternativeStep(entry, context), context);
  if (limit) {
    steps.push(
      step(
        "dumbbell-limit",
        "Heaviest dumbbell",
        dumbbellLimitText(limit, entry.weight).trim(),
        "none",
        "lb"
      )
    );
  }
  steps.push(...yourChangeStep(steps, entry, prescribed ?? []));

  return {
    subject,
    result: entry.weight,
    unit: "lb",
    steps,
    alternatives: weightAlternatives(entry, context),
  };
}

// ---------------------------------------------------------------------------
// Sets and reps
// ---------------------------------------------------------------------------

/** Reps per set of a stage name such as "6x2"; undefined when it is not a stage. */
function stageReps(stage: string | undefined): number | undefined {
  if (!stage) return undefined;
  if (stage in T1_STAGE_SCHEME) return T1_STAGE_SCHEME[stage as keyof typeof T1_STAGE_SCHEME].reps;
  if (stage in T2_STAGE_SCHEME) return T2_STAGE_SCHEME[stage as keyof typeof T2_STAGE_SCHEME].reps;
  return undefined;
}

function currentStage(liftState: LiftState, tier: "T1" | "T2"): string {
  return tier === "T1" ? liftState.t1Stage : liftState.t2Stage;
}

/**
 * Why a planned entry has the sets and reps it has. Steps set the reps per set (the
 * stage the lift is at, from last session's outcome) and then the number of sets that
 * stage asks for; the result reads "5x3". A T3 lift and an accessory have one fixed
 * scheme. Sets and reps the user changed for the day are the last steps.
 */
export function explainScheme(entry: PlanEntry, context: TraceContext): DecisionTrace {
  const lastSetNote = entry.isAMRAP ? ", the last one as many as you can" : "";
  const liftState = context.liftStates.find((ls) => ls.exerciseId === entry.exerciseId);
  const steps: TraceStep[] = [];
  let sets: number;
  let reps: number;

  if ((entry.tier === "T1" || entry.tier === "T2") && liftState && !entry.isWarmUp) {
    const tier = entry.tier;
    const stage = currentStage(liftState, tier);
    ({ sets, reps } = getPrescription(asTemplateExercise(entry), liftState));
    const last = findLastSession(context.history, entry.exerciseId, tier, context.now);
    const lastReps = stageReps(last?.outcome.from.stage);
    const nextReps = stageReps(last?.outcome.to.stage);

    if (last && lastReps !== undefined && nextReps !== undefined) {
      steps.push(
        step(
          "last-session",
          `Last time, ${shortDay(last.completedAt)}`,
          `${stageWords(last.outcome.from.stage)} at ${num(last.outcome.from.weight)}.`,
          "start",
          "reps",
          lastReps
        ),
        nextReps === lastReps
          ? step(
              "progression",
              "Progression",
              last.outcome.kind === "passed"
                ? "A pass keeps the same sets and reps."
                : "Nothing moved the stage, so the sets and reps stay.",
              "none",
              "reps",
              undefined,
              last.outcome.ruleId
            )
          : step(
              "progression",
              "Progression",
              last.outcome.kind === "reset"
                ? `A miss at the last stage goes back to ${stageWords(last.outcome.to.stage)}.`
                : `A miss moves to ${stageWords(last.outcome.to.stage)}.`,
              "set",
              "reps",
              nextReps,
              last.outcome.ruleId
            )
      );
    } else {
      steps.push(
        step(
          "stage",
          "Stage",
          `This lift is at ${stageWords(stage)}.`,
          "start",
          "reps",
          reps,
          TIER_RULE
        )
      );
    }
    if (applySteps(steps).reps !== reps) {
      steps.push(
        step(
          "adjustment",
          "Changed since",
          `The stage was set to ${stageWords(stage)} outside a workout.`,
          "set",
          "reps",
          reps
        )
      );
    }
    steps.push(
      step(
        "sets",
        "Sets",
        `At ${reps} ${reps === 1 ? "rep" : "reps"} a set the program asks for ${sets} sets${lastSetNote}.`,
        "set",
        "sets",
        sets
      )
    );
  } else {
    // T3, accessories, warm-ups and anything swapped in: one fixed scheme.
    const programmed =
      entry.tier === "T3" && !entry.isWarmUp
        ? templateExerciseFor(entry.exerciseId, entry.tier)
        : undefined;
    sets = programmed?.sets ?? entry.targetSets;
    reps = programmed?.reps ?? entry.targetReps;
    steps.push(
      step(
        "fixed-scheme",
        entry.isWarmUp ? "Warm-up" : entry.tier === "T3" ? "T3 lifts" : "Fixed scheme",
        `Always sets of ${reps}${lastSetNote}.`,
        "start",
        "reps",
        reps,
        programmed ? TIER_RULE : undefined
      ),
      step("sets", "Sets", `${sets} ${sets === 1 ? "set" : "sets"}.`, "set", "sets", sets)
    );
  }

  // A program lift done at other sets or reps than prescribed is only logged.
  const consequence =
    isProgramTier(entry.tier) && !entry.isWarmUp ? ", so this lift is only logged" : "";
  if (entry.targetReps !== reps) {
    steps.push(
      step(
        "your-change",
        "Your change",
        `You set ${entry.targetReps} reps a set for today${consequence}.`,
        "set",
        "reps",
        entry.targetReps,
        YOUR_CHANGE_RULE
      )
    );
  }
  if (entry.targetSets !== sets) {
    steps.push(
      step(
        "your-change",
        "Your change",
        `You set ${entry.targetSets} sets for today${consequence}.`,
        "set",
        "sets",
        entry.targetSets,
        YOUR_CHANGE_RULE
      )
    );
  }

  return {
    subject: { kind: "scheme", exerciseId: entry.exerciseId, tier: entry.tier },
    result: `${entry.targetSets}x${entry.targetReps}`,
    unit: "none",
    steps,
  };
}
