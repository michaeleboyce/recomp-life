// Data layer: stored forecasts. A forecast is WRITE-ONCE: a row is added and never
// changes. Nothing in the app may update, put, modify or bulkPut this table; a test
// (forecasts.test.ts) scans the source for it. The sync engine's "synced" flag is
// written by src/lib/sync.ts, which reaches the table only through a generic lookup
// by name (`database.table(def.name).modify(...)`), not through `db.forecasts`.
import type { Table } from "dexie";
import { db } from "@/db/local";
import type { Forecast } from "@/types";
import { newRowStamps } from "./stamp";

/** The tables a transaction needs to write or read forecasts. */
export function forecastTables(): Table[] {
  return [db.forecasts];
}

/**
 * Adds forecasts that are not stored yet and returns how many were added. A row whose id
 * already exists is skipped silently and the stored row is left exactly as it was; so is
 * a repeat of an id within `rows`. Sync stamps are set here.
 */
export async function writeForecasts(
  rows: readonly Forecast[],
  now: number = Date.now()
): Promise<number> {
  if (rows.length === 0) return 0;
  return db.transaction("rw", db.forecasts, async () => {
    const seen = new Set(
      (await db.forecasts.bulkGet(rows.map((row) => row.id)))
        .filter((row): row is Forecast => row !== undefined)
        .map((row) => row.id)
    );
    const fresh: Forecast[] = [];
    for (const row of rows) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      fresh.push({ ...row, ...newRowStamps(now) });
    }
    if (fresh.length > 0) await db.forecasts.bulkAdd(fresh);
    return fresh.length;
  });
}

/** Every stored forecast that is not soft-deleted, oldest made first. */
export async function listForecasts(): Promise<Forecast[]> {
  const rows = await db.forecasts.orderBy("madeAt").toArray();
  return rows.filter((row) => row.deletedAt == null);
}
