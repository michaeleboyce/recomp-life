/**
 * Imported history as evidence: sets of imported sessions as the strength library's
 * `StrengthSet` (for the strength estimate, the learned ratios and the muscle strength
 * index), and as muscle work (for weekly volume and recovery). Pure.
 *
 * Imported sessions are history, never GZCLP sessions: nothing here reaches the
 * rotation, progression or the forecast record, which read the workouts table only.
 *
 * Recency is the strength library's: the pooled estimate starts from the latest session
 * of the lift and halves every session's weight for each STRENGTH_POOLING
 * .evidenceHalfLifeDays it is older than the newest one pooled, so a session years old
 * informs the trend but not next week's weight.
 *
 * What a set's exported name maps to is worked out when it is read: a choice remembered
 * since the import (`overrides`, the import screen's) wins over the mapping stored with
 * the set at import time, so remapping a name changes the evidence without importing
 * the file again.
 */
import { EXERCISES } from "@/lib/exercises";
import { applyOverrides } from "@/lib/import/mapping";
import type { MappingOverrides } from "@/lib/import/mapping/types";
import { isMuscleId } from "@/lib/muscles";
import { MUSCLE_WEIGHTS, volumeCredits, type StrengthSet, type StrengthSetRole } from "@/lib/strength";
import type { ImportedSessionRecord, ImportedSetRecord, MuscleId } from "@/types";

/**
 * The effort words other apps log, as an approximate RPE: the reps left in reserve are
 * credited by the app's estimate (10 − RPE). Graded heuristic: the apps do not say what
 * their words mean in reps. A set without a word is read as taken to its limit, which
 * gives the lower estimate.
 */
export const EFFORT_WORD_RPE: Readonly<Record<string, number>> = {
  easy: 7,
  ideal: 8,
  moderate: 8,
  hard: 9,
  max: 10,
  failure: 10,
  failed: 10,
};

/** The approximate RPE for an effort word, or null. */
export function effortRpe(word: string | null | undefined): number | null {
  if (!word) return null;
  return EFFORT_WORD_RPE[word.trim().toLowerCase()] ?? null;
}

const SET_SPACING_MS = 1000;

function roleOf(set: Pick<ImportedSetRecord, "role">): StrengthSetRole {
  if (set.role === "warmup") return "warmup";
  if (set.role === "drop") return "drop";
  return "working";
}

/** The weight a set moved, as lifted (per implement), rounded to a hundredth; 0 when it adds no load. */
export function liftedWeight(set: Pick<ImportedSetRecord, "weightPerImplementLb" | "weightCountsAsLoad">): number {
  const w = set.weightPerImplementLb;
  if (!set.weightCountsAsLoad || w === null || !(w > 0)) return 0;
  return Math.round(w * 100) / 100;
}

const isLive = (session: Pick<ImportedSessionRecord, "deletedAt">) => session.deletedAt == null;

/** What an imported set reads as now: a library exercise, or muscles only. */
interface ResolvedSet {
  exerciseId: string | null;
  /** Muscles of a name kept under its own name (guessed at import, or chosen since). */
  muscles: { primary: MuscleId[]; secondary: MuscleId[] } | null;
}

/**
 * The mapping of an imported set's name as of now: a remembered choice for the name
 * (`applyOverrides`) when there is one, else the mapping stored with the set.
 */
export function resolveImportedSet(
  set: Pick<ImportedSetRecord, "exerciseName" | "mappedExerciseId" | "muscles">,
  overrides?: MappingOverrides
): ResolvedSet {
  const chosen = applyOverrides(set.exerciseName, overrides);
  if (chosen?.kind === "mapped") return { exerciseId: chosen.exerciseId, muscles: null };
  if (chosen?.kind === "custom") {
    return { exerciseId: null, muscles: chosen.muscles.primary.length > 0 ? chosen.muscles : null };
  }
  if (set.mappedExerciseId && EXERCISES[set.mappedExerciseId]) return { exerciseId: set.mappedExerciseId, muscles: null };
  const primary = (set.muscles ?? []).filter(isMuscleId);
  return { exerciseId: null, muscles: primary.length > 0 ? { primary, secondary: [] } : null };
}

