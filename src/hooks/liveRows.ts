/** Rows that have not been soft-deleted. Every log read in src/hooks passes through this. */
export function liveRows<T extends { deletedAt?: number | null }>(rows: T[]): T[] {
  return rows.filter((row) => row.deletedAt == null);
}

/** One row, or null when it is missing or soft-deleted. */
export function liveRow<T extends { deletedAt?: number | null }>(
  row: T | null | undefined
): T | null {
  return row && row.deletedAt == null ? row : null;
}
