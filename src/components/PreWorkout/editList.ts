import { plannedSetsOf } from "@/components/ActiveWorkout/setPlan";
import { roundToStep } from "@/lib/dbConversion";
import { DEFAULT_ACCESSORY_WEIGHTS } from "@/lib/exercises";
import { heaviestWorkingSet } from "@/lib/workout/planEdits";
import { isWorkingSet } from "@/lib/workout/setSelectors";
import type { PlanEdit, PlannedSet, Tier } from "@/types";

export { plannedSetsOf };

/**
 * Keeps the list of pre-workout edits minimal. An edit names an entry as it stands
 * when applied, so an edit that follows a swap names the replacement. Every function
 * returns a new list; none of them mutates its input.
 */

type Scheme = { sets: number; reps: number };
type NewAccessory = Scheme & {
  weight: number;
  isAMRAP: boolean;
  /** A stand-in for a program lift swapped out (`PlanEdit` add's `replaces`), kept as is. */
  replaces?: { exerciseId: string; tier: Tier };
};

const keyOf = (exerciseId: string, tier: Tier) => `${exerciseId}|${tier}`;

/** The entry an edit changes, as it stands when the edit is applied. */
function targetKey(edit: PlanEdit): string {
  switch (edit.kind) {
    case "add":
      return keyOf(edit.exerciseId, "accessory");
    case "swap":
      return keyOf(edit.replacementId, edit.tier);
    default:
      return keyOf(edit.exerciseId, edit.tier);
  }
}

/** The entries the edits touch (swaps count as their replacement). */
export function editedKeys(edits: PlanEdit[]): Set<string> {
  return new Set(edits.map(targetKey));
}

const isFollowUp = (edit: PlanEdit, exerciseId: string, tier: Tier) =>
  (edit.kind === "scheme" || edit.kind === "weight" || edit.kind === "setWeights") &&
  edit.exerciseId === exerciseId &&
  edit.tier === tier;

const isSetWeightsOf = (edit: PlanEdit, exerciseId: string, tier: Tier) =>
  edit.kind === "setWeights" && edit.exerciseId === exerciseId && edit.tier === tier;

const findAdd = (edits: PlanEdit[], exerciseId: string) =>
  edits.findIndex((e) => e.kind === "add" && e.exerciseId === exerciseId);

const findSwapInto = (edits: PlanEdit[], exerciseId: string, tier: Tier) =>
  edits.findIndex(
    (e) => e.kind === "swap" && e.replacementId === exerciseId && e.tier === tier
  );

const clampCount = (n: number) => Math.max(1, Math.round(n));

export function schemeEdit(
  edits: PlanEdit[],
  exerciseId: string,
  tier: Tier,
  sets: number,
  reps: number
): PlanEdit[] {
  const scheme = { sets: clampCount(sets), reps: clampCount(reps) };
  // Sets and reps for the whole entry make its sets uniform again.
  const list = edits.filter((e) => !isSetWeightsOf(e, exerciseId, tier));
  if (tier === "accessory") {
    const at = findAdd(list, exerciseId);
    if (at !== -1) return list.map((e, i) => (i === at ? { ...e, ...scheme } as PlanEdit : e));
  }
  return [
    ...list.filter((e) => !(e.kind === "scheme" && isFollowUp(e, exerciseId, tier))),
    { kind: "scheme", exerciseId, tier, ...scheme },
  ];
}

export function weightEdit(
  edits: PlanEdit[],
  exerciseId: string,
  tier: Tier,
  weight: number
): PlanEdit[] {
  const clamped = Math.max(0, weight);
  // One weight for the whole entry makes its sets uniform again.
  const list = edits.filter((e) => !isSetWeightsOf(e, exerciseId, tier));
  if (tier === "accessory") {
    const at = findAdd(list, exerciseId);
    if (at !== -1) {
      return list.map((e, i) => (i === at ? ({ ...e, weight: clamped } as PlanEdit) : e));
    }
  }
  return [
    ...list.filter((e) => !(e.kind === "weight" && isFollowUp(e, exerciseId, tier))),
    { kind: "weight", exerciseId, tier, weight: clamped },
  ];
}

