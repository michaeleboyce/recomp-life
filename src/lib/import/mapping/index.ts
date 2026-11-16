/**
 * Matching exercise names from other apps' exports to the app's library. Pure.
 *
 * Order: the user's remembered choice, then the reviewed name table (and the
 * library's own names), then a muscle guess from the name's words, then unknown.
 * Guesses and unknown names are kept under their own name and listed on the import
 * screen for review; a guess never becomes a library exercise, so it can never be
 * counted as a program lift.
 */
import { guessMuscles } from "./guess";
import { implementsFor } from "./implements";
import { nameKey } from "./normalise";
import { applyOverrides } from "./overrides";
import { lookupName } from "./table";
import type { ExerciseMapping, ImplementSemantics, MappingOverrides } from "./types";

export type {
  ExerciseMapping,
  ImplementSemantics,
  MappingConfidence,
  MappingOverride,
  MappingOverrides,
  MuscleSet,
} from "./types";
export { nameKey, nameTokens } from "./normalise";
export { guessMuscles } from "./guess";
export { implementsFor, implementsForExercise, implementsForName } from "./implements";
export { applyOverrides, forgetMapping, overrideMapping, rememberMapping } from "./overrides";
export { AMBIGUOUS_OWN_NAMES, NAME_TABLE, PROGRAM_LIFT_IDS, lookupName } from "./table";

/** What an exported exercise name stands for in the app. */
export function mapExercise(name: string, overrides?: MappingOverrides): ExerciseMapping {
  const chosen = applyOverrides(name, overrides);
  if (chosen) return chosen;
  const match = lookupName(name);
  if (match) return { kind: "mapped", exerciseId: match.exerciseId, confidence: match.confidence };
  const muscles = guessMuscles(name);
  if (muscles) return { kind: "guess", muscles, confidence: "low" };
  return { kind: "unknown" };
}

export interface MappingSummaryRow {
  /** The normalised name every spelling below shares. */
  key: string;
  /** The first spelling seen. */
  name: string;
  /** Every spelling seen with this key, in the order first seen. */
  spellings: string[];
  /** How many times the name came in (the import screen passes one per set). */
  occurrences: number;
  mapping: ExerciseMapping;
  implement: ImplementSemantics;
  /** Guesses and unknown names, which the import screen asks the user about. */
  needsReview: boolean;
}

export interface MappingSummary {
  /** One row per distinct name, by name. */
  rows: MappingSummaryRow[];
  /** The rows that need review, by name. */
  toReview: MappingSummaryRow[];
  /** Which exported names land on each library exercise, by exercise id. */
  byExercise: { exerciseId: string; names: string[] }[];
  /** Distinct names of each kind. */
  totals: Record<ExerciseMapping["kind"], number>;
}

/**
 * The import preview: what every distinct name maps to. Names that differ only in
 * case, punctuation, word order or plurals are one row. Blank names are left out
 * (the parser reports those rows).
 */
export function summariseMapping(names: Iterable<string>, overrides?: MappingOverrides): MappingSummary {
  const rows = new Map<string, MappingSummaryRow>();
  for (const name of names) {
    const key = nameKey(name);
    if (!key) continue;
    const row = rows.get(key);
    if (row) {
      row.occurrences += 1;
      if (!row.spellings.includes(name)) row.spellings.push(name);
      continue;
    }
    const mapping = mapExercise(name, overrides);
    rows.set(key, {
      key,
      name,
      spellings: [name],
      occurrences: 1,
      mapping,
      implement: implementsFor(name, mapping),
      needsReview: mapping.kind === "guess" || mapping.kind === "unknown",
    });
  }

  const sorted = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
  const byExercise = new Map<string, string[]>();
  const totals: MappingSummary["totals"] = { mapped: 0, custom: 0, guess: 0, unknown: 0 };
  for (const row of sorted) {
    totals[row.mapping.kind] += 1;
    if (row.mapping.kind === "mapped") {
      const list = byExercise.get(row.mapping.exerciseId) ?? [];
      list.push(...row.spellings);
      byExercise.set(row.mapping.exerciseId, list);
    }
  }

  return {
    rows: sorted,
    toReview: sorted.filter((row) => row.needsReview),
    byExercise: [...byExercise.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([exerciseId, list]) => ({ exerciseId, names: list })),
    totals,
  };
}
