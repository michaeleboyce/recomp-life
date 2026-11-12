import { db } from '@/db/local';
import type { Table } from 'dexie';
import { syncAuthHeaders } from '@/lib/syncKey';

export const SYNC_UNAUTHORIZED = 'Sync passphrase missing or rejected';

export interface SyncResult {
  pushed: number;
  pulled: number;
  errors: string[];
}

const SYNC_TABLES = [
  { name: 'workouts', table: () => db.workouts },
  { name: 'sets', table: () => db.sets },
  { name: 'runs', table: () => db.runs },
  { name: 'bodyweight', table: () => db.bodyweight },
  { name: 'painEntries', table: () => db.painEntries },
  { name: 'estimated1RMs', table: () => db.estimated1RMs },
  { name: 'liftStates', table: () => db.liftStates },
  { name: 'userProfile', table: () => db.userProfile },
  { name: 'readinessLogs', table: () => db.readinessLogs },
] as const;

export async function pushUnsynced(): Promise<number> {
  let totalPushed = 0;

  for (const { name, table } of SYNC_TABLES) {
    const dexieTable = table() as Table;
    // Rows are written with the boolean `synced: false`, and booleans are not valid
    // IndexedDB keys, so unsynced rows never appear in the `synced` index. Filter the
    // rows themselves instead of querying that index.
    const unsynced = await dexieTable
      .filter((row: { synced?: unknown }) => !row.synced)
      .toArray();

    if (unsynced.length === 0) continue;

    const response = await fetch('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...syncAuthHeaders() },
      body: JSON.stringify({ table: name, rows: unsynced }),
    });

    if (response.ok) {
      // Mark all pushed rows as synced in Dexie
      const primaryKey = name === 'liftStates' ? 'exerciseId' : 'id';
      await dexieTable.where(primaryKey)
        .anyOf(unsynced.map((r: Record<string, unknown>) => r[primaryKey] as string))
        .modify({ synced: true });
      totalPushed += unsynced.length;
    } else if (response.status === 401) {
      // Every table would fail the same way — stop instead of retrying each one.
      throw new Error(SYNC_UNAUTHORIZED);
    } else {
      const err = await response.json().catch(() => ({ error: 'Unknown' }));
      console.error(`Push failed for ${name}:`, err);
    }
  }

  return totalPushed;
}

export async function pullFromServer(): Promise<number> {
  const response = await fetch('/api/sync/pull', { headers: syncAuthHeaders() });
  if (response.status === 401) {
    throw new Error(SYNC_UNAUTHORIZED);
  }
  if (!response.ok) {
    throw new Error(`Pull failed: ${response.status}`);
  }

  const data = await response.json() as Record<string, Record<string, unknown>[]>;
  let totalPulled = 0;

  for (const { name, table } of SYNC_TABLES) {
    const rows = data[name];
    if (!rows?.length) continue;

    const dexieTable = table() as Table;

    for (const row of rows) {
      const clientId = row.clientId as string;
      if (!clientId) continue;

      // Check if row already exists locally
      const existing = await dexieTable
        .where('clientId')
        .equals(clientId)
        .first();

      if (existing) {
        // Skip if local copy exists (local is authoritative for unsynced)
        continue;
      }

      // Insert new row from server. JSON has no date type, so timestamps arrive as
      // ISO strings; local rows hold Date objects and sort by them.
      const local = reviveDates(row) as Record<string, unknown>;
      local.synced = true;
      try {
        const primaryKey = name === 'liftStates' ? 'exerciseId' : 'id';
        await dexieTable.put(local, local[primaryKey] as string);
        totalPulled++;
      } catch (err) {
        console.error(`Pull insert failed for ${name}:`, err);
      }
    }
  }

  return totalPulled;
}

export async function fullSync(): Promise<SyncResult> {
  const errors: string[] = [];
  let pushed = 0;
  let pulled = 0;

  try {
    pushed = await pushUnsynced();
  } catch (err) {
    errors.push(`Push: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  try {
    pulled = await pullFromServer();
  } catch (err) {
    errors.push(`Pull: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }

  return { pushed, pulled, errors };
}

export async function checkConnectivity(): Promise<boolean> {
  try {
    const response = await fetch('/api/sync/status', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return false;
    const data = await response.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Deep copy of a pulled value with every ISO timestamp string turned into a Date. */
export function reviveDates(value: unknown): unknown {
  if (typeof value === 'string') {
    return ISO_TIMESTAMP.test(value) ? new Date(value) : value;
  }
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, reviveDates(v)])
    );
  }
  return value;
}
