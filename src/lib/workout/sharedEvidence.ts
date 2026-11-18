import type { MappingOverrides } from "@/lib/import/mapping/types";
import type { StrengthSet } from "@/lib/strength";
import type { ImportedSessionRecord, VariantState } from "@/types";
import { strengthEvidenceOf } from "./strength";
import { targetStrengthSets } from "./variant";

/**
 * True when two lists hold the same rows, by identity, in the same order. Every hook
 * that reads a table gets its own array from its own live query, but the rows in them
 * are the same objects (Dexie's query cache), so this is what "the same inputs" means
 * across hooks on one screen. Rows are never changed in place (a change is a new row
 * object), which every per-array cache in `src/lib` already relies on.
 */
function sameRows<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

type Workouts = Parameters<typeof strengthEvidenceOf>[0];

let lastLogged: {
  workouts: Workouts;
  imported: readonly ImportedSessionRecord[];
  overrides: MappingOverrides | undefined;
  sets: StrengthSet[];
} | null = null;

let lastWithTargets: {
  logged: StrengthSet[];
  variantStates: readonly VariantState[];
  sets: StrengthSet[];
} | null = null;

/**
 * `strengthEvidenceOf`, the same array back while the rows it reads are the same: one
 * entry (the latest inputs), so it cannot grow. Shared by every caller, so the per-array
 * caches worked out from the evidence (`pooledEstimateOf`, `transferRatioOf`,
 * `ownHistoryOf`, the accessory habit) are shared between the hooks on one screen.
 */
export function sharedStrengthEvidence(
  workouts: Workouts,
  imported: readonly ImportedSessionRecord[],
  overrides?: MappingOverrides
): StrengthSet[] {
  const last = lastLogged;
  if (last && last.overrides === overrides && sameRows(last.workouts, workouts) && sameRows(last.imported, imported)) {
    return last.sets;
  }
  const sets = strengthEvidenceOf(workouts, imported, overrides);
  lastLogged = { workouts, imported, overrides, sets };
  return sets;
}

/**
 * The logged evidence plus each home weight set by hand and not lifted yet
 * (`targetStrengthSets`), the same array back while `logged` is the same array and the
 * home states are the same rows. One entry, like `sharedStrengthEvidence`.
 */
export function withTargetEvidence(logged: StrengthSet[], variantStates: readonly VariantState[]): StrengthSet[] {
  const last = lastWithTargets;
  if (last && last.logged === logged && sameRows(last.variantStates, variantStates)) return last.sets;
  const targets = targetStrengthSets(variantStates);
  const sets = targets.length > 0 ? [...logged, ...targets] : logged;
  lastWithTargets = { logged, variantStates, sets };
  return sets;
}
