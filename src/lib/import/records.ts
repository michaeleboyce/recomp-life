/**
 * Turning a parsed export into the rows the app stores: one imported session per
 * workout (its sets inside, each with the library exercise its name maps to), and one
 * run or activity per cardio entry. Pure: no database, no clock.
 *
 * The mapping is read once per distinct name, with the user's remembered choices
 * first (see `mapExercise`). What a name maps to is stored with the set, so every
 * device reads the same history whatever choices it remembers.
 */
import { metresToMiles } from "@/lib/health/units";
import { mapExercise, type ExerciseMapping, type MappingOverrides } from "@/lib/import/mapping";
import type {
  CardioKind,
  ImportedCardio,
  ImportedSession,
  ImportedSet,
  ImportSourceApp,
  ParsedExport,
} from "@/lib/import/parse";
import type { ActivityKind, ActivityLog, ImportedSessionRecord, ImportedSetRecord, RunLog } from "@/types";

/** How each source app is named on the rows it adds. */
export const SOURCE_APP_NAMES: Record<ImportSourceApp, string> = {
  fitbod: "Fitbod",
  gravl: "Gravl",
};

/** A cardio kind from an export as an activity kind; runs have their own table. */
const ACTIVITY_KINDS: Record<Exclude<CardioKind, "run">, ActivityKind> = {
  walk: "walking",
  hike: "hiking",
  cycle: "cycling",
  elliptical: "other",
  swim: "other",
  row: "other",
  other: "other",
};

/**
 * An export's time as a Date. A time with no zone (`startIsLocal`) is read as this
 * device's wall clock, which is what JavaScript does with an ISO date-time without an
 * offset.
 */
export function importedDate(iso: string): Date {
  return new Date(iso);
}

/** A mapping cache for one build: every distinct name is mapped once. */
export function mappingReader(overrides?: MappingOverrides): (name: string) => ExerciseMapping {
  const cache = new Map<string, ExerciseMapping>();
  return (name) => {
    let mapping = cache.get(name);
    if (!mapping) {
      mapping = mapExercise(name, overrides);
      cache.set(name, mapping);
    }
    return mapping;
  };
}

/**
 * One parsed set as stored. A mapped name keeps its library exercise; a name kept
 * under its own name keeps the primary muscles guessed or chosen for it (the stored
 * shape has one list, so secondary muscles of a guess are not kept); an unknown name
 * keeps neither.
 */
export function importedSetRecord(set: ImportedSet, mapping: ExerciseMapping): ImportedSetRecord {
  const record: ImportedSetRecord = {
    id: set.id,
    exerciseName: set.exerciseName,
    mappedExerciseId: mapping.kind === "mapped" ? mapping.exerciseId : null,
    setOrder: set.setOrder,
    reps: set.reps,
    weightPerImplementLb: set.weightPerImplementLb,
    implementCount: set.implementCount,
    multiplierRaw: set.multiplierRaw,
    weightCountsAsLoad: set.weightCountsAsLoad,
    durationSec: set.durationSec,
    distanceM: set.distanceM,
    role: set.role,
    effort: set.effort,
  };
  if ((mapping.kind === "guess" || mapping.kind === "custom") && mapping.muscles.primary.length > 0) {
    record.muscles = [...mapping.muscles.primary];
  }
  return record;
}

/** One parsed session as stored, before the writer adds its sync stamps. */
export function importedSessionRecord(
  session: ImportedSession,
  batchId: string,
  mappingOf: (name: string) => ExerciseMapping
): ImportedSessionRecord {
  return {
    id: session.id,
    clientId: session.id,
    sourceApp: session.sourceApp,
    startedAt: importedDate(session.start),
    startIsLocal: session.startIsLocal,
    endedAt: session.end ? importedDate(session.end) : null,
    title: session.title,
    notes: session.notes,
    importBatchId: batchId,
    sets: session.sets.map((set) => importedSetRecord(set, mappingOf(set.exerciseName))),
    updatedAt: 0,
    deletedAt: null,
    synced: false,
  };
}

/** Every session of a parsed export as stored rows, oldest first. */
export function buildSessionRecords(
  parsed: Pick<ParsedExport, "sessions">,
  batchId: string,
  overrides?: MappingOverrides
): ImportedSessionRecord[] {
  const mappingOf = mappingReader(overrides);
  return parsed.sessions
    .map((session) => importedSessionRecord(session, batchId, mappingOf))
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime() || (a.id < b.id ? -1 : 1));
}

/** A cardio entry as the row it becomes: a run, or an activity of another kind. */
export type CardioRow = { table: "runs"; row: RunLog } | { table: "activities"; row: ActivityLog };

/**
 * A cardio entry as a run (runs, jogs and treadmill runs) or an activity (walks,
 * hikes, rides and the rest, with the exported name as the note for "other"). Null
 * when the entry has no duration: the log needs one and the app never guesses it.
 * The row carries no external id, so a later Apple Health import that finds the same
 * session links to it instead of adding a second one.
 */
export function cardioRow(entry: ImportedCardio): CardioRow | null {
  if (entry.durationSec === null || !(entry.durationSec > 0)) return null;
  const base = {
    id: entry.id,
    clientId: entry.id,
    date: importedDate(entry.start),
    durationMinutes: Math.round((entry.durationSec / 60) * 10) / 10,
    distanceMiles: entry.distanceM !== null && entry.distanceM > 0 ? metresToMiles(entry.distanceM) : null,
    perceivedEffort: null,
    sourceName: SOURCE_APP_NAMES[entry.sourceApp],
    updatedAt: 0,
    deletedAt: null,
    synced: false,
  };
  if (entry.kind === "run") {
    return {
      table: "runs",
      row: {
        ...base,
        type: /treadmill/i.test(entry.name) ? "treadmill" : "outdoor",
        category: "other",
        notes: "",
      },
    };
  }
  const kind = ACTIVITY_KINDS[entry.kind];
  return {
    table: "activities",
    row: { ...base, kind, style: null, notes: kind === "other" ? entry.name : "" },
  };
}

export interface CardioRows {
  rows: CardioRow[];
  /** Entries left out because they have no duration. */
  noDuration: number;
}

/** Every cardio entry of a parsed export as rows, oldest first. */
export function buildCardioRows(parsed: Pick<ParsedExport, "cardio">): CardioRows {
  const rows: CardioRow[] = [];
  let noDuration = 0;
  for (const entry of parsed.cardio) {
    const row = cardioRow(entry);
    if (row) rows.push(row);
    else noDuration += 1;
  }
  rows.sort((a, b) => a.row.date.getTime() - b.row.date.getTime() || (a.row.id < b.row.id ? -1 : 1));
  return { rows, noDuration };
}
