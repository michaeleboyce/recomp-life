import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { DEFAULT_ACCESSORY_WEIGHTS, EXERCISES } from "@/lib/exercises";
import type { StrengthSet } from "@/lib/strength";
import type {
  EquipmentProfile,
  FavoriteSnapshotEntry,
  LiftState,
  PlanEdit,
  PlannedSet,
  PrescribedEntry,
  SetLog,
  Tier,
  VariantState,
  WorkoutTemplate,
} from "@/types";
import { prescriptionOf, resolveLifts } from "./liftResolution";
import { excludeWarmUps, isWorkingSet } from "./setSelectors";
import type { WorkoutExerciseState, WorkoutPlan } from "./types";

function isWorkingEntry(entry: WorkoutExerciseState, exerciseId: string, tier: Tier): boolean {
  return !entry.isWarmUp && entry.exerciseId === exerciseId && entry.tier === tier;
}

function isWarmUpOf(entry: WorkoutExerciseState, exerciseId: string): boolean {
  return entry.isWarmUp && entry.exerciseId === exerciseId;
}

/**
 * A plan with the user's edits applied, in order. Returns a new plan; an edit that
 * names an entry the plan does not have is ignored, and so is an unknown exercise.
 *
 * - `swap` replaces the working entry with a different exercise in the same slot. The
 *   replacement keeps the slot's tier, sets and reps, starts at its default weight
 *   (0 when it has none) and drops the original's generated warm-ups and any home
 *   substitute. A swap is not a home substitute (`overrides`): a substitute is the
 *   program lift on different equipment and still credits it, a swap is a different
 *   exercise and is logged only. When both name one exercise the swap wins.
 * - `remove` drops the working entry and its warm-ups.
 * - `add` appends an accessory entry, replacing an accessory of the same exercise.
 * - `scheme` sets the working entry's sets and reps.
 * - `weight` sets the working entry's weight. On a home substitute `originalWeight`
 *   (the program weight it stands for) is scaled by the same ratio, so a lighter
 *   substitute reads as lighter than prescribed. Warm-ups are left as generated.
 * - `setWeights` gives each set its own weight and rep target (`perSet`, a ramp or a
 *   back-off set among them): `targetSets` becomes the number of sets, `weight` and
 *   `targetReps` those of the heaviest working set, and `originalWeight` is scaled as for
 *   `weight`. A later `scheme` or `weight` edit makes the sets uniform again.
 */
export function applyPlanEdits(plan: WorkoutPlan, edits: PlanEdit[] | undefined): WorkoutPlan {
  let next: WorkoutPlan = plan.map((entry) => ({ ...entry }));

  for (const edit of edits ?? []) {
    switch (edit.kind) {
      case "swap": {
        if (!EXERCISES[edit.replacementId]) break;
        const index = next.findIndex((e) => isWorkingEntry(e, edit.exerciseId, edit.tier));
        if (index === -1) break;
        const slot = next[index];
        next[index] = {
          exerciseId: edit.replacementId,
          tier: slot.tier,
          targetSets: slot.targetSets,
          targetReps: slot.targetReps,
          weight: DEFAULT_ACCESSORY_WEIGHTS[edit.replacementId] ?? 0,
          isAMRAP: slot.isAMRAP,
          isWarmUp: false,
          completedSets: slot.completedSets,
        };
        next = next.filter((e) => !isWarmUpOf(e, edit.exerciseId));
        break;
      }
      case "remove": {
        if (!next.some((e) => isWorkingEntry(e, edit.exerciseId, edit.tier))) break;
        next = next.filter(
          (e) => !isWorkingEntry(e, edit.exerciseId, edit.tier) && !isWarmUpOf(e, edit.exerciseId)
        );
        break;
      }
      case "add": {
        if (!EXERCISES[edit.exerciseId]) break;
        next = next.filter((e) => !isWorkingEntry(e, edit.exerciseId, "accessory"));
        next.push({
          exerciseId: edit.exerciseId,
          tier: "accessory",
          targetSets: edit.sets,
          targetReps: edit.reps,
          weight: edit.weight,
          isAMRAP: edit.isAMRAP,
          isWarmUp: false,
          completedSets: 0,
          ...(edit.replaces ? { replaces: { ...edit.replaces } } : {}),
        });
        break;
      }
      case "scheme": {
        const entry = next.find((e) => isWorkingEntry(e, edit.exerciseId, edit.tier));
        if (!entry) break;
        entry.targetSets = edit.sets;
        entry.targetReps = edit.reps;
        delete entry.perSet;
        break;
      }
      case "weight": {
        const entry = next.find((e) => isWorkingEntry(e, edit.exerciseId, edit.tier));
        if (!entry) break;
        if (entry.originalWeight != null && entry.weight > 0) {
          entry.originalWeight = Math.round((entry.originalWeight * edit.weight) / entry.weight);
        }
        entry.weight = edit.weight;
        delete entry.perSet;
        break;
      }
      case "setWeights": {
        const entry = next.find((e) => isWorkingEntry(e, edit.exerciseId, edit.tier));
        if (!entry || edit.sets.length === 0) break;
        const top = heaviestWorkingSet(edit.sets);
        if (entry.originalWeight != null && entry.weight > 0) {
          entry.originalWeight = Math.round((entry.originalWeight * top.weight) / entry.weight);
        }
        entry.perSet = edit.sets.map((set) => ({ ...set }));
        entry.targetSets = edit.sets.length;
        entry.weight = top.weight;
        entry.targetReps = top.reps;
        break;
      }
    }
  }

  return next;
}

