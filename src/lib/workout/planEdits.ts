import { DEFAULT_ACCESSORY_WEIGHTS, EXERCISES } from "@/lib/exercises";
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
import { getPrescription } from "./prescription";
import { excludeWarmUps, isWorkingSet } from "./setSelectors";
import type { WorkoutExerciseState, WorkoutPlan } from "./types";
import { chooseHomeVariant, homePrescriptionOf, isVariantTier } from "./variant";

/** Tiers the program prescribes and progresses. */
const PROGRAM_TIERS: readonly Tier[] = ["T1", "T2", "T3"];

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
}

/**
 * What the program prescribes for each program lift (T1, T2, T3) of a day, from the
 * current lift states and before any edit. Stored on the session row at start. With
 * `home` (a session at home), each lift done as a home exercise also records that
 * exercise's own prescription (`PrescribedEntry.home`), exactly as the plan builds it.
 */
export function prescribedFor(
  template: WorkoutTemplate,
  liftStates: LiftState[],
  home?: HomePrescriptionContext
): PrescribedEntry[] {
  const byId = new Map(liftStates.map((ls) => [ls.exerciseId, ls]));
  const prescribed: PrescribedEntry[] = [];

  for (const templateEx of template.exercises) {
    if (!PROGRAM_TIERS.includes(templateEx.tier)) continue;
    const liftState = byId.get(templateEx.exerciseId);
    const { weight, sets, reps } = getPrescription(templateEx, liftState);
    const stage =
      templateEx.tier === "T1"
        ? liftState?.t1Stage
        : templateEx.tier === "T2"
          ? liftState?.t2Stage
          : undefined;
    const choice =
      home && isVariantTier(templateEx.tier)
        ? chooseHomeVariant({
            liftId: templateEx.exerciseId,
            tier: templateEx.tier,
            liftState,
            variantStates: home.variantStates,
            equipment: home.equipment,
            overrideId: home.overrides?.[templateEx.exerciseId],
          })
        : null;
    prescribed.push({
      exerciseId: templateEx.exerciseId,
      tier: templateEx.tier,
      weight,
      sets,
      reps,
      ...(stage ? { stage } : {}),
      ...(choice
        ? { home: homePrescriptionOf(choice, { sets: templateEx.sets, reps: templateEx.reps }) }
        : {}),
    });
  }

  return prescribed;
}

/** The edits that change which exercises are performed: swaps, removals and additions. */
export function structuralEdits(edits: PlanEdit[] | undefined): PlanEdit[] {
  return (edits ?? []).filter(
    (edit) => edit.kind === "swap" || edit.kind === "remove" || edit.kind === "add"
  );
}

/** A frozen copy of a plan's working entries (warm-ups are regenerated, not saved). */
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
    }));
}

/**
 * A frozen copy of what was performed in a session, from its logged sets: one entry
 * per exercise and tier in logging order, with the number of sets logged, the target
 * reps and the weight of the first set.
 */
export function snapshotOfSets(sets: SetLog[]): FavoriteSnapshotEntry[] {
  const entries = new Map<string, FavoriteSnapshotEntry>();
  for (const set of excludeWarmUps(sets)) {
    const key = `${set.exerciseId}|${set.tier}`;
    const entry = entries.get(key);
    if (entry) {
      entry.sets += 1;
      entry.isAMRAP = entry.isAMRAP || set.isAMRAP;
    } else {
      entries.set(key, {
        exerciseId: set.exerciseId,
        tier: set.tier,
        sets: 1,
        reps: set.targetReps,
        weight: set.weight,
        isAMRAP: set.isAMRAP,
      });
    }
  }
  return [...entries.values()];
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
