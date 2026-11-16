/**
 * What an export holds, shown before anything is written: the date range, how many
 * sessions, sets and cardio entries, the rows that were rejected and why, what every
 * exercise name maps to (grouped for review) and a few sample sets read the way the
 * app will store them, so a unit or implement error is visible ("50 lb × 2 hands").
 * Pure.
 */
import { EXERCISES } from "@/lib/exercises";
import {
  implementsFor,
  summariseMapping,
  type ExerciseMapping,
  type ImplementSemantics,
  type MappingOverrides,
} from "@/lib/import/mapping";
import type { CardioKind, ImportedSet, ImportSourceApp, ParsedExport } from "@/lib/import/parse";
import { formatMuscle } from "@/lib/muscles";
import { importedDate, mappingReader } from "./records";

/** How many sample sets the preview shows. */
export const PREVIEW_SAMPLE_COUNT = 4;
/** How many row numbers are listed per rejection reason. */
export const PREVIEW_REJECTED_ROWS = 5;

export interface PreviewName {
  /** The normalised name every spelling shares. */
  key: string;
  /** The first spelling seen. */
  name: string;
  spellings: string[];
  /** Sets with this name. */
  sets: number;
  mapping: ExerciseMapping;
  implement: ImplementSemantics;
  /** What the name becomes: the library exercise's name, or its muscles. */
  label: string;
}

export interface PreviewSample {
  exerciseName: string;
  /** The library exercise it maps to, or null. */
  mappedName: string | null;
  reps: number | null;
  /** The weight as the app reads it: "50 lb × 2 hands", "135 lb", "bodyweight". */
  load: string;
  /** The total load in pounds, when there is one. */
  totalLb: number | null;
  /** The file's own implement count, when it gives one and it differs from the reading. */
  fileImplements: number | null;
  date: Date;
}

export interface ImportPreview {
  app: ImportSourceApp | "unknown";
  rowCount: number;
  /** The first and last session or cardio entry; null for an empty file. */
  firstDate: Date | null;
  lastDate: Date | null;
  sessions: number;
  sets: number;
  warmups: number;
  drops: number;
  cardio: number;
  cardioByKind: Partial<Record<CardioKind, number>>;
  rejected: {
    total: number;
    reasons: Array<{ reason: string; count: number; rows: number[] }>;
  };
  /** Names grouped for review: matched to the library (or chosen by the user), muscle-guessed, unknown. */
  names: {
    mapped: PreviewName[];
    guessed: PreviewName[];
    unknown: PreviewName[];
  };
  samples: PreviewSample[];
}

