// What the accessory sheet lists (A8): swap alternatives for the same muscle, and the
// Add lists (For today, Your usual, By muscle, search). Read from today's scored list
// (`chooseAccessories` through the planning path), so every choice offered is one the
// app could have picked and comes with its reasons. Pure; no React.
import type { AccessoryCandidate, ChooseAccessoriesResult } from "@/lib/accessories/index";
import { EXERCISES } from "@/lib/exercises";
import { MUSCLE_LABELS } from "@/lib/muscles";
import type { MuscleId } from "@/types";

/** How many alternatives a swap offers. */
export const SWAP_ALTERNATIVES = 3;
/** How many the "For today" list shows. */
export const FOR_TODAY_COUNT = 6;

/** Today's scored list, best first: the picks in the order chosen, then the rest. */
export function rankedCandidates(choice: ChooseAccessoriesResult | null | undefined): AccessoryCandidate[] {
  return choice ? [...choice.picks, ...choice.others] : [];
}

/** The muscle an exercise is filed under: its first primary muscle. */
export function mainMuscleOf(exerciseId: string): MuscleId | null {
  return EXERCISES[exerciseId]?.primaryMuscles[0] ?? null;
}

/** "Biceps", "Side delts": a muscle for a chip. */
export function muscleChip(muscle: MuscleId | null): string | null {
  if (!muscle) return null;
  const label = MUSCLE_LABELS[muscle];
  return label.charAt(0) + label.slice(1).toLowerCase();
}

/**
 * Up to SWAP_ALTERNATIVES other exercises for an accessory's main muscle (or any of
 * its primary muscles), best first, none already in the workout.
 */
export function swapAlternatives(
  exerciseId: string,
  ranked: readonly AccessoryCandidate[],
  inPlan: readonly string[]
): AccessoryCandidate[] {
  const primaries = EXERCISES[exerciseId]?.primaryMuscles ?? [];
  const main = primaries[0];
  const free = ranked.filter((c) => c.exerciseId !== exerciseId && !inPlan.includes(c.exerciseId));
  const same = free.filter((c) => mainMuscleOf(c.exerciseId) === main);
  const near = free.filter(
    (c) => !same.includes(c) && (EXERCISES[c.exerciseId]?.primaryMuscles ?? []).some((m) => primaries.includes(m))
  );
  return [...same, ...near].slice(0, SWAP_ALTERNATIVES);
}

export interface AddLists {
  forToday: AccessoryCandidate[];
  usual: AccessoryCandidate[];
  byMuscle: { muscle: MuscleId; label: string; items: AccessoryCandidate[] }[];
}

/**
 * The Add lists: "For today" (the best not yet in the workout, with their reasons),
 * "Your usual" (those you have done, most habitual first) and "By muscle" (every one,
 * grouped by its main muscle, groups in the library's order).
 */
export function addLists(ranked: readonly AccessoryCandidate[], inPlan: readonly string[]): AddLists {
  const free = ranked.filter((c) => !inPlan.includes(c.exerciseId));
  const usual = free
    .filter((c) => c.parts.habit > 0)
    .sort((a, b) => b.parts.habit - a.parts.habit || ranked.indexOf(a) - ranked.indexOf(b));
  const groups = new Map<MuscleId, AccessoryCandidate[]>();
  for (const c of [...free].sort((a, b) => nameOf(a).localeCompare(nameOf(b)))) {
    const muscle = mainMuscleOf(c.exerciseId);
    if (!muscle) continue;
    groups.set(muscle, [...(groups.get(muscle) ?? []), c]);
  }
  const order = Object.keys(MUSCLE_LABELS) as MuscleId[];
  const byMuscle = [...groups.entries()]
    .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
    .map(([muscle, items]) => ({ muscle, label: muscleChip(muscle)!, items }));
  return { forToday: free.slice(0, FOR_TODAY_COUNT), usual, byMuscle };
}

const nameOf = (c: AccessoryCandidate) => EXERCISES[c.exerciseId]?.name ?? c.exerciseId;

/** The ones whose name or muscles match every word of `query`, best first. */
export function searchCandidates(
  ranked: readonly AccessoryCandidate[],
  inPlan: readonly string[],
  query: string
): AccessoryCandidate[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return ranked.filter((c) => {
    if (inPlan.includes(c.exerciseId)) return false;
    const exercise = EXERCISES[c.exerciseId];
    const text = [exercise?.name ?? c.exerciseId, ...(exercise?.primaryMuscles ?? []).map((m) => MUSCLE_LABELS[m])]
      .join(" ")
      .toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
