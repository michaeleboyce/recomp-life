// One for many (W9): pairs of exercises that together cover what one did, and the plan
// edits that put one or more replacements in a workout. Pure and deterministic.
// Spec: docs/plans/2026-11-18-future-workouts-and-swaps-design.md.
import { DEFAULT_ACCESSORY_WEIGHTS, EXERCISES } from "@/lib/exercises";
import type { MuscleId, PlanEdit, Tier } from "@/types";
import { recommendSwaps, type SwapCandidate, type SwapContext } from "./recommend";

/** How many pairs are offered at most. */
export const SWAP_SET_LIMIT = 3;
/**
 * Taken off a pair's combined score for each of the original's main muscles both
 * members cover: two exercises for one muscle are less of a pair than two that split
 * the work.
 */
export const SWAP_PAIR_OVERLAP_PENALTY = 10;

/** One member of a pair, with the original's main muscles it covers. */
export interface SwapSetMember {
  candidate: SwapCandidate;
  /** The original's main muscles this member covers (`candidate.coverage.primary`). */
  covers: MuscleId[];
}

/** Two exercises that together cover every main muscle of the original. */
export interface SwapSet {
  /** Higher score first (ties by name). */
  members: [SwapSetMember, SwapSetMember];
  /** The members' scores added, less SWAP_PAIR_OVERLAP_PENALTY for each muscle in `overlap`. */
  score: number;
  /** The original's main muscles both members cover. */
  overlap: MuscleId[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const nameOf = (c: SwapCandidate) => EXERCISES[c.exerciseId]?.name ?? c.exerciseId;
const byScoreThenName = (a: SwapCandidate, b: SwapCandidate) =>
  b.score - a.score || nameOf(a).localeCompare(nameOf(b)) || (a.exerciseId < b.exerciseId ? -1 : 1);

/** True when some single candidate covers every main muscle of the original. */
export function singleCovers(candidates: readonly SwapCandidate[]): boolean {
  return candidates.some((c) => c.coverage.missingPrimary.length === 0);
}

/**
 * Pairs of exercises that together cover every main muscle of `exerciseId`, best first,
 * at most SWAP_SET_LIMIT. Offered when no single candidate covers them all, or always
 * with `force` (the user asked for more than one). A pair's members each come from
 * `recommendSwaps` with the same context (blocked, gym-only at home and excluded
 * exercises never appear), and without `force` each covers a main muscle the other
 * misses. Ranked by combined score with overlap penalised (`SwapSet.score`), ties by the
 * members' names.
 *
 * @evidence swap-recommendation
 */
export function recommendSwapSets(
  exerciseId: string,
  context: SwapContext,
  options: { force?: boolean; candidates?: readonly SwapCandidate[] } = {}
): SwapSet[] {
  const original = EXERCISES[exerciseId];
  if (!original) return [];
  const candidates = options.candidates ?? recommendSwaps(exerciseId, context);
  if (!options.force && singleCovers(candidates)) return [];

  const need = original.primaryMuscles;
  const sets: SwapSet[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const [a, b] = [candidates[i], candidates[j]].sort(byScoreThenName);
      const covered = new Set([...a.coverage.primary, ...b.coverage.primary]);
      if (!need.every((m) => covered.has(m))) continue;
      const overlap = need.filter((m) => a.coverage.primary.includes(m) && b.coverage.primary.includes(m));
      if (!options.force) {
        const adds = (x: SwapCandidate, y: SwapCandidate) => x.coverage.primary.some((m) => !y.coverage.primary.includes(m));
        if (!adds(a, b) || !adds(b, a)) continue;
      }
      sets.push({
        members: [
          { candidate: a, covers: [...a.coverage.primary] },
          { candidate: b, covers: [...b.coverage.primary] },
        ],
        score: round1(a.score + b.score - SWAP_PAIR_OVERLAP_PENALTY * overlap.length) + 0,
        overlap,
      });
    }
  }
  return sets
    .sort(
      (x, y) =>
        y.score - x.score ||
        nameOf(x.members[0].candidate).localeCompare(nameOf(y.members[0].candidate)) ||
        nameOf(x.members[1].candidate).localeCompare(nameOf(y.members[1].candidate))
    )
    .slice(0, SWAP_SET_LIMIT);
}

/** A replacement as the edits need it: the exercise and what it is done at. */
export type SwapReplacement = Pick<SwapCandidate, "exerciseId" | "prescription">;

/** The `add` edit that appends a replacement at its prescription. */
export function replacementAddEdit(replacement: SwapReplacement): Extract<PlanEdit, { kind: "add" }> {
  const { exerciseId, prescription } = replacement;
  return {
    kind: "add",
    exerciseId,
    sets: prescription.sets,
    reps: prescription.reps,
    weight: prescription.weight,
    isAMRAP: prescription.isAMRAP,
  };
}

/**
 * The plan edits that replace the entry (`original`, `tier`) with one or more exercises,
 * in order, before a workout starts: a `swap` for the first (in the entry's place, at its
 * tier), then a `weight` edit when its prescribed weight is not what the swap starts it
 * at (`DEFAULT_ACCESSORY_WEIGHTS`, else 0), and for an accessory entry a `scheme` edit
 * to its own sets and reps (a T1, T2 or T3 keeps the entry's scheme, which the swap
 * keeps). Every further replacement is an `add` at its prescription. No stored format
 * changes: resume and the rebuild read these as any other edits. Empty for no
 * replacement.
 */
export function swapEdits(original: string, tier: Tier, replacements: readonly SwapReplacement[]): PlanEdit[] {
  if (replacements.length === 0) return [];
  const [first, ...rest] = replacements;
  const edits: PlanEdit[] = [{ kind: "swap", exerciseId: original, tier, replacementId: first.exerciseId }];
  if (tier === "accessory") {
    edits.push({
      kind: "scheme",
      exerciseId: first.exerciseId,
      tier,
      sets: first.prescription.sets,
      reps: first.prescription.reps,
    });
  }
  if (first.prescription.weight !== (DEFAULT_ACCESSORY_WEIGHTS[first.exerciseId] ?? 0)) {
    edits.push({ kind: "weight", exerciseId: first.exerciseId, tier, weight: first.prescription.weight });
  }
  for (const replacement of rest) edits.push(replacementAddEdit(replacement));
  return edits;
}
