// Test doubles for the sync client: a minimal per-device Dexie database and an
// in-memory server that implements the wire contract (src/lib/sync/wire.ts) the way
// the real routes do: last write wins by clientId per table, soft-deleted rows kept,
// the profile forced to PROFILE_ID. Import "fake-indexeddb/auto" before using it.
import Dexie from "dexie";
import { SYNC_META_TABLE } from "./rebuildMarker";
import { PROFILE_ID, SYNC_REGISTRY, getSyncTable } from "./registry";
import {
  MAX_CLOCK_SKEW_MS,
  PULL_PAGE_ROWS,
  decodePullCursor,
  encodePullCursor,
  type PullPageResponse,
  type PushRequest,
  type PushResponse,
  type WireRow,
} from "./wire";

/**
 * A device database holding the registry tables (primary key id, clientId index) and
 * the sync bookkeeping table that holds the "rebuild needed" marker.
 */
export function makeDeviceDb(name: string): Dexie {
  const database = new Dexie(name);
  database.version(1).stores({
    ...Object.fromEntries(SYNC_REGISTRY.map((def) => [def.name, "id, clientId"])),
    [SYNC_META_TABLE]: "key",
  });
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
  /** Pull only: the `since` and `cursor` asked for. */
  since?: number;
  cursor?: string;
}

export class FakeSyncServer {
  /** table name -> clientId -> row as the server stores it (JSON-safe). */
  readonly tables = new Map<string, Map<string, WireRow>>();
  /** table name -> clientId -> the server's write stamp for that row (`clock()` when written). */
  readonly stamps = new Map<string, Map<string, number>>();
  /** Rows per pull page (the real server's PULL_PAGE_ROWS unless a test lowers it). */
  pageRows = PULL_PAGE_ROWS;
  readonly requests: FakeRequest[] = [];
  /** The device whose request is being served; set with `as()`. */
  speaking: string | null = null;
  clock = () => Date.now();
  /** Push to these tables answers 500. */
  readonly failPush = new Set<string>();
  /** Pull of these tables answers 500 with this reason. */
  pullErrors: Record<string, string> = {};
  /** Runs before a pull page is served; a test may change rows here (between pages). */
  onPull?: (request: FakeRequest) => void | Promise<void>;
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
    if (url.pathname === "/api/sync/pull" && method === "GET") {
      request.table = url.searchParams.get("table") ?? undefined;
      const since = url.searchParams.get("since");
      if (since !== null) request.since = Number(since);
      request.cursor = url.searchParams.get("cursor") ?? undefined;
      await this.onPull?.(request);
      return this.pull(request);
    }
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
        this.store(body.table, existing ? { ...existing, ...row, id: existing.id } : row, now);
        applied += 1;
      }
    }
    const response: PushResponse = { success: true, applied, skipped: body.rows.length - applied };
    return json(response);
  }

  /**
   * Writes a row as the push route does, stamping it with the server's clock (or
   * `stamp`). Tests use it to put rows on the server directly.
   */
  store(tableName: string, row: WireRow, stamp = this.clock()): void {
    const table = this.tables.get(tableName) ?? new Map<string, WireRow>();
    this.tables.set(tableName, table);
    const stamps = this.stamps.get(tableName) ?? new Map<string, number>();
    this.stamps.set(tableName, stamps);
    const key = String(row.clientId);
    table.set(key, row);
    stamps.set(key, stamp);
  }

  /** One page of one table, as the pull route serves it: server write order, then clientId. */
  private pull(request: FakeRequest): Response {
    const name = request.table ?? "";
    const def = getSyncTable(name);
    if (!def) return json({ error: `Unknown table: ${name}` }, 400);
    if (name in this.pullErrors) return json({ error: this.pullErrors[name], code: "read_failed" }, 500);
    let cursor = null as ReturnType<typeof decodePullCursor>;
    if (request.cursor !== undefined) {
      cursor = decodePullCursor(request.cursor);
      if (!cursor) return json({ error: "bad cursor" }, 400);
    }

    const stamps = this.stamps.get(name) ?? new Map<string, number>();
    const ordered = this.rows(name)
      .map((row) => ({ row, stamp: stamps.get(String(row.clientId)) ?? 0, key: String(row.clientId) }))
      .filter(({ stamp }) => request.since === undefined || stamp >= request.since)
      .filter(
        ({ stamp, key }) => !cursor || stamp > cursor.stamp || (stamp === cursor.stamp && key > cursor.clientId)
      )
      .sort((a, b) => a.stamp - b.stamp || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    const page = ordered.slice(0, this.pageRows);
    const last = page[page.length - 1];
    const response: PullPageResponse = {
      table: name,
      // Postgres returns every column: unset optional ones arrive as null.
      rows: page.map(({ row }) => ({ externalId: null, deletedAt: null, ...row })),
      nextCursor:
        page.length === this.pageRows && last ? encodePullCursor({ stamp: last.stamp, clientId: last.key }) : null,
      serverTime: this.clock(),
    };
    return json(response);
  }
}
