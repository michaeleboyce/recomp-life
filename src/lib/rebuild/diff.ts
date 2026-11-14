import type { Estimated1RM, LiftState } from "@/types";
import type { DerivedDiff, RebuildResult } from "./types";

/**
 * Deep value equality for derived rows. Dates compare by time, and a stored date may be
 * an ISO string; a missing key equals an undefined one.
 */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;

  if (a instanceof Date || b instanceof Date) {
    if (typeof a === "boolean" || typeof b === "boolean") return false;
    const at = new Date(a as Date | string | number).getTime();
    const bt = new Date(b as Date | string | number).getTime();
    return !Number.isNaN(at) && at === bt;
  }

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((value, i) => sameValue(value, b[i]));
  }

  if (typeof a === "object" && typeof b === "object") {
    const ao = a as Record<string, unknown>;
    const bo = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
    for (const key of keys) {
      if (ao[key] === undefined && bo[key] === undefined) continue;
      if (!sameValue(ao[key], bo[key])) return false;
    }
    return true;
  }

  return false;
}

/** Row equality that ignores the local-only `synced` flag. */
function sameRow<T extends { synced: boolean }>(a: T, b: T): boolean {
  return sameValue({ ...a, synced: true }, { ...b, synced: true });
}

/**
 * The writes that bring stored derived rows in line with a rebuild: rows that are
 * missing or differ are put, stored rows the rebuild no longer produces are deleted.
 */
export function diffDerived(
  rebuilt: Pick<RebuildResult, "liftStates" | "e1rms">,
  stored: { liftStates: LiftState[]; e1rms: Estimated1RM[] }
): DerivedDiff {
  const storedStates = new Map(stored.liftStates.map((ls) => [ls.exerciseId, ls]));
  const liftStatesToPut = rebuilt.liftStates.filter((ls) => {
    const existing = storedStates.get(ls.exerciseId);
    return !existing || !sameRow(ls, existing);
  });
  const rebuiltLiftIds = new Set(rebuilt.liftStates.map((ls) => ls.exerciseId));
  const liftStateIdsToDelete = stored.liftStates
    .map((ls) => ls.exerciseId)
    .filter((id) => !rebuiltLiftIds.has(id))
    .sort();

  const storedE1RMs = new Map(stored.e1rms.map((row) => [row.id, row]));
  const e1rmsToPut = rebuilt.e1rms.filter((row) => {
    const existing = storedE1RMs.get(row.id);
    return !existing || !sameRow(row, existing);
  });
  const rebuiltE1RMIds = new Set(rebuilt.e1rms.map((row) => row.id));
  const e1rmIdsToDelete = stored.e1rms
    .map((row) => row.id)
    .filter((id) => !rebuiltE1RMIds.has(id))
    .sort();

  return {
    liftStatesToPut,
    liftStateIdsToDelete,
    e1rmsToPut,
    e1rmIdsToDelete,
    consistent:
      liftStatesToPut.length === 0 &&
      liftStateIdsToDelete.length === 0 &&
      e1rmsToPut.length === 0 &&
      e1rmIdsToDelete.length === 0,
  };
}
