import type { PrescribedEntry, SetLog, SetStatus, Tier } from "@/types";
import { workingSetsFor } from "./setSelectors";
import type { WorkoutExerciseState, WorkoutPlan } from "./types";

/** Whether an entry is evaluated by the program's progression rules or only logged. */
export type EntryCredit = "program" | "logged-only";

/** Tiers whose lifts the program progresses. Accessories and warm-ups never are. */
export const CREDIT_TIERS: readonly Tier[] = ["T1", "T2", "T3"];

/**
 * The share of the prescribed weight a lift must reach to count toward progression.
 * 1 means at least the prescribed weight.
 */
export const CREDIT_MIN_WEIGHT_RATIO = 1;

/**
 * Set statuses that decide whether a lift was done at its prescribed weight. Sets
 * reduced or skipped for pain, a run or equipment, and accepted T2 load drops, are
 * left out: the existing freeze and auto-regulation rules deal with those.
 */
export const CREDIT_DECIDING_STATUSES: readonly SetStatus[] = ["completed", "failed"];

type CreditEntry = Pick<
  WorkoutExerciseState,
  "exerciseId" | "tier" | "targetSets" | "targetReps" | "weight" | "originalWeight" | "isWarmUp"
>;

/**
 * Whether one plan entry counts toward the program's progression.
 *
 * "program" when the entry is a T1/T2/T3 lift the session's `prescribed` list names,
 * at the prescribed sets and reps and at no less than the prescribed weight. Anything
 * else (a swapped-in or added exercise, a different scheme, a lighter weight, an
 * accessory, a warm-up) is "logged-only" and must not change lift state at all.
 *
 * Weight is judged from the logged sets when given, otherwise from the entry (the
 * pre-workout preview). The weight compared is `originalWeight ?? weight`, so a home
 * substitute counts as the program lift it stands for. Only sets with a status in
 * CREDIT_DECIDING_STATUSES decide, and the lift is lighter only when every one of them
 * is below the prescription, so a single mistyped set does not flip it. With no
 * deciding set logged, the entry itself decides.
 *
 * A session with no `prescribed` list predates this rule: its T1/T2/T3 entries are
 * all "program". The answer depends only on the arguments, never on how an edit was
 * made, so replaying a past session gives the same result.
 *
 * @evidence off-program-credit
 */
export function classifyEntry(
  entry: CreditEntry,
  prescribed: PrescribedEntry[] | undefined,
  sets?: SetLog[]
): EntryCredit {
  if (entry.isWarmUp || !CREDIT_TIERS.includes(entry.tier)) return "logged-only";
  if (!prescribed) return "program";

  const target = prescribed.find(
    (p) => p.exerciseId === entry.exerciseId && p.tier === entry.tier
  );
  if (!target) return "logged-only";
  if (entry.targetSets !== target.sets || entry.targetReps !== target.reps) return "logged-only";

  const required = target.weight * CREDIT_MIN_WEIGHT_RATIO;
  const deciding = workingSetsFor(sets ?? [], entry.exerciseId, entry.tier).filter((set) =>
    CREDIT_DECIDING_STATUSES.includes(set.status)
  );
  const reached =
    deciding.length > 0
      ? deciding.some((set) => (set.originalWeight ?? set.weight) >= required)
      : (entry.originalWeight ?? entry.weight) >= required;

  return reached ? "program" : "logged-only";
}

/**
 * Whether a finished session advances the A1 -> B1 -> A2 -> B2 rotation: its base day
 * was the day that was due, and its T1 lift is still in the plan and counts as a
 * program entry. `dueTemplateId` is supplied by the caller from the earlier completed
 * sessions; when it is not given the session counts, as every session did before
 * this rule.
 *
 * @evidence off-program-credit
 */
export function sessionCountsForRotation(input: {
  templateId: string;
  plan: WorkoutPlan;
  prescribed: PrescribedEntry[] | undefined;
  sets: SetLog[];
  dueTemplateId: string | undefined;
}): boolean {
  const { templateId, plan, prescribed, sets, dueTemplateId } = input;
  if (dueTemplateId === undefined) return true;
  if (templateId !== dueTemplateId) return false;

  const t1 = plan.find((entry) => !entry.isWarmUp && entry.tier === "T1");
  if (!t1) return false;
  return classifyEntry(t1, prescribed, sets) === "program";
}
