/**
 * Starting weights suggested from history (imported or logged), with their working.
 * Pure: nothing is changed here. The screen shows each suggestion and records it only
 * when the lifter confirms it: a `start` adjustment for a barbell lift, the same with a
 * `variant` for a home exercise.
 *
 * The rule, per program lift and tier, from the lift's pooled strength estimate (the
 * strength library: its latest session, home sessions after it through their ratios,
 * older sessions halved per half-life):
 * - T1 (5×3): STARTING_WEIGHT_RULES.t1FractionOfFiveRepMax of the five-rep max the
 *   estimate implies, the GZCLP guide's starting point.
 * - T2 (3×10): STARTING_WEIGHT_RULES.t2FractionOfFiveRepMax of that five-rep max, the
 *   guide's usual T2 start.
 * - T3: the weight the estimate says could be lifted STARTING_WEIGHT_RULES.t3Reps
 *   times, the program's 15 reps with some to spare. The raise asks the last set for 18
 *   to 25 reps depending on the step (`t3IncreaseThreshold`), so a heavy T3 can go up
 *   after its first session.
 * - When the newest evidence is old, the app's time-off rule (`calculateWeightDecay`)
 *   takes its share off.
 * - Barbell weights are rounded down to loadable plates; dumbbell weights to the
 *   dumbbell step, as lifted (per hand where it is per hand) and capped at the heaviest
 *   dumbbell; a home exercise goes through its ratio to the lift (learned, else the
 *   starting ratio).
 * The T1 and T2 fractions are the GZCLP guide's; the T3 reps and the rest are this app's.
 *
 * @evidence starting-weights
 */
import type { NewAdjustment } from "@/lib/data/adjustments";
import { EXERCISES } from "@/lib/exercises";
import { T3_INCREMENT_LBS } from "@/lib/progression";
import {
  asLifted,
  impliedWeightForReps,
  priorFor,
  roundDownToDumbbell,
  roundDownToPlates,
  type PooledEstimate,
  type StrengthSet,
} from "@/lib/strength";
import { calculateWeightDecay } from "@/lib/weightDecay";
import { resolveReentry } from "@/lib/workout/reentry";
import { chooseHomeVariant } from "@/lib/workout/variant";
import { pooledEstimateOf, transferRatioOf } from "@/lib/workout/strength";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import type { EquipmentProfile, LiftState, TrainingPhase, VariantState } from "@/types";
import { formatLb } from "./preview";

/** The numbers the suggestions are worked from. Heuristic. */
export const STARTING_WEIGHT_RULES = {
  /** T1 starts at this fraction of the five-rep max (the GZCLP guide: about 85%). */
  t1FractionOfFiveRepMax: 0.85,
  /** T2 starts at this fraction of the five-rep max (the guide's usual 65%). */
  t2FractionOfFiveRepMax: 0.65,
  /** The rep max the T1 and T2 fractions are taken of. */
  fiveRepMaxReps: 5,
  /** T3 starts at the weight the estimate says could be lifted this many times. */
  t3Reps: 20,
} as const;

export type StartingTier = "T1" | "T2" | "T3";

export interface StartingWeightSuggestion {
  /** `${liftId}|${tier}|${location}`. */
  id: string;
  liftId: string;
  tier: StartingTier;
  location: "gym" | "home";
  /** The exercise the weight is for: the lift itself, or its home exercise. */
  exerciseId: string;
  exerciseName: string;
  /** The weight is per dumbbell. */
  perHand: boolean;
  /** The weight planned now, as lifted. */
  current: number;
  /** The suggestion, as lifted. */
  suggested: number;
  estimate: PooledEstimate;
  /** The estimated max of the exercise the weight is for (total load). */
  exerciseMax: number;
  /** For a home exercise: its ratio to the lift. */
  ratio: number | null;
  /** The newest session the estimate rests on. */
  newest: Date;
  ageDays: number;
  /** The time-off cut taken off (0 to 1). */
  decayPercent: number;
  /** The working, one step per line. */
  working: string[];
  /** What confirming records (the weight can be edited first). */
  adjustment: NewAdjustment;
}

