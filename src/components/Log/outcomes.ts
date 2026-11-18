// What one finished session did to each of its program lifts. The lift outcomes' logic
// lives in src/lib/workout/outcomes.ts, built on the outcome the progression code
// reports; this file adds the lines for the home exercises, which progress on their
// own weight (`VariantOutcome`). Pure.
import { liftName } from "@/components/LogEdit/format";
import { displayLiftName, nameInSentence } from "@/components/Today/todayModel";
import { getRule, isRuleId } from "@/lib/evidence";
import { EXERCISES } from "@/lib/exercises";
import { formatNumber } from "@/lib/metrics/helpers";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { describeOutcomes, describeT3 } from "@/lib/workout/outcomes";
import { workingSetsFor } from "@/lib/workout/setSelectors";
import { t3IncreaseOfVariantOutcome, t3LastSetAgainst } from "@/lib/workout/t3Increase";
import type {
  EquipmentProfile,
  ProgressionOutcome,
  ProgressionOutcomeKind,
  SetLog,
  Tier,
  VariantOutcome,
  VariantPoint,
  WorkoutSession,
} from "@/types";

/**
 * The program lift's name, with the home substitute it was done as when the session's
 * sets for that lift and tier were substituted: "Squat (goblet squat at home)", so the
 * line matches the set list beside it while saying which lift it moved.
 */
export function outcomeLiftName(
  exerciseId: string,
  tier: Tier,
  sets: readonly Pick<SetLog, "exerciseId" | "tier" | "isSubstituted" | "substituteExerciseId">[]
): string {
  const substitute = sets.find(
    (s) => s.exerciseId === exerciseId && s.tier === tier && s.substituteExerciseId && EXERCISES[s.substituteExerciseId]
  )?.substituteExerciseId;
  const name = liftName(exerciseId);
  return substitute ? `${name} (${nameInSentence(substitute)} at home)` : name;
}

/** "75 lbs a hand", or "55 lbs" for one dumbbell. */
function asLifted(point: Pick<VariantPoint, "weight" | "perHand">): string {
  return `${formatNumber(point.weight, 1)} lbs${point.perHand ? " a hand" : ""}`;
}

/** "5x3", or "5x4" once the cap policy added reps: the stage's sets by the reps a set. */
function schemeOf(point: VariantPoint): string | undefined {
  if (!point.stage) return undefined;
  const sets = point.stage.split("x")[0];
  return `${sets}x${point.reps}`;
}

/**
 * The line for a home exercise's outcome, in its own weight as lifted, e.g. "passed: next
 * 75 lbs a hand 5x3". A pass at the heaviest dumbbell says what the cap policy did: more
 * reps, or the harder exercise and its weight. `sets` (the working sets) are only read
 * for a T3's last-set reps; `equipment` (the dumbbells the session was finished with)
 * gives a T3 its next step, and with it the reps its last set needed.
 */
export function describeVariantOutcome(
  outcome: VariantOutcome,
  sets: SetLog[] = [],
  equipment: EquipmentProfile = DEFAULT_USER_PROFILE.settings.equipment
): string {
  const { tier, kind, reason, from, to, cap } = outcome;
  const next = asLifted(to);
  const scheme = schemeOf(to);
  const nextWithScheme = scheme ? `${next} ${scheme}` : next;
  const stillThere = (verb: string) => (tier === "T3" ? `${verb}: stays at ${next}` : `${verb}: no change`);
  const passed = cap ? `passed at your heaviest dumbbell (${formatNumber(cap.maxDumbbellWeight, 1)})` : "passed";

  if (cap?.policy === "harderVariant") {
    const perHand = EXERCISES[cap.to.exerciseId]?.grip === "per_hand";
    return `${passed}: next ${nameInSentence(cap.to.exerciseId)} at ${asLifted({ weight: cap.to.weight, perHand })}`;
  }
  // A T3 whose last set earned a heavier weight it cannot have: the cap policy adds reps.
  if (cap?.policy === "reps" && kind === "t3Same") {
    const threshold = t3IncreaseOfVariantOutcome(outcome, { ...equipment, maxDumbbellWeight: cap.maxDumbbellWeight })?.threshold;
    const lastSet = sets[sets.length - 1];
    const reached =
      lastSet && threshold != null ? t3LastSetAgainst(lastSet.actualReps, threshold) : `last set reached ${threshold}`;
    return (
      `${reached}, at your heaviest dumbbell (${formatNumber(cap.maxDumbbellWeight, 1)}): ` +
      `stays at ${next}, sets of ${cap.repsTo} reps next (was ${cap.repsFrom})`
    );
  }
  switch (kind) {
    case "passed":
      return `${passed}: next ${nextWithScheme}`;
    case "stageDown":
      return `missed: moves to ${scheme ?? to.stage} at ${next}`;
    case "reset":
      return `missed: resets to ${nextWithScheme}`;
    case "held":
      return to.weight !== from.weight ? `held: next ${nextWithScheme}` : stillThere("held");
    case "partial":
      return stillThere("partly done");
    case "notDone":
      return stillThere("not done");
    case "loggedOnly":
      return stillThere("only logged");
    case "t3Up":
    case "t3Same":
      return describeT3(t3IncreaseOfVariantOutcome(outcome, equipment), kind, reason, next, sets);
  }
}

