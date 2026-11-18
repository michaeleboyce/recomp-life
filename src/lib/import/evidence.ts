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
 * since the import (`overrides`, the import screen's), then the built-in name table as
 * it is now, win over the mapping stored with the set at import time, so remapping a
 * name or adding an exercise to the library changes the evidence without importing the
 * file again (see `resolveImportedSet`).
 */
import { EXERCISES } from "@/lib/exercises";
import { applyOverrides, lookupName } from "@/lib/import/mapping";
import type { MappingOverrides } from "@/lib/import/mapping/types";
import { MUSCLE_GROUPS, isMuscleId, type DisplayGroup } from "@/lib/muscles";
import { MUSCLE_WEIGHTS, volumeCredits, type StrengthSet, type StrengthSetRole } from "@/lib/strength";
import type { ImportedSessionRecord, ImportedSetRecord, MuscleGroupVolume, MuscleId, RepsInReserve } from "@/types";

/**
 * The effort words other apps log, as a reps-in-reserve answer: a word for an all-out
 * set is "0", a hard or comfortable working set "1-2", an easy one "3+". The reps
 * credited for an answer are the app's own (`RIR_ESTIMATE`), as for an answer logged in
 * the app. Graded heuristic: the apps do not say what their words mean in reps. A set
 * without a word is read as taken to its limit, which gives the lower estimate.
 *
 * @evidence import-effort-words
 */
export const EFFORT_WORD_REPS_IN_RESERVE: Readonly<Record<string, RepsInReserve>> = {
  easy: "3+",
  ideal: "1-2",
  moderate: "1-2",
  hard: "1-2",
  max: "0",
  failure: "0",
  failed: "0",
};

/** The reps-in-reserve answer an effort word is read as; null for no word or an unknown one. */
export function effortRepsInReserve(word: string | null | undefined): RepsInReserve | null {
  if (!word) return null;
  return EFFORT_WORD_REPS_IN_RESERVE[word.trim().toLowerCase()] ?? null;
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
 * The mapping of an imported set's name as of now, in this order:
 * 1. a remembered choice for the name (`applyOverrides`): the user's word always wins;
 * 2. the built-in name table as it is now (`lookupName`): when the library grows (an
 *    "Incline Dumbbell Curl" stored as plain curls, a "Hack Squat" stored as a muscle
 *    guess), sets already imported count under the new exercise with no re-import;
 * 3. the mapping stored with the set at import time;
 * 4. the muscles stored with a name kept under its own name.
 * The stored mapping only decides for names the table does not know; a user's choice
 * on the import screen is remembered in `overrides`, so it is step 1, not step 3.
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
  const table = lookupName(set.exerciseName);
  if (table && EXERCISES[table.exerciseId]) return { exerciseId: table.exerciseId, muscles: null };
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
 *   effort word leaves (`effortRepsInReserve`): it is marked as the library's estimate-eligible
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
      repsInReserve: effortRepsInReserve(set.effort),
      role,
      tier: estimable ? "T1" : "T3",
      isAMRAP: estimable,
      date: new Date(start + index * SET_SPACING_MS),
      ...(role === "drop" && previous ? { dropOf: previous } : {}),
      imported: true,
    });
    lastByExercise.set(exerciseId, set.id);
  });
  return out;
}

const NO_OVERRIDES: MappingOverrides = {};
const importedSetsCache = new WeakMap<readonly ImportedSessionRecord[], WeakMap<MappingOverrides, StrengthSet[]>>();

/**
 * Every live imported session's sets as strength evidence, mapped as of now
 * (`overrides`), each marked `imported`. Worked out once per list of sessions and
 * choices (the same array is returned while neither changes, so the estimates worked
 * out from it are kept); do not change it.
 */
