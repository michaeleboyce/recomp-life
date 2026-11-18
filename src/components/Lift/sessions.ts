// Rows for the lift detail page's session list. Pure.
import { importedSource } from "@/components/ImportedHistory/importedView";
import { averageRepsInReserve } from "@/lib/effort";
import { importedSessionStrengthSets } from "@/lib/import/evidence";
import type { MappingOverrides } from "@/lib/import/mapping";
import { relatedExercises, type StrengthSet } from "@/lib/strength";
import { excludeWarmUps } from "@/lib/workout";
import type { Estimated1RM, ImportedSessionRecord, SetLog, Tier, WorkoutSession } from "@/types";

const TIER_ORDER: Tier[] = ["T1", "T2", "T3", "accessory"];

/** Stands in for a substituted set that did not record which substitute it was. */
export const UNKNOWN_SUBSTITUTE = "home";

export interface SessionSet {
  reps: number;
  amrap: boolean;
  failed: boolean;
}

export interface LiftSession {
  key: string;
  workoutId: string;
  /** Epoch ms of the workout start. */
  t: number;
  tier: Tier;
  /** Heaviest weight among the tier's sets, as lifted. */
  weight: number;
  sets: SessionSet[];
  /** Mean reps left (`averageRepsInReserve`), or null when no answer was logged. */
  meanRepsInReserve: number | null;
  /**
   * This session holds the lift's best estimated 1RM. Never a home session: a
   * substitute's weight says nothing about the barbell lift.
   */
  best: boolean;
  /** The home substitute these sets were done as; undefined for the lift itself. */
  substituteExerciseId?: string;
}

/** The home substitute a set was done as, if any. */
function substituteOf(set: SetLog): string | undefined {
  return set.substituteExerciseId ?? (set.isSubstituted ? UNKNOWN_SUBSTITUTE : undefined);
}

/**
 * Every session containing the lift (warm-ups excluded), newest first, one row per
 * tier, and a separate row for each home substitute so dumbbell and barbell weights
 * never share a row.
 */
export function liftSessions(
  workouts: WorkoutSession[],
  e1rms: Estimated1RM[],
  exerciseId: string
): LiftSession[] {
  let bestId: string | null = null;
  let bestValue = -Infinity;
  for (const row of e1rms) {
    if (row.exerciseId === exerciseId && row.estimated1RM > bestValue) {
      bestValue = row.estimated1RM;
      bestId = row.workoutSessionId;
    }
  }

  const rows: LiftSession[] = [];
  for (const workout of workouts) {
    const mine = excludeWarmUps(workout.sets ?? []).filter((s) => s.exerciseId === exerciseId);
    let bestMarked = false;
    for (const tier of TIER_ORDER) {
      const inTier = mine.filter((s) => s.tier === tier);
      // The barbell sets first, then each substitute's in the order first logged.
      const seen = [...new Set(inTier.map(substituteOf))];
      const versions = seen.includes(undefined)
        ? [undefined, ...seen.filter((id) => id !== undefined)]
        : seen;
      for (const substituteExerciseId of versions) {
        const sets = inTier.filter((s) => substituteOf(s) === substituteExerciseId);
        const best = substituteExerciseId === undefined && workout.id === bestId && !bestMarked;
        if (best) bestMarked = true;
        rows.push({
          key: [workout.id, tier, substituteExerciseId].filter(Boolean).join("-"),
          workoutId: workout.id,
          t: new Date(workout.startedAt).getTime(),
          tier,
          weight: Math.max(...sets.map((s) => s.weight)),
          sets: sets.map((s) => ({ reps: s.actualReps, amrap: s.isAMRAP, failed: s.status === "failed" })),
          meanRepsInReserve: averageRepsInReserve(sets.map((s) => s.repsInReserve)),
          best,
          ...(substituteExerciseId ? { substituteExerciseId } : {}),
        });
      }
    }
  }
  return rows.sort((a, b) => b.t - a.t);
}

/** One exercise of a session imported from another app, as a row of a session list. */
export interface ImportedLiftSession {
  key: string;
  /** The imported session the row is from, for its detail. */
  session: ImportedSessionRecord;
  /** Epoch ms of the session start. */
  t: number;
  /** The library exercise the sets count as now. */
  exerciseId: string;
  /** A related exercise of the list's lift (its first exercise id), not the lift itself. */
  isVariant: boolean;
  /** "Fitbod", "Gravl". */
  source: string;
  /** Heaviest working set as lifted (a drop's when there are only drops); per dumbbell when `perHand`. */
  weight: number;
  perHand: boolean;
  /** Working sets and drops, warm-ups left out, in file order. */
  sets: { reps: number; drop: boolean }[];
}

/**
 * What a program lift's session list shows of imported history: the lift and the
 * exercises its strength estimate pools (`relatedExercises`), which are the home
 * versions the list already groups under the lift.
 */
export function importedPoolFor(liftId: string): string[] {
  return [liftId, ...relatedExercises(liftId)];
}

/**
 * Every live imported session with sets that count as one of `exerciseIds` (the first
 * is the list's own exercise), newest first: one row per exercise, in file order within
 * a session. The sets are the strength evidence the session gives
 * (`importedSessionStrengthSets`, names mapped as of now with `overrides`), so a name
 * kept under its own name never appears and the weight is as lifted.
 */
export function importedLiftSessions(
  sessions: readonly ImportedSessionRecord[],
  exerciseIds: readonly string[],
  overrides?: MappingOverrides
): ImportedLiftSession[] {
  const wanted = new Set(exerciseIds);
  const rows: ImportedLiftSession[] = [];
  for (const session of sessions) {
    if (session.deletedAt != null) continue;
    const t = new Date(session.startedAt).getTime();
    if (!Number.isFinite(t)) continue;
    const byExercise = new Map<string, StrengthSet[]>();
    for (const set of importedSessionStrengthSets(session, overrides)) {
      if (!wanted.has(set.exerciseId) || set.role === "warmup") continue;
      const list = byExercise.get(set.exerciseId) ?? [];
      list.push(set);
      byExercise.set(set.exerciseId, list);
    }
    for (const [exerciseId, sets] of byExercise) {
      const working = sets.filter((s) => s.role !== "drop");
      rows.push({
        key: `imported-${session.id}-${exerciseId}`,
        session,
        t,
        exerciseId,
        isVariant: exerciseId !== exerciseIds[0],
        source: importedSource(session),
        weight: Math.max(...(working.length > 0 ? working : sets).map((s) => s.weight)),
        perHand: sets[0].perHand,
        sets: sets.map((s) => ({ reps: s.reps, drop: s.role === "drop" })),
      });
    }
  }
  return rows.sort((a, b) => b.t - a.t);
}
