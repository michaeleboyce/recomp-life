// What the Log and the lift pages show of a session imported from another app's export:
// a one-line summary for its row, and its exercises and sets for the read-only detail.
// Pure: no React, no database. Names are read as they map now (`overrides`, the import
// screen's remembered choices, win over the mapping stored with each set).
import { formatDuration, liftName } from "@/components/LogEdit/format";
import { EXERCISES } from "@/lib/exercises";
import { effortRepsInReserve, liftedWeight, resolveImportedSet } from "@/lib/import/evidence";
import { implementsForExercise, implementsForName, type MappingOverrides } from "@/lib/import/mapping";
import { formatLb } from "@/lib/import/preview";
import { SOURCE_APP_NAMES } from "@/lib/import/records";
import { formatMuscle } from "@/lib/muscles";
import type { ImportedSessionRecord, ImportedSetRecord, RecordSource } from "@/types";

/** How many exercise names stand in for the title of a session that has none. */
export const SUMMARY_NAME_COUNT = 3;

/** A run or activity added by another app's export (not Apple Health, not by hand). */
export function isImportedRow(row: { source?: RecordSource; importBatchId?: string }): boolean {
  return row.source === "import" || Boolean(row.importBatchId);
}

/** "Fitbod", "Gravl". */
export function importedSource(session: Pick<ImportedSessionRecord, "sourceApp">): string {
  return SOURCE_APP_NAMES[session.sourceApp] ?? session.sourceApp;
}

/** The library exercise a set counts as now, or null for a name kept under its own name. */
function countedAs(set: ImportedSetRecord, overrides?: MappingOverrides): string | null {
  const id = resolveImportedSet(set, overrides).exerciseId;
  return id && EXERCISES[id] ? id : null;
}

export interface ImportedSessionSummary {
  /** The session's own title, or its top exercises. */
  title: string;
  /** The app it came from. */
  source: string;
  /** Sets that were neither a warm-up nor a drop. */
  workingSets: number;
  /** Seconds from start to end, when the file gave an end. */
  durationSec: number | null;
}

function durationOf(session: Pick<ImportedSessionRecord, "startedAt" | "endedAt">): number | null {
  if (!session.endedAt) return null;
  const seconds = (new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * The row summary of an imported session. Without a title, it is named by its top
 * SUMMARY_NAME_COUNT exercises by working sets (all sets when it has none), as the
 * library names them ("Bench Press"), else as the file did; ties keep file order.
 */
export function importedSessionSummary(
  session: ImportedSessionRecord,
  overrides?: MappingOverrides
): ImportedSessionSummary {
  const working = session.sets.filter((s) => s.role === "work");
  let title = session.title.trim();
  if (!title) {
    const counts = new Map<string, number>();
    for (const set of working.length > 0 ? working : session.sets) {
      const id = countedAs(set, overrides);
      const name = id ? liftName(id) : set.exerciseName.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const top = [...counts.entries()]
      .map(([name, count], order) => ({ name, count, order }))
      .sort((a, b) => b.count - a.count || a.order - b.order)
      .slice(0, SUMMARY_NAME_COUNT)
      .map((e) => e.name);
    title = top.length > 0 ? top.join(", ") : "Imported session";
  }
  return { title, source: importedSource(session), workingSets: working.length, durationSec: durationOf(session) };
}

/** "Gravl · 14 working sets · 52 min". */
export function importedSummaryLine(summary: ImportedSessionSummary): string {
  return [
    summary.source,
    `${summary.workingSets} working ${summary.workingSets === 1 ? "set" : "sets"}`,
    summary.durationSec !== null ? formatDuration(summary.durationSec) : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A set's weight as lifted: per dumbbell, times two, for an exercise held with one in
 * each hand ("50 lb × 2"; the library's grip when the name maps, else its words), else
 * the load ("135 lb"). "bodyweight" with no load, "40 lb assistance" for a weight that helps.
 */
export function importedSetLoad(
  set: Pick<ImportedSetRecord, "exerciseName" | "weightPerImplementLb" | "weightCountsAsLoad">,
  exerciseId: string | null
): string {
  const w = set.weightPerImplementLb;
  if (w === null || !(w > 0)) return "bodyweight";
  if (!set.weightCountsAsLoad) return `${formatLb(w)} lb assistance`;
  const lifted = liftedWeight(set);
  const implement = (exerciseId ? implementsForExercise(exerciseId) : null) ?? implementsForName(set.exerciseName);
  return implement.implements === 2 ? `${formatLb(lifted)} lb × 2` : `${formatLb(lifted)} lb`;
}

/** "10 reps", or a timed hold's "1:15", or a distance's "400 m"; empty when the set has none. */
function amountOf(set: Pick<ImportedSetRecord, "reps" | "durationSec" | "distanceM">): string {
  if (set.reps !== null) return `${set.reps} ${set.reps === 1 ? "rep" : "reps"}`;
  if (set.durationSec !== null && set.durationSec > 0) {
    const s = Math.round(set.durationSec);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  if (set.distanceM !== null && set.distanceM > 0) return `${Math.round(set.distanceM)} m`;
  return "";
}

/**
 * The effort word as the file wrote it, with the reps left the app reads it as
 * (`effortRepsInReserve`, the import-effort-words rule): "Hard, about 1-2 reps left". A
 * word the app does not know is shown as written.
 */
function effortText(word: string | null): string | null {
  const text = word?.trim();
  if (!text) return null;
  const repsInReserve = effortRepsInReserve(text);
  return repsInReserve === null ? text : `${text}, about ${repsInReserve} reps left`;
}

export interface ImportedSetView {
  id: string;
  /** Position within the exercise, from the file. */
  order: number;
  load: string;
  amount: string;
  role: ImportedSetRecord["role"];
  effort: string | null;
}

export interface ImportedExerciseView {
  /** The name as the file wrote it. */
  name: string;
  /** The library exercise it counts as, or null when it is kept as its own name. */
  countsAs: string | null;
  /** For a name kept as its own: the muscles it is credited to, if any. */
  muscles: string | null;
  sets: ImportedSetView[];
}

/** Every exercise of the session in the order the file first lists it, with its sets. */
export function importedSessionExercises(
  session: ImportedSessionRecord,
  overrides?: MappingOverrides
): ImportedExerciseView[] {
  const byName = new Map<string, ImportedExerciseView>();
  for (const set of session.sets) {
    let view = byName.get(set.exerciseName);
    const resolved = resolveImportedSet(set, overrides);
    const id = resolved.exerciseId && EXERCISES[resolved.exerciseId] ? resolved.exerciseId : null;
    if (!view) {
      const muscles = !id && resolved.muscles ? resolved.muscles.primary.map(formatMuscle).join(", ") : "";
      view = { name: set.exerciseName, countsAs: id ? EXERCISES[id].name : null, muscles: muscles || null, sets: [] };
      byName.set(set.exerciseName, view);
    }
    view.sets.push({
      id: set.id,
      order: set.setOrder,
      load: importedSetLoad(set, id),
      amount: amountOf(set),
      role: set.role,
      effort: effortText(set.effort),
    });
  }
  return [...byName.values()];
}