export function importedStrengthSets(
  sessions: readonly ImportedSessionRecord[],
  overrides?: MappingOverrides
): StrengthSet[] {
  const key = overrides ?? NO_OVERRIDES;
  let byOverrides = importedSetsCache.get(sessions);
  if (!byOverrides) {
    byOverrides = new WeakMap();
    importedSetsCache.set(sessions, byOverrides);
  }
  let sets = byOverrides.get(key);
  if (!sets) {
    sets = sessions.filter(isLive).flatMap((session) => importedSessionStrengthSets(session, overrides));
    byOverrides.set(key, sets);
  }
  return sets;
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
  const load: MuscleValues = {};
  for (const set of importedMuscleSets(sessionsIn(sessions, from, to), overrides)) {
    if (set.credit <= 0) continue;
    for (const m of set.primary) load[m] = (load[m] ?? 0) + set.credit * MUSCLE_WEIGHTS.primary;
    for (const m of set.secondary) load[m] = (load[m] ?? 0) + set.credit * MUSCLE_WEIGHTS.secondary;
  }
  return load;
}

const sessionsIn = (sessions: readonly ImportedSessionRecord[], from: Date, to: Date) =>
  sessions.filter((s) => {
    const t = sessionTime(s);
    return t >= from.getTime() && t < to.getTime();
  });

/**
 * The app's direct and indirect sets per muscle (`calculateMuscleGroupVolume`) with the
 * imported sessions started in [from, to) added: each set at its credit, as direct sets
 * for its primary muscles and indirect sets for its secondary ones, with
 * `totalFractional` weighted as `importedMuscleLoad` weights it. Returns a new record.
 */
export function addImportedVolume(
  volume: Readonly<Record<string, MuscleGroupVolume>>,
  sessions: readonly ImportedSessionRecord[],
  from: Date,
  to: Date,
  overrides?: MappingOverrides
): Record<string, MuscleGroupVolume> {
  const out: Record<string, MuscleGroupVolume> = Object.fromEntries(
    Object.entries(volume).map(([muscle, v]) => [muscle, { ...v }])
  );
  const add = (muscle: MuscleId) => (out[muscle] ??= { directSets: 0, indirectSets: 0, totalFractional: 0 });
  for (const set of importedMuscleSets(sessionsIn(sessions, from, to), overrides)) {
    if (set.credit <= 0) continue;
    for (const m of set.primary) {
      const v = add(m);
      v.directSets += set.credit;
      v.totalFractional += set.credit * MUSCLE_WEIGHTS.primary;
    }
    for (const m of set.secondary) {
      const v = add(m);
      v.indirectSets += set.credit;
      v.totalFractional += set.credit * MUSCLE_WEIGHTS.secondary;
    }
  }
  return out;
}

/**
 * Direct sets per display group (Chest, Back, ...) from imported sessions started in
 * [from, to), as `calculateGroupVolume` counts the app's: a set adds its credit once to
 * each group one of its primary muscles belongs to. Groups with none are left out.
 */
export function importedGroupSets(
  sessions: readonly ImportedSessionRecord[],
  from: Date,
  to: Date,
  overrides?: MappingOverrides
): Partial<Record<DisplayGroup, number>> {
  const out: Partial<Record<DisplayGroup, number>> = {};
  const groups = Object.entries(MUSCLE_GROUPS) as [DisplayGroup, MuscleId[]][];
  for (const set of importedMuscleSets(sessionsIn(sessions, from, to), overrides)) {
    if (set.credit <= 0) continue;
    for (const [group, members] of groups) {
      if (members.some((m) => set.primary.includes(m))) out[group] = (out[group] ?? 0) + set.credit;
    }
  }
  return out;
}

/**
 * Weight × reps over the sets of imported sessions started in [from, to) that are not
 * warm-ups, the weight as lifted (`liftedWeight`), as the app's weekly tonnage counts
 * its own sets. Deleted sessions are left out.
 */
export function importedTonnage(sessions: readonly ImportedSessionRecord[], from: Date, to: Date): number {
  let sum = 0;
  for (const session of sessionsIn(sessions, from, to)) {
    if (!isLive(session)) continue;
    for (const set of session.sets) {
      if (set.role === "warmup") continue;
      sum += liftedWeight(set) * (set.reps ?? 0);
    }
  }
  return sum;
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
