// Turning a pulled wire row back into a local row. Pure functions, no database.
import type { WireRow } from "./wire";

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Deep copy of a pulled value with every ISO timestamp string turned into a Date. */
export function reviveDates(value: unknown): unknown {
  if (typeof value === "string") {
    return ISO_TIMESTAMP.test(value) ? new Date(value) : value;
  }
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, reviveDates(v)])
    );
  }
  return value;
}

/**
 * Top-level fields the app types as optional but not nullable (`field?: T`). The
 * server returns every column, so an unset one arrives as `null`; locally it must be
 * absent instead. `deletedAt` is deliberately not here: `deletedAt: null` means "live".
 * Fields typed `T | null` (completedAt, distanceMiles, style, ...) are not here either.
 */
export const NULL_MEANS_ABSENT: ReadonlySet<string> = new Set([
  "externalId",
  "updatedAt",
  "endedEarly",
  "prescribed",
  "completionContext",
  "note",
  "notes",
  "associatedWorkoutId",
]);

/** A pulled row as it is stored locally: dates revived, absent optionals removed, synced. */
export function toLocalRow(row: WireRow): Record<string, unknown> {
  const revived = reviveDates(row) as Record<string, unknown>;
  for (const field of NULL_MEANS_ABSENT) {
    if (revived[field] === null) delete revived[field];
  }
  if (revived.deletedAt === undefined) revived.deletedAt = null;
  revived.synced = true;
  return revived;
}

/** A sync stamp as a number; a missing or unreadable stamp counts as 0. */
export function stampOf(row: { updatedAt?: unknown } | undefined): number {
  const value = Number(row?.updatedAt ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export type PullDecision = "insert" | "overwrite" | "keep";

/**
 * The pull rule. No local row: insert. Otherwise the server row replaces the local one
 * only when its `updatedAt` is strictly greater; an equal or newer local row is kept
 * (it has been pushed already, or will be on the next push).
 */
export function decidePull(local: { updatedAt?: unknown } | undefined, server: WireRow): PullDecision {
  if (!local) return "insert";
  return stampOf(server) > stampOf(local) ? "overwrite" : "keep";
}
