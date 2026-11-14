// Groups a workout's sets by exercise, in the order they were performed. Pure.
import type { SetLog, Tier } from "@/types";

export interface ExerciseGroup {
  /** The exercise performed: the substitute when one was used. */
  exerciseId: string;
  /** Working tiers in this group, in order of appearance (warm-ups excluded). */
  tiers: Tier[];
  /** Every set, warm-ups included, in the order performed. */
  sets: SetLog[];
}

const time = (s: SetLog) => {
  const ms = new Date(s.completedAt).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

/** Sets in the order performed: by completion time, then set number. */
export function inOrder(sets: SetLog[]): SetLog[] {
  return [...sets].sort((a, b) => time(a) - time(b) || a.setNumber - b.setNumber);
}

export function groupSets(sets: SetLog[]): ExerciseGroup[] {
  const groups = new Map<string, ExerciseGroup>();
  for (const s of inOrder(sets)) {
    const exerciseId = s.substituteExerciseId ?? s.exerciseId;
    let group = groups.get(exerciseId);
    if (!group) {
      group = { exerciseId, tiers: [], sets: [] };
      groups.set(exerciseId, group);
    }
    group.sets.push(s);
    if (s.tier !== "warmup" && !group.tiers.includes(s.tier)) group.tiers.push(s.tier);
  }
  return [...groups.values()];
}

/** The last working set of a group (the one "Add set" copies); null if it has none. */
export function lastWorkingSet(group: ExerciseGroup): SetLog | null {
  const working = group.sets.filter((s) => s.tier !== "warmup");
  return working[working.length - 1] ?? null;
}

/** The number after the highest set number of that tier in the group. */
export function nextSetNumber(group: ExerciseGroup, tier: Tier): number {
  return Math.max(0, ...group.sets.filter((s) => s.tier === tier).map((s) => s.setNumber)) + 1;
}
