import { getNextWorkoutId } from "@/lib/workoutTemplates";
import type { PrescribedEntry, SetLog, SetStatus, Tier, WorkoutSession } from "@/types";
import { applyPlanEdits, workingTargetSets } from "./planEdits";
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

/**
 * Whether the deciding working sets, by weight, make up the prescription: all of them
 * at or above `required`, or at least `prescribedSets` of them when some were lighter.
 * A lighter working set never stands in for one at weight, so four lighter sets and one
 * at weight are not a pass; a session ended early with every set at weight still is
 * (progression's freeze rule deals with the sets it lacks).
 */
export function workingSetsReachPrescription(
  weights: readonly number[],
  required: number,
  prescribedSets: number
): boolean {
  const atWeight = weights.filter((weight) => weight >= required).length;
  return atWeight === weights.length || atWeight >= prescribedSets;
}

type CreditEntry = Pick<
  WorkoutExerciseState,
  "exerciseId" | "tier" | "targetSets" | "targetReps" | "weight" | "originalWeight" | "isWarmUp"
> &
  Partial<Pick<WorkoutExerciseState, "perSet">>;

/**
 * Whether one plan entry counts toward the program's progression.
 *
 * "program" when the entry is a T1/T2/T3 lift the session's `prescribed` list names,
 * at the prescribed sets and reps and at no less than the prescribed weight. Anything
 * else (a swapped-in or added exercise, a different scheme, a lighter weight, an
 * accessory, a warm-up) is "logged-only" and must not change lift state at all. A
 * heavier weight is still "program": see `heavierWeightPerformed`.
 *
 * Weight is judged from the logged sets when given, otherwise from the entry (the
 * pre-workout preview). The weight compared is `originalWeight ?? weight`, so a home
 * substitute counts as the program lift it stands for. Only sets with a status in
 * CREDIT_DECIDING_STATUSES decide, and they must make up the prescription
 * (`workingSetsReachPrescription`): every one at the weight, or at least the
 * prescribed number of them when any was lighter. With no deciding set logged, the
 * entry itself decides.
 *
 * A session with no `prescribed` list predates this rule: its T1/T2/T3 entries are
 * all "program". The answer depends only on the arguments, never on how an edit was
 * made, so replaying a past session gives the same result.
 *
 * Only working sets count (`workingSetsFor`, `workingTargetSets`): a ramp before them
 * or a back-off or drop set after them neither changes the scheme nor makes the lift
 * lighter.
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
  if (workingTargetSets(entry) !== target.sets || entry.targetReps !== target.reps) {
    return "logged-only";
  }

  const required = target.weight * CREDIT_MIN_WEIGHT_RATIO;
  const deciding = workingSetsFor(sets ?? [], entry.exerciseId, entry.tier).filter((set) =>
    CREDIT_DECIDING_STATUSES.includes(set.status)
  );
  const reached =
    deciding.length > 0
      ? workingSetsReachPrescription(
          deciding.map((set) => set.originalWeight ?? set.weight),
          required,
          target.sets
        )
      : (entry.originalWeight ?? entry.weight) >= required;

  return reached ? "program" : "logged-only";
}

/**
 * The weight a program lift was actually done at, when every deciding set of it was
 * heavier than prescribed: the lightest of those sets (as `originalWeight ?? weight`,
 * so a home substitute reads as the program lift). Null when the lift was done at the
 * prescribed weight, when any deciding set was at or below it, or when nothing that
 * decides was logged. A lift that qualifies builds its next weight from this one.
 *
 * @evidence off-program-credit
 */
export function heavierWeightPerformed(
  entry: Pick<CreditEntry, "exerciseId" | "tier">,
  prescribed: PrescribedEntry[] | undefined,
  sets: SetLog[]
): number | null {
  const target = prescribed?.find(
    (p) => p.exerciseId === entry.exerciseId && p.tier === entry.tier
  );
  if (!target) return null;
  const deciding = workingSetsFor(sets, entry.exerciseId, entry.tier).filter((set) =>
    CREDIT_DECIDING_STATUSES.includes(set.status)
  );
  if (deciding.length === 0) return null;
  const lightest = Math.min(...deciding.map((set) => set.originalWeight ?? set.weight));
  return lightest > target.weight ? lightest : null;
}

/** A home exercise's prescription, in its own weight (as lifted) and scheme. */
export interface VariantTarget {
  weight: number;
  sets: number;
  reps: number;
}

/**
 * `classifyEntry` for a lift done as its home exercise: judged against the exercise's
 * own prescription (`target`) and by the weight as lifted, not the barbell weight it
 * stands for. A lift the edits removed, or one done at another scheme or lighter than
 * the home exercise's prescription (`workingSetsReachPrescription`), is only logged.
 * Without `prescribed` (a session from before the rule), always "program".
 *
 * @evidence off-program-credit
 */
export function classifyVariantEntry(
  entry: CreditEntry | undefined,
  target: VariantTarget,
  prescribed: PrescribedEntry[] | undefined,
  sets: SetLog[]
): EntryCredit {
  if (!prescribed) return "program";
  if (!entry || entry.isWarmUp) return "logged-only";
  if (workingTargetSets(entry) !== target.sets || entry.targetReps !== target.reps) {
    return "logged-only";
  }
  const deciding = workingSetsFor(sets, entry.exerciseId, entry.tier).filter((set) =>
    CREDIT_DECIDING_STATUSES.includes(set.status)
  );
  const reached =
    deciding.length > 0
      ? workingSetsReachPrescription(
          deciding.map((set) => set.weight),
          target.weight,
          target.sets
        )
      : entry.weight >= target.weight;
  return reached ? "program" : "logged-only";
}