export function addEdit(edits: PlanEdit[], exerciseId: string, accessory: NewAccessory): PlanEdit[] {
  return [
    ...edits.filter((e) => !(e.kind === "add" && e.exerciseId === exerciseId)),
    {
      kind: "add",
      exerciseId,
      sets: clampCount(accessory.sets),
      reps: clampCount(accessory.reps),
      weight: Math.max(0, accessory.weight),
      isAMRAP: accessory.isAMRAP,
      ...(accessory.replaces ? { replaces: accessory.replaces } : {}),
    },
  ];
}

export function removeEdit(edits: PlanEdit[], exerciseId: string, tier: Tier): PlanEdit[] {
  const added = tier === "accessory" ? findAdd(edits, exerciseId) : -1;
  if (added !== -1) {
    return edits.filter((e, i) => i !== added && !isFollowUp(e, exerciseId, tier));
  }
  const swapAt = findSwapInto(edits, exerciseId, tier);
  if (swapAt !== -1) {
    const swap = edits[swapAt] as Extract<PlanEdit, { kind: "swap" }>;
    // The slot was filled by a swap: removing it removes the original's slot.
    return edits.flatMap((e, i): PlanEdit[] => {
      if (i === swapAt) return [{ kind: "remove", exerciseId: swap.exerciseId, tier }];
      return isFollowUp(e, exerciseId, tier) ? [] : [e];
    });
  }
  return [
    ...edits.filter((e) => !isFollowUp(e, exerciseId, tier)),
    { kind: "remove", exerciseId, tier },
  ];
}

export function swapEdit(
  edits: PlanEdit[],
  exerciseId: string,
  tier: Tier,
  replacementId: string
): PlanEdit[] {
  if (tier === "accessory") {
    const at = findAdd(edits, exerciseId);
    if (at !== -1) {
      const old = edits[at] as Extract<PlanEdit, { kind: "add" }>;
      const rest = edits.filter((_, i) => i !== at && !isFollowUp(edits[i], exerciseId, tier));
      return addEdit(rest, replacementId, {
        sets: old.sets,
        reps: old.reps,
        weight: DEFAULT_ACCESSORY_WEIGHTS[replacementId] ?? 0,
        isAMRAP: old.isAMRAP,
        ...(old.replaces ? { replaces: old.replaces } : {}),
      });
    }
  }

  const swapAt = findSwapInto(edits, exerciseId, tier);
  if (swapAt !== -1) {
    const swap = edits[swapAt] as Extract<PlanEdit, { kind: "swap" }>;
    const back = replacementId === swap.exerciseId;
    // The new exercise starts at its own default weight; the scheme carries over.
    return edits.flatMap((e, i): PlanEdit[] => {
      if (i === swapAt) return back ? [] : [{ ...swap, replacementId }];
      if ((e.kind === "weight" || e.kind === "setWeights") && isFollowUp(e, exerciseId, tier)) {
        return [];
      }
      if (e.kind === "scheme" && isFollowUp(e, exerciseId, tier)) {
        return [{ ...e, exerciseId: replacementId }];
      }
      return [e];
    });
  }

  return [
    ...edits.filter((e) => !isFollowUp(e, exerciseId, tier)),
    { kind: "swap", exerciseId, tier, replacementId },
  ];
}

/**
 * Lays several edits on the list in order, each through its own function above (so a
 * swap of a swapped entry re-points the one swap, and a follow-up replaces an earlier
 * one): how a swap's edits (`swapEdits` in `@/lib/swap`) are applied before a workout.
 */