export interface StartingWeightInput {
  /** Every set as strength evidence: the log's and the imported (`strengthEvidenceOf`). */
  sets: readonly StrengthSet[];
  /**
   * The sets planning reads (in the app the same as `sets`, `strengthEvidenceOf`): the
   * home weight planned now (`current`) is worked out from them, after re-entry and with
   * a home exercise never used seeded, exactly as Today plans it.
   */
  planStrengthSets?: readonly StrengthSet[];
  liftStates: readonly LiftState[];
  variantStates: readonly VariantState[];
  equipment: EquipmentProfile;
  phase: TrainingPhase;
  now: Date;
  /**
   * The imported sessions' ids. When given, a lift gets a suggestion only when its
   * estimate rests on at least one of them: a lift known from the app's own log alone
   * keeps the weight its progression gave it.
   */
  importedSessionIds?: ReadonlySet<string>;
}

const DAY_MS = 86_400_000;

function restsOn(estimate: PooledEstimate, ids: ReadonlySet<string> | undefined): boolean {
  if (!ids) return true;
  return (estimate.own != null && ids.has(estimate.own.sessionId)) || estimate.related.some((r) => ids.has(r.sessionId));
}

const nameOf = (id: string) => EXERCISES[id]?.name ?? id;

function formatDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "3 days", "5 weeks", "7 months", "2 years". */
export function formatAge(days: number): string {
  const d = Math.max(0, Math.floor(days));
  if (d < 14) return `${d} day${d === 1 ? "" : "s"}`;
  if (d < 60) return `${Math.floor(d / 7)} weeks`;
  if (d < 730) return `${Math.floor(d / 30.44)} months`;
  return `${Math.floor(d / 365.25)} years`;
}

function newestOf(estimate: PooledEstimate): Date {
  const times = [
    ...(estimate.own ? [estimate.own.date.getTime()] : []),
    ...estimate.related.map((r) => r.date.getTime()),
  ];
  return new Date(Math.max(...times));
}

/** What the estimate rests on, in a sentence. */
export function describeEstimate(estimate: PooledEstimate): string {
  const parts: string[] = [];
  if (estimate.own) {
    const best = estimate.own.bestSet;
    parts.push(
      `${nameOf(estimate.liftId)} on ${formatDay(estimate.own.date)}: ${formatLb(best.load)} lb × ${best.reps}`
    );
  }
  if (estimate.related.length > 0) {
    const byExercise = new Map<string, { count: number; ratio: number; pairs: number }>();
    for (const r of estimate.related) {
      const entry = byExercise.get(r.exerciseId) ?? { count: 0, ratio: r.ratio.ratio, pairs: r.ratio.pairs };
      entry.count += 1;
      byExercise.set(r.exerciseId, entry);
    }
    for (const [exerciseId, { count, ratio, pairs }] of byExercise) {
      const basis = pairs > 0 ? `ratio ${ratio.toFixed(2)} from ${pairs} pair${pairs === 1 ? "" : "s"}` : `starting ratio ${ratio.toFixed(2)}`;
      parts.push(`${count} ${nameOf(exerciseId)} session${count === 1 ? "" : "s"}${estimate.own ? " after it" : ""} (${basis})`);
    }
  }
  return `Estimated max ${estimate.value} lb, from ${parts.join(" and ")}.`;
}

function tierSet(tier: StartingTier, weight: number): NewAdjustment["set"] {
  if (tier === "T1") return { t1Weight: weight, t1Stage: "5x3", t1FailCount: 0 };
  if (tier === "T2") return { t2Weight: weight, t2Stage: "3x10", t2FailCount: 0 };
  return { t3Weight: weight };
}

/** The confirmed adjustment for a suggestion at `weight` (the suggestion, or an edited one). */
export function adjustmentFor(suggestion: Pick<StartingWeightSuggestion, "liftId" | "tier" | "location" | "exerciseId">, weight: number): NewAdjustment {
  return {
    exerciseId: suggestion.liftId,
    source: "start",
    set: tierSet(suggestion.tier, weight),
    ...(suggestion.location === "home"
      ? { variant: { exerciseId: suggestion.exerciseId, tier: suggestion.tier } }
      : {}),
    note: "Starting weight suggested from imported history",
  };
}

function tierLifts(tier: StartingTier): string[] {
  const ids = new Set<string>();
  for (const template of Object.values(WORKOUT_TEMPLATES)) {
    for (const ex of template.exercises) if (ex.tier === tier) ids.add(ex.exerciseId);
  }
  return [...ids].sort();
}