/**
 * `heavierWeightPerformed` for a home exercise: the lightest deciding working set, as
 * lifted, when every one of them was heavier than the exercise's prescribed weight.
 *
 * @evidence off-program-credit
 */
export function heavierVariantWeight(
  entry: Pick<CreditEntry, "exerciseId" | "tier">,
  target: Pick<VariantTarget, "weight">,
  sets: SetLog[]
): number | null {
  const deciding = workingSetsFor(sets, entry.exerciseId, entry.tier).filter((set) =>
    CREDIT_DECIDING_STATUSES.includes(set.status)
  );
  if (deciding.length === 0) return null;
  const lightest = Math.min(...deciding.map((set) => set.weight));
  return lightest > target.weight ? lightest : null;
}

/** The fields of a workout row the rotation depends on. */
export type RotationSession = Pick<WorkoutSession, "templateId" | "startedAt" | "completedAt"> &
  Partial<Pick<WorkoutSession, "id" | "location" | "prescribed" | "planEdits" | "sets">>;

/**
 * Whether a finished session advances the A1 -> B1 -> A2 -> B2 rotation, given the
 * day that was due when it was done: it was that day, and its T1 lift was neither
 * swapped out, removed, done at another scheme nor done lighter than prescribed.
 * Decided from the session row alone (its prescription, edits and logged sets). With
 * no T1 set logged, the weight is taken as prescribed, so a day ended early counts.
 * When the T1 lift was done as its home exercise (the stored `prescribed.home`), the
 * scheme and weight are that exercise's own, as lifted. Weight per set and a ramp in
 * front count exactly as a plain session: only the working sets decide.
 *
 * A session without `prescribed` predates this rule and always counts, whatever its
 * day, exactly as before.
 *
 * @evidence off-program-credit
 * @evidence home-progression
 */
export function sessionCountsForRotation(
  session: RotationSession,
  dueTemplateId: string
): boolean {
  const prescribed = session.prescribed;
  if (!prescribed) return true;
  if (session.templateId !== dueTemplateId) return false;

  const target = prescribed.find((p) => p.tier === "T1");
  if (!target) return false;
  const sets = session.sets ?? [];

  // Done as its home exercise: judged against that exercise's own prescription, as
  // completeWorkout judges it, not against the barbell lift's scheme and weight.
  const home = target.home;
  const performed = workingSetsFor(sets, target.exerciseId, "T1").map((set) => set.substituteExerciseId);
  const asHome = home != null && performed.every((id) => id === home.exerciseId);

  // The T1 slot as the program prescribed it, then as the user's structural, scheme and
  // per-set edits left it. The weight is left to the logged sets (with none logged it
  // is taken as prescribed), so weight per set and the ramp quick fill count exactly
  // as a plain session does.
  const slot: WorkoutPlan = [
    {
      exerciseId: target.exerciseId,
      ...(asHome ? { substituteExerciseId: home.exerciseId } : {}),
      tier: "T1",
      targetSets: asHome ? home.sets : target.sets,
      targetReps: asHome ? home.reps : target.reps,
      weight: asHome ? home.weight : target.weight,
      isAMRAP: false,
      isWarmUp: false,
      completedSets: 0,
    },
  ];
  const edits = (session.planEdits ?? []).filter((edit) => edit.kind !== "weight");
  const edited = applyPlanEdits(slot, edits).find(
    (entry) => entry.tier === "T1" && entry.exerciseId === target.exerciseId && !entry.isWarmUp
  );
  if (!edited) return false;
  const t1 = { ...edited, weight: slot[0].weight };

  if (asHome) {
    const homeTarget: VariantTarget = { weight: home.weight, sets: home.sets, reps: home.reps };
    return classifyVariantEntry(t1, homeTarget, prescribed, sets) === "program";
  }
  return classifyEntry(t1, prescribed, sets) === "program";
}

export interface RotationFold {
  /** The day that is due after every completed session. "A1" with no history. */
  dueTemplateId: string;
  /** Completed sessions oldest first, each with whether it advanced the rotation. */
  sessions: { session: RotationSession; counted: boolean }[];
}

/**
 * Walks the completed sessions in order of start time and works out, for each,
 * whether it advanced the rotation, and which day is due at the end. Nothing is
 * stored: editing or deleting an earlier session changes the answer for later ones
 * by construction. Unfinished sessions are ignored.
 *
 * @evidence off-program-credit
 */
export function foldRotation(completedWorkouts: RotationSession[]): RotationFold {
  const ordered = completedWorkouts
    .filter((workout) => workout.completedAt != null)
    .map((session, index) => ({ session, index, at: new Date(session.startedAt).getTime() }))
    .sort((a, b) => a.at - b.at || a.index - b.index);

  let dueTemplateId = "A1";
  const sessions: RotationFold["sessions"] = [];
  for (const { session } of ordered) {
    const counted = sessionCountsForRotation(session, dueTemplateId);
    if (counted) dueTemplateId = getNextWorkoutId(session.templateId);
    sessions.push({ session, counted });
  }
  return { dueTemplateId, sessions };
}