/** A weight in pounds for display: at most one decimal, none when whole. */
export function formatLb(weight: number): string {
  const rounded = Math.round(weight * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * The weight of a set as the app reads it. A dumbbell in each hand: "50 lb × 2 hands";
 * one implement: "50 lb, one dumbbell"; a whole load: "135 lb"; nothing loaded:
 * "bodyweight"; a weight that helps rather than loads: "40 lb assistance".
 */
export function describeLoad(
  set: Pick<ImportedSet, "weightPerImplementLb" | "weightCountsAsLoad">,
  implement: ImplementSemantics
): { load: string; totalLb: number | null } {
  const w = set.weightPerImplementLb;
  if (w === null || !(w > 0)) return { load: "bodyweight", totalLb: null };
  if (!set.weightCountsAsLoad) return { load: `${formatLb(w)} lb assistance`, totalLb: null };
  if (implement.implements === 2) return { load: `${formatLb(w)} lb × 2 hands`, totalLb: w * 2 };
  if (implement.weight === "per_implement") return { load: `${formatLb(w)} lb, one dumbbell`, totalLb: w };
  return { load: `${formatLb(w)} lb`, totalLb: w };
}

/** What a name becomes, in words. */
export function mappingLabel(mapping: ExerciseMapping): string {
  if (mapping.kind === "mapped") return EXERCISES[mapping.exerciseId]?.name ?? mapping.exerciseId;
  if (mapping.kind === "custom" || mapping.kind === "guess") {
    const muscles = [...mapping.muscles.primary, ...mapping.muscles.secondary].map(formatMuscle);
    return muscles.length > 0 ? muscles.join(", ") : "no muscles";
  }
  return "not recognised";
}

/**
 * Sample sets for the preview: from the newest sessions back, the first loaded working
 * set of each way of reading a weight (two dumbbells, one implement, a whole load), then
 * of further exercises, one per exercise, up to PREVIEW_SAMPLE_COUNT.
 */
function pickSamples(parsed: ParsedExport, mappingOf: (name: string) => ExerciseMapping): PreviewSample[] {
  const candidates: Array<{ set: ImportedSet; date: Date; implement: ImplementSemantics; mapping: ExerciseMapping }> = [];
  const seenNames = new Set<string>();
  const sessions = [...parsed.sessions].sort((a, b) => importedDate(b.start).getTime() - importedDate(a.start).getTime());
  for (const session of sessions) {
    for (const set of session.sets) {
      if (set.role !== "work" || !(set.weightPerImplementLb && set.weightPerImplementLb > 0) || !set.weightCountsAsLoad) continue;
      if (seenNames.has(set.exerciseName)) continue;
      seenNames.add(set.exerciseName);
      const mapping = mappingOf(set.exerciseName);
      candidates.push({ set, date: importedDate(session.start), implement: implementsFor(set.exerciseName, mapping), mapping });
    }
    if (candidates.length >= 50) break;
  }
  const kindOf = (i: ImplementSemantics) => (i.implements === 2 ? "two" : i.weight === "per_implement" ? "one" : "total");
  const chosen: typeof candidates = [];
  for (const kind of ["two", "one", "total"]) {
    const first = candidates.find((c) => kindOf(c.implement) === kind && c.mapping.kind === "mapped");
    if (first && chosen.length < PREVIEW_SAMPLE_COUNT) chosen.push(first);
  }
  for (const c of candidates) {
    if (chosen.length >= PREVIEW_SAMPLE_COUNT) break;
    if (!chosen.includes(c)) chosen.push(c);
  }
  return chosen.map(({ set, date, implement, mapping }) => {
    const { load, totalLb } = describeLoad(set, implement);
    return {
      exerciseName: set.exerciseName,
      mappedName: mapping.kind === "mapped" ? mappingLabel(mapping) : null,
      reps: set.reps,
      load,
      totalLb,
      fileImplements:
        set.implementCount !== null && set.implementCount !== implement.implements ? set.implementCount : null,
      date,
    };
  });
}

/** The preview of a parsed export with the user's remembered choices applied. */
export function buildImportPreview(parsed: ParsedExport, overrides?: MappingOverrides): ImportPreview {
  const mappingOf = mappingReader(overrides);
  let sets = 0;
  let warmups = 0;
  let drops = 0;
  const names: string[] = [];
  let first = Infinity;
  let last = -Infinity;
  const note = (iso: string) => {
    const t = importedDate(iso).getTime();
    if (!Number.isFinite(t)) return;
    if (t < first) first = t;
    if (t > last) last = t;
  };
  for (const session of parsed.sessions) {
    note(session.start);
    for (const set of session.sets) {
      sets += 1;
      if (set.role === "warmup") warmups += 1;
      if (set.role === "drop") drops += 1;
      names.push(set.exerciseName);
    }
  }
  const cardioByKind: Partial<Record<CardioKind, number>> = {};
  for (const entry of parsed.cardio) {
    note(entry.start);
    cardioByKind[entry.kind] = (cardioByKind[entry.kind] ?? 0) + 1;
  }

  const reasons = new Map<string, { reason: string; count: number; rows: number[] }>();
  for (const row of parsed.rejected) {
    const entry = reasons.get(row.reason) ?? { reason: row.reason, count: 0, rows: [] };
    entry.count += 1;
    if (entry.rows.length < PREVIEW_REJECTED_ROWS) entry.rows.push(row.rowNumber);
    reasons.set(row.reason, entry);
  }

  const summary = summariseMapping(names, overrides);
  const grouped: ImportPreview["names"] = { mapped: [], guessed: [], unknown: [] };
  for (const row of summary.rows) {
    const name: PreviewName = {
      key: row.key,
      name: row.name,
      spellings: row.spellings,
      sets: row.occurrences,
      mapping: row.mapping,
      implement: row.implement,
      label: mappingLabel(row.mapping),
    };
    if (row.mapping.kind === "mapped" || row.mapping.kind === "custom") grouped.mapped.push(name);
    else if (row.mapping.kind === "guess") grouped.guessed.push(name);
    else grouped.unknown.push(name);
  }
  // Most sets first, so the names that matter most are reviewed first.
  for (const list of Object.values(grouped)) list.sort((a, b) => b.sets - a.sets || a.name.localeCompare(b.name));

  return {
    app: parsed.app,
    rowCount: parsed.rowCount,
    firstDate: Number.isFinite(first) ? new Date(first) : null,
    lastDate: Number.isFinite(last) ? new Date(last) : null,
    sessions: parsed.sessions.length,
    sets,
    warmups,
    drops,
    cardio: parsed.cardio.length,
    cardioByKind,
    rejected: {
      total: parsed.rejected.length,
      reasons: [...reasons.values()].sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    },
    names: grouped,
    samples: pickSamples(parsed, mappingOf),
  };
}
