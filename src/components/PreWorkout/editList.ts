import { DEFAULT_ACCESSORY_WEIGHTS } from "@/lib/exercises";
import type { PlanEdit, Tier } from "@/types";

/**
 * Keeps the list of pre-workout edits minimal. An edit names an entry as it stands
 * when applied, so an edit that follows a swap names the replacement. Every function
 * returns a new list; none of them mutates its input.
 */

type Scheme = { sets: number; reps: number };
type NewAccessory = Scheme & { weight: number; isAMRAP: boolean };

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
  (edit.kind === "scheme" || edit.kind === "weight") &&
  edit.exerciseId === exerciseId &&
  edit.tier === tier;

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
  if (tier === "accessory") {
    const at = findAdd(edits, exerciseId);
    if (at !== -1) return edits.map((e, i) => (i === at ? { ...e, ...scheme } as PlanEdit : e));
  }
  return [
    ...edits.filter((e) => !(e.kind === "scheme" && isFollowUp(e, exerciseId, tier))),
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
  if (tier === "accessory") {
    const at = findAdd(edits, exerciseId);
    if (at !== -1) {
      return edits.map((e, i) => (i === at ? ({ ...e, weight: clamped } as PlanEdit) : e));
    }
  }
  return [
    ...edits.filter((e) => !(e.kind === "weight" && isFollowUp(e, exerciseId, tier))),
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
      if (e.kind === "weight" && isFollowUp(e, exerciseId, tier)) return [];
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