export function withEdits(edits: PlanEdit[], next: readonly PlanEdit[]): PlanEdit[] {
  return next.reduce<PlanEdit[]>((list, edit) => {
    switch (edit.kind) {
      case "swap":
        return swapEdit(list, edit.exerciseId, edit.tier, edit.replacementId);
      case "scheme":
        return schemeEdit(list, edit.exerciseId, edit.tier, edit.sets, edit.reps);
      case "weight":
        return weightEdit(list, edit.exerciseId, edit.tier, edit.weight);
      case "add":
        return addEdit(list, edit.exerciseId, edit);
      case "remove":
        return removeEdit(list, edit.exerciseId, edit.tier);
      case "setWeights":
        return setWeightsEdit(list, edit.exerciseId, edit.tier, edit.sets);
    }
  }, edits);
}

/**
 * Gives each set of an entry its own weight and rep target (a `setWeights` edit),
 * replacing an earlier one for the entry; a working set is stored without a role.
 * `null` (or no sets) takes the per-set edit away, so the entry is back to the sets,
 * reps and weight it had before (the program's, or an earlier scheme or weight edit).
 */
export function setWeightsEdit(
  edits: PlanEdit[],
  exerciseId: string,
  tier: Tier,
  sets: PlannedSet[] | null
): PlanEdit[] {
  const rest = edits.filter((e) => !isSetWeightsOf(e, exerciseId, tier));
  if (!sets || sets.length === 0) return rest;
  return [
    ...rest,
    {
      kind: "setWeights",
      exerciseId,
      tier,
      sets: sets.map((set) => ({
        weight: Math.max(0, set.weight),
        reps: clampCount(set.reps),
        ...(set.role && set.role !== "work" ? { role: set.role } : {}),
      })),
    },
  ];
}

/**
 * The shares of the working weight the "Ramp up" quick fill leads in with, lightest
 * first, each at the working reps. A convenience for filling the per-set editor, not a
 * coaching rule: the sets are the lifter's to change, and ramp sets never decide a pass.
 */
export const RAMP_UP_FRACTIONS = [0.8, 0.9] as const;

/** The share of the working weight the "Back-off set" quick fill adds, at the working reps. */
export const BACK_OFF_FRACTION = 0.8;

/**
 * The sets with a ramp up to the working weight in front: one set per
 * `RAMP_UP_FRACTIONS` share of the heaviest working set, rounded to `step`, at its reps.
 * Any ramp sets already there are replaced. A ramp set that would not be lighter than
 * the working weight, or would be lighter than `min` (the empty bar), is left out.
 */
export function rampUpSets(sets: PlannedSet[], step: number, min = 0): PlannedSet[] {
  const rest = sets.filter((set) => set.role !== "ramp");
  if (rest.length === 0) return sets;
  const top = heaviestWorkingSet(rest);
  const ramp: PlannedSet[] = [];
  for (const share of RAMP_UP_FRACTIONS) {
    const weight = roundToStep(top.weight * share, step);
    if (weight >= top.weight || weight < min || weight <= 0) continue;
    if (ramp.some((set) => set.weight === weight)) continue;
    ramp.push({ weight, reps: top.reps, role: "ramp" });
  }
  return [...ramp, ...rest];
}

/**
 * The sets with one more back-off set after them: `BACK_OFF_FRACTION` of the heaviest
 * working set, rounded to `step` and lighter than it (never below `min`), at its reps.
 */
export function addBackOffSet(sets: PlannedSet[], step: number, min = 0): PlannedSet[] {
  if (sets.length === 0) return sets;
  const top = heaviestWorkingSet(sets);
  let weight = roundToStep(top.weight * BACK_OFF_FRACTION, step);
  if (weight >= top.weight) weight = top.weight - step;
  return [...sets, { weight: Math.max(min, weight, 0), reps: top.reps, role: "backoff" }];
}

/** The 1-based numbers of the working sets: the ones pass or fail is judged on. */
export function workingSetNumbers(sets: readonly PlannedSet[]): number[] {
  return sets.flatMap((set, i) => (isWorkingSet(set) ? [i + 1] : []));
}