function sessionTime(session: Pick<ImportedSessionRecord, "startedAt">): number {
  return new Date(session.startedAt).getTime();
}

/**
 * The sets of one imported session as strength evidence, in file order.
 *
 * - Only sets whose name maps to a library exercise: a name only muscle-guessed (or kept
 *   with muscles the user chose) is never evidence about a lift.
 * - The weight is as lifted, per dumbbell for an exercise held with one in each hand (the
 *   library's grip, as the mapping reads it), like the app's own sets; the exported
 *   implement count is not needed.
 * - Warm-ups stay warm-ups (counted for nothing); a drop continues the set of the same
 *   exercise before it, so it is discounted and kept out of the estimated max.
 * - A loaded set of at least one rep is read as taken to its limit, less the reps its
 *   effort word leaves (`effortRpe`): it is marked as the library's estimate-eligible
 *   kind (T1, as many reps as possible), and the library's rep limits still apply. Sets
 *   with no load (bodyweight, assistance, timed holds) give no estimate.
 * - Each set is a second after the one before it, from the session's start.
 * - The name's mapping is the one in force now (`resolveImportedSet` with `overrides`).
 */
export function importedSessionStrengthSets(
  session: ImportedSessionRecord,
  overrides?: MappingOverrides
): StrengthSet[] {
  const start = sessionTime(session);
  if (!Number.isFinite(start)) return [];
  const out: StrengthSet[] = [];
  const lastByExercise = new Map<string, string>();
  session.sets.forEach((set, index) => {
    const exerciseId = resolveImportedSet(set, overrides).exerciseId;
    if (!exerciseId || !EXERCISES[exerciseId]) return;
    const weight = liftedWeight(set);
    const reps = set.reps ?? 0;
    const role = roleOf(set);
    const estimable = weight > 0 && reps > 0;
    const previous = lastByExercise.get(exerciseId);
    out.push({
      id: set.id,
      sessionId: session.id,
      exerciseId,
      weight,
      perHand: EXERCISES[exerciseId].grip === "per_hand",
      reps,
      rpe: effortRpe(set.effort),
      role,
      tier: estimable ? "T1" : "T3",
      isAMRAP: estimable,
      date: new Date(start + index * SET_SPACING_MS),
      ...(role === "drop" && previous ? { dropOf: previous } : {}),
    });
    lastByExercise.set(exerciseId, set.id);
  });
  return out;
}

/** Every live imported session's sets as strength evidence, mapped as of now (`overrides`). */
export function importedStrengthSets(
  sessions: readonly ImportedSessionRecord[],
  overrides?: MappingOverrides
): StrengthSet[] {
  return sessions.filter(isLive).flatMap((session) => importedSessionStrengthSets(session, overrides));
}

/** One imported set as muscle work. */
export interface ImportedMuscleSet {
  id: string;
  sessionId: string;
  date: Date;
  primary: MuscleId[];
  secondary: MuscleId[];
  /** Sets counted for volume: 1 for a working set, 0 for a warm-up, the library's credit for a drop. */
  credit: number;
}

function musclesOf(set: ImportedSetRecord, overrides?: MappingOverrides): { primary: MuscleId[]; secondary: MuscleId[] } | null {
  const resolved = resolveImportedSet(set, overrides);
  const exercise = resolved.exerciseId ? EXERCISES[resolved.exerciseId] : undefined;
  if (exercise) return { primary: exercise.primaryMuscles, secondary: exercise.secondaryMuscles };
  return resolved.muscles;
}

/**
 * Every set of the live imported sessions that works a known muscle: a mapped exercise
 * by its library muscles, a name kept under its own name by its guessed or chosen
 * muscles (as primary). Names with no muscles are left out. Drops count as the strength
 * library counts them for volume (`volumeCredits`). Names are mapped as of now (`overrides`).
 */