/** One row of "What it did" or "What it changed": a lift, or the home exercise done for it. */
export interface SessionOutcomeRow {
  /** "squat:T1": the program lift and tier, whichever exercise was done. */
  key: string;
  /** The program lift. */
  exerciseId: string;
  tier: ProgressionOutcome["tier"];
  kind: ProgressionOutcomeKind;
  /** The exercise named: the home exercise when it has an outcome of its own. */
  name: string;
  text: string;
  /** Weight going in and coming out, in the named exercise's own terms (as lifted at home). */
  from: number;
  to: number;
  ruleId: string;
  /** True when the weight (or, at the cap, the reps or exercise) moved up. */
  raised: boolean;
  /** The home exercise, when the row is one. */
  home?: { exerciseId: string; perHand: boolean };
}

const RAISED = new Set<ProgressionOutcomeKind>(["passed", "t3Up"]);

/**
 * The rule behind a home exercise's outcome: the cap policy, home progression, or the
 * outcome's own. A rule still planned in the evidence registry is not shown anywhere,
 * so until it is active the outcome's own rule (the GZCLP rule it applied) is cited.
 */
function variantRuleId(outcome: VariantOutcome): string {
  const specific = outcome.cap
    ? "cap-progression"
    : outcome.ruleId === "gzclp-progression" || outcome.ruleId === "t3-progression"
      ? "home-progression"
      : outcome.ruleId;
  return isRuleId(specific) && getRule(specific).status !== "planned" ? specific : outcome.ruleId;
}

/**
 * The rows for a finished session, in the order of its lift outcomes. At home a lift
 * done as a home exercise with an outcome of its own (`variantOutcomes`, from the
 * rebuild) shows that exercise and its next weight as lifted: the barbell weight does
 * not move at home, so its own "held" says nothing. Every other lift, and every lift at
 * the gym, shows its own outcome as before.
 */
export function describeSessionOutcomes(
  session: Pick<WorkoutSession, "sets"> & Partial<Pick<WorkoutSession, "location">>,
  outcomes: readonly ProgressionOutcome[] | undefined,
  variantOutcomes: readonly VariantOutcome[] | undefined,
  /** The dumbbells the session was finished with (`WorkoutSnapshots.equipment`). */
  equipment?: EquipmentProfile
): SessionOutcomeRow[] {
  const sets = session.sets ?? [];
  const home = session.location === "home" ? (variantOutcomes ?? []) : [];
  return describeOutcomes(session, outcomes).map((outcome): SessionOutcomeRow => {
    const key = `${outcome.exerciseId}:${outcome.tier}`;
    const variant = home.find((v) => v.liftId === outcome.exerciseId && v.tier === outcome.tier);
    if (variant) {
      return {
        key,
        exerciseId: outcome.exerciseId,
        tier: outcome.tier,
        kind: variant.kind,
        name: displayLiftName(variant.exerciseId),
        text: describeVariantOutcome(variant, workingSetsFor(sets, outcome.exerciseId, outcome.tier), equipment),
        from: variant.from.weight,
        to: variant.to.weight,
        ruleId: variantRuleId(variant),
        raised: RAISED.has(variant.kind),
        home: { exerciseId: variant.exerciseId, perHand: variant.from.perHand },
      };
    }
    return {
      key,
      exerciseId: outcome.exerciseId,
      tier: outcome.tier,
      kind: outcome.kind,
      name: outcomeLiftName(outcome.exerciseId, outcome.tier, sets),
      text: outcome.text,
      from: outcome.from.weight,
      to: outcome.to.weight,
      ruleId: outcome.ruleId,
      raised: RAISED.has(outcome.kind),
    };
  });
}
