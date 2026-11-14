// Test doubles for the sync client: a minimal per-device Dexie database and an
// in-memory server that implements the wire contract (src/lib/sync/wire.ts) the way
// the real routes do: last write wins by clientId per table, soft-deleted rows kept,
// the profile forced to PROFILE_ID. Import "fake-indexeddb/auto" before using it.
import Dexie from "dexie";
import { PROFILE_ID, SYNC_REGISTRY, getSyncTable } from "./registry";
import {
  MAX_CLOCK_SKEW_MS,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type WireRow,
} from "./wire";

/** A device database holding only the registry tables (primary key id, clientId index). */
export function makeDeviceDb(name: string): Dexie {
  const database = new Dexie(name);
  database.version(1).stores(
    Object.fromEntries(SYNC_REGISTRY.map((def) => [def.name, "id, clientId"]))
  );
  return database;
}

export const TEST_PASSPHRASE = "test-passphrase";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export interface FakeRequest {
  device: string | null;
  method: string;
  path: string;
  table?: string;
  rowCount?: number;
}

export class FakeSyncServer {
  /** table name -> clientId -> row as the server stores it (JSON-safe). */
  readonly tables = new Map<string, Map<string, WireRow>>();
  readonly requests: FakeRequest[] = [];
  /** The device whose request is being served; set with `as()`. */
  speaking: string | null = null;
  clock = () => Date.now();
  /** Push to these tables answers 500. */
  readonly failPush = new Set<string>();
  /** Pull reports these tables in `errors` instead of `rows`. */
  pullErrors: Record<string, string> = {};
  /** Runs while a push is being served, before the response is sent. */
  onPush?: (device: string | null, request: PushRequest) => void | Promise<void>;

  /** Runs `fn` with `device` as the one speaking to the server. */
  async as<T>(device: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.speaking;
    this.speaking = device;
    try {
      return await fn();
    } finally {
      this.speaking = previous;
    }
  }

  rows(table: string): WireRow[] {
    return [...(this.tables.get(table)?.values() ?? [])];
  }

  /** A `fetch` replacement that routes sync requests here. */
  readonly fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(String(input), "http://fake.local");
    const method = (init.method ?? "GET").toUpperCase();
    const headers = (init.headers ?? {}) as Record<string, string>;
    const request: FakeRequest = { device: this.speaking, method, path: url.pathname };
    this.requests.push(request);

    if (url.pathname === "/api/sync/status") return json({ ok: true });
    if (headers.Authorization !== `Bearer ${TEST_PASSPHRASE}`) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (url.pathname === "/api/sync/push" && method === "POST") {
      const body = JSON.parse(String(init.body)) as PushRequest;
      request.table = body.table;
      request.rowCount = body.rows.length;
      return this.push(body);
    }
    if (url.pathname === "/api/sync/pull" && method === "GET") return this.pull();
    return json({ error: "Not found" }, 404);
  };

  private async push(body: PushRequest): Promise<Response> {
    const def = getSyncTable(body.table);
    if (!def) return json({ error: `Unknown table: ${body.table}` }, 400);
    if (this.failPush.has(body.table)) return json({ error: "Boom" }, 500);
    await this.onPush?.(this.speaking, body);

    const now = this.clock();
    const table = this.tables.get(body.table) ?? new Map<string, WireRow>();
    this.tables.set(body.table, table);
    let applied = 0;
    for (const incoming of body.rows) {
      // Stored as JSON: dates become ISO strings, as they come back from Postgres.
      const row = JSON.parse(JSON.stringify(incoming)) as WireRow;
      if (typeof row.updatedAt !== "number" || row.updatedAt > now + MAX_CLOCK_SKEW_MS) {
        row.updatedAt = now;
      }
      if (def.singleRow) {
        row.id = PROFILE_ID;
        row.clientId = PROFILE_ID;
      }
      row.synced = true;
      const key = String(row.clientId);
      const existing = table.get(key);
      if (!existing || Number(row.updatedAt) >= Number(existing.updatedAt ?? 0)) {
        // An update never changes the stored id (the upsert excludes id and client_id).
        table.set(key, existing ? { ...existing, ...row, id: existing.id } : row);
        applied += 1;
      }
    }
    const response: PushResponse = { success: true, applied, skipped: body.rows.length - applied };
    return json(response);
  }

  private pull(): Response {
    const rows: Record<string, WireRow[]> = {};
    for (const { name } of SYNC_REGISTRY) {
      if (name in this.pullErrors) continue;
      // Postgres returns every column: unset optional ones arrive as null.
      rows[name] = this.rows(name).map((row) => ({ externalId: null, deletedAt: null, ...row }));
    }
    const response: PullResponse = { rows, errors: { ...this.pullErrors }, serverTime: this.clock() };
    return json(response);
  }
}