/** The heaviest working set of a per-set list (of every set when none is a working set). */
export function heaviestWorkingSet(sets: readonly PlannedSet[]): PlannedSet {
  const working = sets.filter(isWorkingSet);
  const pool = working.length > 0 ? working : sets;
  return pool.reduce((top, set) => (set.weight > top.weight ? set : top), pool[0]);
}

/**
 * The working sets an entry prescribes: its per-set list's working sets when it has one
 * (ramp, back-off and drop sets are extra), otherwise `targetSets`.
 */
export function workingTargetSets(
  entry: Pick<WorkoutExerciseState, "targetSets" | "perSet">
): number {
  return entry.perSet ? entry.perSet.filter(isWorkingSet).length : entry.targetSets;
}

/** A session at home: what `prescribedFor` needs to record each lift's home exercise. */
export interface HomePrescriptionContext {
  variantStates: VariantState[];
  equipment: EquipmentProfile;
  /** Home substitutes picked on Configure (template exerciseId -> substitute id). */
  overrides?: Record<string, string>;
  /** Every logged set as strength evidence: seeds a variant never used as the plan does (H3). */
  strengthSets?: readonly StrengthSet[];
}

/**
 * What the program prescribes for each program lift (T1, T2, T3) of a day, from the
 * given lift states and before any edit: `prescriptionOf(resolveLifts(...))`, the same
 * resolution the plan is built from. With `home` (a session at home), each lift done as
 * a home exercise also records that exercise's own prescription (`PrescribedEntry.home`).
 * A session about to start records `planWorkoutStart(...).prescribed` instead, which is
 * this after re-entry.
 */
export function prescribedFor(
  template: WorkoutTemplate,
  liftStates: LiftState[],
  home?: HomePrescriptionContext
): PrescribedEntry[] {
  return prescriptionOf(
    resolveLifts({
      template,
      liftStates,
      location: home ? "home" : "gym",
      // At the gym nothing is converted, so the equipment is not read.
      equipment: home?.equipment ?? DEFAULT_USER_PROFILE.settings.equipment,
      ...(home
        ? {
            variantStates: home.variantStates,
            ...(home.overrides ? { overrides: home.overrides } : {}),
            ...(home.strengthSets ? { strengthSets: home.strengthSets } : {}),
          }
        : {}),
    })
  );
}

/** The edits that change which exercises are performed: swaps, removals and additions. */
export function structuralEdits(edits: PlanEdit[] | undefined): PlanEdit[] {
  return (edits ?? []).filter(
    (edit) => edit.kind === "swap" || edit.kind === "remove" || edit.kind === "add"
  );
}

/**
 * A frozen copy of a plan's working entries (warm-ups are regenerated, not saved). An
 * entry done as a home exercise records it (`performedAs`): its weight is that
 * exercise's, as lifted.
 */
export function snapshotOfPlan(plan: WorkoutPlan): FavoriteSnapshotEntry[] {
  return plan
    .filter((entry) => !entry.isWarmUp)
    .map((entry) => ({
      exerciseId: entry.exerciseId,
      tier: entry.tier,
      sets: entry.targetSets,
      reps: entry.targetReps,
      weight: entry.weight,
      isAMRAP: entry.isAMRAP,
      ...(entry.substituteExerciseId ? { performedAs: entry.substituteExerciseId } : {}),
    }));
}

/**
 * A frozen copy of what was performed in a session, from its logged sets: one entry
 * per exercise and tier in logging order, from its working sets only (ramp, back-off
 * and drop sets are extra and are not saved): their number, and the weight and target
 * reps of the heaviest of them, with the home exercise when it was substituted. An
 * entry with no working set logged keeps its other sets the same way.
 */
export function snapshotOfSets(sets: SetLog[]): FavoriteSnapshotEntry[] {
  const groups = new Map<string, SetLog[]>();
  for (const set of excludeWarmUps(sets)) {
    const key = `${set.exerciseId}|${set.tier}`;
    groups.set(key, [...(groups.get(key) ?? []), set]);
  }
  return [...groups.values()].map((group) => {
    const working = group.filter(isWorkingSet);
    const pool = working.length > 0 ? working : group;
    const top = pool.reduce((best, set) => (set.weight > best.weight ? set : best), pool[0]);
    const performed = pool.find((set) => set.isSubstituted && set.substituteExerciseId);
    return {
      exerciseId: top.exerciseId,
      tier: top.tier,
      sets: pool.length,
      reps: top.targetReps,
      weight: top.weight,
      isAMRAP: pool.some((set) => set.isAMRAP),
      ...(performed?.substituteExerciseId ? { performedAs: performed.substituteExerciseId } : {}),
    };
  });
}

/**
 * The edits that reproduce a favourite exactly as saved: its structural edits followed
 * by a `scheme` and a `weight` edit for every snapshot entry.
 */
export function pinSnapshot(
  structural: PlanEdit[],
  snapshot: FavoriteSnapshotEntry[]
): PlanEdit[] {
  const pins: PlanEdit[] = [];
  for (const entry of snapshot) {
    const { exerciseId, tier } = entry;
    pins.push({ kind: "scheme", exerciseId, tier, sets: entry.sets, reps: entry.reps });
    pins.push({ kind: "weight", exerciseId, tier, weight: entry.weight });
  }
  return [...structuralEdits(structural), ...pins];
}
