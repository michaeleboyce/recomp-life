/**
 * A strength trend per muscle from every exercise that works it. Pure.
 *
 * Each exercise is measured against its own earlier sessions (its session strength ÷ a
 * reference), so exercises with very different loads can be averaged. An exercise that
 * appears after the muscle already has a trend joins at the trend's current level: only
 * its later changes move the trend. That keeps a home exercise started mid-way from
 * reading as a jump or a drop.
 *
 * @evidence strength-pooling
 */

import { EXERCISES } from "@/lib/exercises";
import type { MuscleId } from "@/types";
import { MUSCLE_INDEX, MUSCLE_WEIGHTS } from "./coefficients";
import { sessionEstimates } from "./estimate";
import type { SessionEstimate, StrengthSet } from "./types";

const DAY_MS = 86_400_000;

export interface MuscleIndexContributor {
  exerciseId: string;
  /** MUSCLE_WEIGHTS.primary or .secondary. */
  weight: number;
  /** The exercise's latest session against its reference, on the index scale. */
  relative: number;
}

export interface MuscleIndexPoint {
  date: Date;
  /** MUSCLE_INDEX.base at the muscle's first estimate; one decimal. */
  index: number;
  contributors: MuscleIndexContributor[];
}

export type MuscleStrengthIndex = Partial<Record<MuscleId, MuscleIndexPoint[]>>;

const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * The index for every muscle that some exercise with estimates works as a primary
 * (weight MUSCLE_WEIGHTS.primary) or secondary (MUSCLE_WEIGHTS.secondary) muscle. One
 * point per instant at which a contributing session happened, oldest first. An exercise
 * not done for MUSCLE_INDEX.staleAfterDays leaves the average until it is done again
 * (it keeps its reference). Uses each session's `strength`, so drops count as they do in
 * the strength estimate.
 *
 * @evidence strength-pooling
 */
export function muscleStrengthIndex(sets: readonly StrengthSet[]): MuscleStrengthIndex {
  const exerciseIds = [...new Set(sets.map((s) => s.exerciseId))].filter((id) => EXERCISES[id]).sort();
  const estimates = new Map<string, SessionEstimate[]>();
  for (const id of exerciseIds) {
    const list = sessionEstimates(sets, id);
    if (list.length > 0) estimates.set(id, list);
  }

  const weightsByMuscle = new Map<MuscleId, Map<string, number>>();
  for (const id of estimates.keys()) {
    const exercise = EXERCISES[id];
    const add = (muscle: MuscleId, weight: number) => {
      const map = weightsByMuscle.get(muscle) ?? new Map<string, number>();
      map.set(id, Math.max(map.get(id) ?? 0, weight));
      weightsByMuscle.set(muscle, map);
    };
    for (const m of exercise.secondaryMuscles) add(m, MUSCLE_WEIGHTS.secondary);
    for (const m of exercise.primaryMuscles) add(m, MUSCLE_WEIGHTS.primary);
  }

  const result: MuscleStrengthIndex = {};
  for (const [muscle, weights] of weightsByMuscle) {
    result[muscle] = indexForMuscle(weights, estimates);
  }
  return result;
}

function indexForMuscle(
  weights: Map<string, number>,
  estimates: Map<string, SessionEstimate[]>
): MuscleIndexPoint[] {
  // All sessions of contributing exercises, grouped by instant.
  const byTime = new Map<number, SessionEstimate[]>();
  for (const id of weights.keys()) {
    for (const e of estimates.get(id) ?? []) {
      const t = e.date.getTime();
      const list = byTime.get(t) ?? [];
      list.push(e);
      byTime.set(t, list);
    }
  }

  const state = new Map<string, { reference: number; latest: number; lastTime: number }>();
  const points: MuscleIndexPoint[] = [];
  let current: number = MUSCLE_INDEX.base;

  for (const t of [...byTime.keys()].sort((a, b) => a - b)) {
    for (const e of byTime.get(t)!.sort((a, b) => (a.exerciseId < b.exerciseId ? -1 : 1))) {
      const known = state.get(e.exerciseId);
      if (known) {
        known.latest = e.strength;
        known.lastTime = t;
      } else {
        // Join at the current level: reference chosen so relative = current.
        state.set(e.exerciseId, {
          reference: (e.strength * MUSCLE_INDEX.base) / current,
          latest: e.strength,
          lastTime: t,
        });
      }
    }

    const cutoff = t - MUSCLE_INDEX.staleAfterDays * DAY_MS;
    const contributors: MuscleIndexContributor[] = [];
    for (const [exerciseId, s] of [...state.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
      if (s.lastTime < cutoff) continue;
      contributors.push({
        exerciseId,
        weight: weights.get(exerciseId)!,
        relative: (MUSCLE_INDEX.base * s.latest) / s.reference,
      });
    }
    const totalWeight = contributors.reduce((sum, c) => sum + c.weight, 0);
    current = contributors.reduce((sum, c) => sum + c.weight * c.relative, 0) / totalWeight;
    points.push({
      date: new Date(t),
      index: round1(current),
      contributors: contributors.map((c) => ({ ...c, relative: round1(c.relative) })),
    });
  }
  return points;
}