export function importedMuscleSets(
  sessions: readonly ImportedSessionRecord[],
  overrides?: MappingOverrides
): ImportedMuscleSet[] {
  const out: ImportedMuscleSet[] = [];
  for (const session of sessions) {
    if (!isLive(session)) continue;
    const start = sessionTime(session);
    if (!Number.isFinite(start)) continue;
    // Credits per set, with a drop continuing the set of the same name before it.
    const pseudo: StrengthSet[] = [];
    const lastByName = new Map<string, string>();
    session.sets.forEach((set, index) => {
      const key = resolveImportedSet(set, overrides).exerciseId ?? `name:${set.exerciseName}`;
      const previous = lastByName.get(key);
      pseudo.push({
        id: set.id,
        sessionId: session.id,
        exerciseId: key,
        weight: 0,
        perHand: false,
        reps: set.reps ?? 0,
        role: roleOf(set),
        tier: "T3",
        isAMRAP: false,
        date: new Date(start + index * SET_SPACING_MS),
        ...(set.role === "drop" && previous ? { dropOf: previous } : {}),
      });
      lastByName.set(key, set.id);
    });
    const credits = volumeCredits(pseudo);
    session.sets.forEach((set, index) => {
      const muscles = musclesOf(set, overrides);
      if (!muscles) return;
      out.push({
        id: set.id,
        sessionId: session.id,
        date: new Date(start + index * SET_SPACING_MS),
        primary: muscles.primary,
        secondary: muscles.secondary,
        credit: credits.get(set.id) ?? 0,
      });
    });
  }
  return out;
}

export type MuscleValues = Partial<Record<MuscleId, number>>;

/**
 * Fractional sets per muscle from imported sessions started in [from, to): each set's
 * credit times MUSCLE_WEIGHTS.primary for its primary muscles and .secondary for its
 * secondary ones, as the app counts its own sets.
 */
export function importedMuscleLoad(
  sessions: readonly ImportedSessionRecord[],
  from: Date,
  to: Date,
  overrides?: MappingOverrides
): MuscleValues {
  const inRange = sessions.filter((s) => {
    const t = sessionTime(s);
    return t >= from.getTime() && t < to.getTime();
  });
  const load: MuscleValues = {};
  for (const set of importedMuscleSets(inRange, overrides)) {
    if (set.credit <= 0) continue;
    for (const m of set.primary) load[m] = (load[m] ?? 0) + set.credit * MUSCLE_WEIGHTS.primary;
    for (const m of set.secondary) load[m] = (load[m] ?? 0) + set.credit * MUSCLE_WEIGHTS.secondary;
  }
  return load;
}

/** When each muscle was last worked by an imported set that counts (not a warm-up): the session's start. */
export function importedMuscleLastTrained(
  sessions: readonly ImportedSessionRecord[],
  overrides?: MappingOverrides
): Partial<Record<MuscleId, Date>> {
  const last: Partial<Record<MuscleId, Date>> = {};
  const startById = new Map(sessions.map((s) => [s.id, sessionTime(s)]));
  for (const set of importedMuscleSets(sessions, overrides)) {
    if (set.credit <= 0) continue;
    const when = startById.get(set.sessionId) ?? set.date.getTime();
    for (const m of [...set.primary, ...set.secondary]) {
      const prev = last[m];
      if (!prev || prev.getTime() < when) last[m] = new Date(when);
    }
  }
  return last;
}

/** Two muscle loads added together (the app's own and the imported). */
export function addMuscleValues(a: MuscleValues, b: MuscleValues): MuscleValues {
  const sum: MuscleValues = { ...a };
  for (const [muscle, value] of Object.entries(b) as [MuscleId, number][]) {
    sum[muscle] = (sum[muscle] ?? 0) + value;
  }
  return sum;
}

/** The later date per muscle of two last-trained maps. */
export function latestPerMuscle(
  a: Partial<Record<MuscleId, Date>>,
  b: Partial<Record<MuscleId, Date>>
): Partial<Record<MuscleId, Date>> {
  const out: Partial<Record<MuscleId, Date>> = { ...a };
  for (const [muscle, date] of Object.entries(b) as [MuscleId, Date][]) {
    const prev = out[muscle];
    if (!prev || prev.getTime() < date.getTime()) out[muscle] = date;
  }
  return out;
}