function currentWeight(state: LiftState | undefined, tier: StartingTier): number {
  if (!state) return 0;
  return tier === "T1" ? state.t1Weight : tier === "T2" ? state.t2Weight : state.t3Weight;
}

interface Worked {
  raw: number;
  lines: string[];
}

/** The T1 or T2 fraction of the five-rep max of `max`, as a total load. */
function fromFiveRepMax(max: number, tier: "T1" | "T2", what: string): Worked {
  const fraction = tier === "T1" ? STARTING_WEIGHT_RULES.t1FractionOfFiveRepMax : STARTING_WEIGHT_RULES.t2FractionOfFiveRepMax;
  const fiveRm = impliedWeightForReps(max, STARTING_WEIGHT_RULES.fiveRepMaxReps);
  const raw = fraction * fiveRm;
  return {
    raw,
    lines: [
      `Five-rep max${what} about ${formatLb(fiveRm)} lb; ${tier} starts at ${Math.round(fraction * 100)}%: ${formatLb(raw)} lb.`,
    ],
  };
}

function withTimeOff(worked: Worked, ageDays: number, newest: Date, phase: TrainingPhase): Worked & { decay: number } {
  const decay = calculateWeightDecay(ageDays, worked.raw, phase).decayPercent;
  if (decay <= 0) return { ...worked, decay: 0 };
  const raw = worked.raw * (1 - decay);
  return {
    raw,
    decay,
    lines: [
      ...worked.lines,
      `The newest session was ${formatAge(ageDays)} ago (${formatDay(newest)}): the time-off rule takes ${Math.round(decay * 100)}% off, ${formatLb(raw)} lb.`,
    ],
  };
}

/**
 * The starting weights the evidence suggests: per program lift and tier at the gym,
 * per home exercise the plan would use for T1 and T2 lifts, and per T3 lift. A lift
 * with no evidence gets none. Nothing is changed; see `adjustmentFor`.
 *
 * The home exercise and its weight planned now come from the same source Today plans
 * from (`describeNextWorkout`): the states after re-entry at home (`resolveReentry`),
 * with a home exercise never used seeded from the evidence planning reads (`planStrengthSets`).
 */
