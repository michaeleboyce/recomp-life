/**
 * Muscle volume with drop sets: a drop counts as part of a set, with a cap per working
 * set. Pure. Callers leave out sets that earn no volume for other reasons (pain skips)
 * before calling, as the app's volume tracking does.
 *
 * @evidence drop-set-evidence
 */

import { EXERCISES } from "@/lib/exercises";
import type { MuscleId } from "@/types";
import { DROP_SETS, MUSCLE_WEIGHTS } from "./coefficients";
import { timeOf } from "./estimate";
import type { StrengthSet } from "./types";

/**
 * Sets counted for volume, per set id. Working, ramp and back-off sets count 1, warm-ups
 * 0. Drops count DROP_SETS.volumeCredit each, in order, until the drops that follow one
 * set reach DROP_SETS.maxExtraSetsPerWorkingSet; later drops count 0. A drop's set is
 * found by following `dropOf` through earlier drops; drops with no known set share one
 * cap per exercise and session.
 *
 * @evidence drop-set-evidence
 */
export function volumeCredits(sets: readonly StrengthSet[]): Map<string, number> {
  const byId = new Map(sets.map((s) => [s.id, s]));
  const credits = new Map<string, number>();
  const used = new Map<string, number>();

  const groupOf = (drop: StrengthSet): string => {
    let current: StrengthSet | undefined = drop;
    const seen = new Set<string>();
    while (current && current.role === "drop") {
      if (!current.dropOf || seen.has(current.id)) break;
      seen.add(current.id);
      current = byId.get(current.dropOf);
    }
    return current && current.role !== "drop"
      ? `set:${current.id}`
      : `orphan:${drop.sessionId}:${drop.exerciseId}`;
  };

  const ordered = [...sets].sort(
    (a, b) => timeOf(a.date) - timeOf(b.date) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
  for (const set of ordered) {
    if (set.role === "warmup") {
      credits.set(set.id, 0);
    } else if (set.role !== "drop") {
      credits.set(set.id, 1);
    } else {
      const group = groupOf(set);
      const sofar = used.get(group) ?? 0;
      const credit = Math.max(0, Math.min(DROP_SETS.volumeCredit, DROP_SETS.maxExtraSetsPerWorkingSet - sofar));
      used.set(group, sofar + credit);
      credits.set(set.id, credit);
    }
  }
  return credits;
}

/**
 * Fractional sets per muscle: each set's volume credit, times MUSCLE_WEIGHTS.primary for
 * the exercise's primary muscles and MUSCLE_WEIGHTS.secondary for its secondary ones.
 *
 * @evidence drop-set-evidence
 */
export function muscleVolume(sets: readonly StrengthSet[]): Partial<Record<MuscleId, number>> {
  const credits = volumeCredits(sets);
  const volume: Partial<Record<MuscleId, number>> = {};
  for (const set of sets) {
    const credit = credits.get(set.id) ?? 0;
    const exercise = EXERCISES[set.exerciseId];
    if (!exercise || credit <= 0) continue;
    for (const m of exercise.primaryMuscles) volume[m] = (volume[m] ?? 0) + credit * MUSCLE_WEIGHTS.primary;
    for (const m of exercise.secondaryMuscles) volume[m] = (volume[m] ?? 0) + credit * MUSCLE_WEIGHTS.secondary;
  }
  return volume;
}
