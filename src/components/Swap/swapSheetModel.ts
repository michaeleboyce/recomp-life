// The swap sheet's words and choices (W9 to W12), from the swap logic in `@/lib/swap`.
// Pure: no React, no database. The numbers and reasons all come from the lib; this file
// only lays them out and says what "Every time" writes.
import { weightUnit } from "@/components/SetPlan/setPlanModel";
import { EXERCISES } from "@/lib/exercises";
import { MUSCLE_LABELS } from "@/lib/muscles";
import { agoText, type SwapCandidate, type SwapHistory, type SwapPrescription, type SwapSet } from "@/lib/swap";
import { joinList, plural } from "@/lib/text";
import type { ExercisePreference, MuscleId, Tier, WorkoutLocation } from "@/types";

/** How many of the best candidates are shown as "Recommended"; the rest go under "All exercises". */
export const SWAP_RECOMMENDED_COUNT = 3;

const PROGRAM_TIERS: readonly Tier[] = ["T1", "T2", "T3"];

const nameOf = (id: string) => EXERCISES[id]?.name ?? id;
const lbs = (n: number) => String(Math.round(n * 100) / 100);

/**
 * What a candidate would be done at: "45 lbs × 3 × 10", "20 lbs a hand × 3 × 15",
 * "BW × 3 × 12" for bodyweight work, "Set your weight · 3 × 10" when no weight is known.
 * A program lift's last set taken to as many reps as possible reads "3 × 10+".
 */
export function prescriptionText(exerciseId: string, p: SwapPrescription, tier: Tier): string {
  const exercise = EXERCISES[exerciseId];
  const scheme = `${p.sets} × ${p.reps}${p.isAMRAP && PROGRAM_TIERS.includes(tier) ? "+" : ""}`;
  if (exercise?.type === "bodyweight" && !(p.weight > 0)) return `BW × ${scheme}`;
  if (!(p.weight > 0)) return `Set your weight · ${scheme}`;
  return `${lbs(p.weight)} ${weightUnit(exercise?.grip === "per_hand")} × ${scheme}`;
}

/** "Done 14 times, last 3 weeks ago" ("…, imported" when the latest came from another app); "Not done before". */
export function historyText(history: SwapHistory | undefined, now: Date): string {
  if (!history) return "Not done before";
  const base = `Done ${plural(history.timesDone, "time")}, last ${agoText(history.lastDone, now)}`;
  return history.imported ? `${base}, imported` : base;
}

/** The candidates split as the sheet lists them: the best few, then every other one. */
export function swapSections(candidates: readonly SwapCandidate[]): {
  recommended: SwapCandidate[];
  rest: SwapCandidate[];
} {
  return {
    recommended: candidates.slice(0, SWAP_RECOMMENDED_COUNT),
    rest: candidates.slice(SWAP_RECOMMENDED_COUNT),
  };
}

/** The parts added up, rounded to a tenth as the lib rounds the score. */
export function partsTotal(candidate: Pick<SwapCandidate, "parts">): number {
  return Math.round(candidate.parts.reduce((sum, p) => sum + p.points, 0) * 10) / 10 + 0;
}

/** "+40", "−8", "0": a part's points as the breakdown shows them. */
export function pointsText(points: number): string {
  if (points > 0) return `+${points}`;
  if (points < 0) return `−${Math.abs(points)}`;
  return "0";
}

const muscles = (ms: readonly MuscleId[]) => joinList(ms.map((m) => (MUSCLE_LABELS[m] ?? m).toLowerCase()));

/** A pair as the sheet shows it: each member's name and what of the original it covers. */
export function pairView(set: SwapSet): { ids: [string, string]; members: { exerciseId: string; name: string; covers: string }[] } {
  return {
    ids: [set.members[0].candidate.exerciseId, set.members[1].candidate.exerciseId],
    members: set.members.map((m) => ({
      exerciseId: m.candidate.exerciseId,
      name: nameOf(m.candidate.exerciseId),
      covers: m.covers.length > 0 ? `Covers ${muscles(m.covers)}` : "Covers none of its main muscles",
    })),
  };
}

/**
 * The picks after a tap on `id`. One at a time (the default): that one, or none when it
 * was already the pick. "Pick more than one": added at the end, or taken out.
 */
export function toggleSelection(selected: readonly string[], id: string, multi: boolean): string[] {
  if (selected.includes(id)) return selected.filter((s) => s !== id);
  return multi ? [...selected, id] : [id];
}

/** The candidates picked, in the order they were picked (the first takes the entry's place). */
export function picked(selected: readonly string[], candidates: readonly SwapCandidate[]): SwapCandidate[] {
  return selected.flatMap((id) => candidates.find((c) => c.exerciseId === id) ?? []);
}

/** The confirm button's words. */
export function confirmLabel(picks: readonly SwapCandidate[]): string {
  if (picks.length === 0) return "Pick an exercise";
  if (picks.length === 1) return `Swap in ${nameOf(picks[0].exerciseId)}`;
  return `Swap in ${picks.length} exercises`;
}

const PLACE: Record<WorkoutLocation, string> = { gym: "at the gym", home: "at home" };

/** One preference "Every time" writes, scoped to the workout's location. */
export interface PreferenceWrite {
  scope: WorkoutLocation;
  exerciseId: string;
  preference: ExercisePreference;
}

/**
 * What the "Every time" switch does for this swap, in words, and the preferences it
 * writes (`setExercisePreference`, scoped to the location). It is made of the existing
 * exercise preferences, so it does only what they do:
 *
 * - An accessory slot: the original is blocked at this location, so accessory selection
 *   never picks it there again, and each replacement is marked preferred there, so
 *   selection favours it (ACCESSORY_PREFERRED_WEIGHT). The switch reads "Every time".
 * - A T1, T2 or T3: the program always plans its own lift (the planner reads no
 *   preference for a program slot) and a program lift cannot be blocked out of its day,
 *   so the nearest honest thing is to mark each replacement preferred at this location:
 *   it then comes first when this lift is swapped (SWAP_PREFERRED_POINTS). The switch says
 *   that instead of promising a standing swap.
 */
export function everyTimeOption(
  tier: Tier,
  originalId: string,
  replacementIds: readonly string[],
  location: WorkoutLocation
): { label: string; detail: string; writes: PreferenceWrite[] } {
  const place = PLACE[location];
  const names = replacementIds.length > 0 ? joinList(replacementIds.map(nameOf)) : "the one you pick";
  const preferred: PreferenceWrite[] = replacementIds.map((exerciseId) => ({
    scope: location,
    exerciseId,
    preference: "preferred",
  }));
  const isAre = replacementIds.length > 1 ? "are" : "is";
  if (!PROGRAM_TIERS.includes(tier)) {
    return {
      label: `Every time ${place}`,
      detail: `${nameOf(originalId)} is left out ${place} and ${names} ${isAre} marked preferred there, so accessories ${place} lean to ${replacementIds.length > 1 ? "them" : "it"}. Change it in Exercises.`,
      writes: [{ scope: location, exerciseId: originalId, preference: "blocked" }, ...preferred],
    };
  }
  return {
    label: `Suggest first every time ${place}`,
    detail: `The program keeps ${nameOf(originalId)} on its day. ${names} ${isAre} marked preferred ${place}, so ${replacementIds.length > 1 ? "they come" : "it comes"} first when you swap it. Change it in Exercises.`,
    writes: preferred,
  };
}