export function suggestStartingWeights(input: StartingWeightInput): StartingWeightSuggestion[] {
  const { sets, equipment, phase, now } = input;
  const planSets = input.planStrengthSets;
  const stateOf = new Map(input.liftStates.map((s) => [s.exerciseId, s]));
  const atHome = resolveReentry({
    liftStates: input.liftStates,
    variantStates: input.variantStates,
    location: "home",
    equipment,
    ...(planSets ? { strengthSets: planSets } : {}),
  });
  const homeStateOf = new Map(atHome.liftStates.map((s) => [s.exerciseId, s]));
  const out: StartingWeightSuggestion[] = [];

  for (const tier of ["T1", "T2"] as const) {
    for (const liftId of tierLifts(tier)) {
      const estimate = pooledEstimateOf(sets, liftId);
      if (!estimate || !(estimate.value > 0) || !restsOn(estimate, input.importedSessionIds)) continue;
      const newest = newestOf(estimate);
      const ageDays = (now.getTime() - newest.getTime()) / DAY_MS;
      const state = stateOf.get(liftId);
      const evidence = describeEstimate(estimate);

      // At the gym.
      const gym = withTimeOff(fromFiveRepMax(estimate.value, tier, ""), ageDays, newest, phase);
      const gymWeight = roundDownToPlates(gym.raw, equipment);
      const gymBase = { liftId, tier, location: "gym" as const, exerciseId: liftId };
      out.push({
        id: `${liftId}|${tier}|gym`,
        ...gymBase,
        exerciseName: nameOf(liftId),
        perHand: false,
        current: currentWeight(state, tier),
        suggested: gymWeight,
        estimate,
        exerciseMax: estimate.value,
        ratio: null,
        newest,
        ageDays,
        decayPercent: gym.decay,
        working: [evidence, ...gym.lines, `Rounded down to plates: ${formatLb(gymWeight)} lb.`],
        adjustment: adjustmentFor(gymBase, gymWeight),
      });

      // At home, for the exercise and at the weight Today plans.
      const choice = chooseHomeVariant({
        liftId,
        tier,
        liftState: homeStateOf.get(liftId),
        variantStates: atHome.variantStates,
        equipment,
        ...(planSets ? { strengthSets: planSets } : {}),
      });
      if (!choice) continue;
      const exerciseId = choice.state.exerciseId;
      const ratio = transferRatioOf(sets, liftId, exerciseId)?.ratio ?? priorFor(liftId, exerciseId)?.ratio ?? null;
      if (ratio === null || !(ratio > 0)) continue;
      const exerciseMax = estimate.value * ratio;
      const perHand = choice.state.perHand;
      const what = ` (${nameOf(exerciseId)}${perHand ? ", both dumbbells" : ""})`;
      const worked = withTimeOff(fromFiveRepMax(exerciseMax, tier, what), ageDays, newest, phase);
      const lifted = asLifted(worked.raw, exerciseId);
      const step = equipment.dumbbellIncrementLbs;
      const rounded = roundDownToDumbbell(lifted, step);
      const suggested = Math.min(rounded, equipment.maxDumbbellWeight);
      const hand = perHand ? " a hand" : "";
      const base = { liftId, tier, location: "home" as const, exerciseId };
      out.push({
        id: `${liftId}|${tier}|home`,
        ...base,
        exerciseName: nameOf(exerciseId),
        perHand,
        current: choice.weight,
        suggested,
        estimate,
        exerciseMax,
        ratio,
        newest,
        ageDays,
        decayPercent: worked.decay,
        working: [
          evidence,
          `${nameOf(exerciseId)} at ${ratio.toFixed(2)} of the ${nameOf(liftId).toLowerCase()} estimate: about ${formatLb(exerciseMax)} lb.`,
          ...worked.lines,
          `As lifted${perHand ? ", per hand" : ""}: ${formatLb(lifted)} lb; rounded down to the ${formatLb(step)} lb step: ${formatLb(rounded)} lb${hand}.`,
          ...(rounded > equipment.maxDumbbellWeight
            ? [`Capped at your heaviest dumbbell: ${formatLb(equipment.maxDumbbellWeight)} lb${hand}.`]
            : []),
        ],
        adjustment: adjustmentFor(base, suggested),
      });
    }
  }

  for (const liftId of tierLifts("T3")) {
    const estimate = pooledEstimateOf(sets, liftId);
    if (!estimate || !(estimate.value > 0) || !restsOn(estimate, input.importedSessionIds)) continue;
    const newest = newestOf(estimate);
    const ageDays = (now.getTime() - newest.getTime()) / DAY_MS;
    const reps = STARTING_WEIGHT_RULES.t3Reps;
    const total = impliedWeightForReps(estimate.value, reps);
    const worked = withTimeOff(
      { raw: total, lines: [`T3 starts where about ${reps} reps are possible: ${formatLb(total)} lb.`] },
      ageDays,
      newest,
      phase
    );
    const isDumbbell = EXERCISES[liftId]?.type === "dumbbell";
    const perHand = EXERCISES[liftId]?.grip === "per_hand";
    const lifted = asLifted(worked.raw, liftId);
    const step = isDumbbell ? equipment.dumbbellIncrementLbs : T3_INCREMENT_LBS;
    const rounded = roundDownToDumbbell(lifted, step);
    const suggested = isDumbbell ? Math.min(rounded, equipment.maxDumbbellWeight) : rounded;
    const base = { liftId, tier: "T3" as const, location: "gym" as const, exerciseId: liftId };
    out.push({
      id: `${liftId}|T3|gym`,
      ...base,
      exerciseName: nameOf(liftId),
      perHand,
      current: currentWeight(stateOf.get(liftId), "T3"),
      suggested,
      estimate,
      exerciseMax: estimate.value,
      ratio: null,
      newest,
      ageDays,
      decayPercent: worked.decay,
      working: [
        describeEstimate(estimate),
        ...worked.lines,
        `Rounded down to the ${formatLb(step)} lb step${perHand ? ", per hand" : ""}: ${formatLb(suggested)} lb.`,
      ],
      adjustment: adjustmentFor(base, suggested),
    });
  }
  return out;
}
