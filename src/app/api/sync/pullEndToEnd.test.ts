// End to end, without a database: the real sync client pulls through the real pull
// route, whose queries run against an in-memory table that sorts, filters and limits
// the way Postgres does for the queries `buildSelectPage` writes.
import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type Dexie from "dexie";
import { makeDeviceDb } from "@/lib/sync/testFakes";
import { PULL_PAGE_BYTES, type PullPageResponse } from "@/lib/sync/wire";

type PgRow = Record<string, unknown>;
const pg = vi.hoisted(() => ({ tables: new Map<string, PgRow[]>() }));

/** Runs one page query of `buildSelectPage` against `pg.tables`. */
async function runPageQuery(text: string, values: unknown[]): Promise<PgRow[]> {
  const table = /FROM "([a-z_]+)"/.exec(text)?.[1] ?? "";
  const limit = Number(/LIMIT (\d+)$/.exec(text)?.[1]);
  const sinceAt = /"server_updated_at" >= \$(\d+)::bigint/.exec(text)?.[1];
  const cursorAt = /\("server_updated_at", "client_id"\) > \(\$(\d+)::bigint, \$(\d+)::text\)/.exec(text);
  const since = sinceAt ? Number(values[Number(sinceAt) - 1]) : undefined;
  const cursor = cursorAt
    ? { stamp: Number(values[Number(cursorAt[1]) - 1]), clientId: String(values[Number(cursorAt[2]) - 1]) }
    : undefined;
  const stampOf = (row: PgRow) => Number(row.server_updated_at);
  return (pg.tables.get(table) ?? [])
    .filter((row) => since === undefined || stampOf(row) >= since)
    .filter(
      (row) =>
        !cursor ||
        stampOf(row) > cursor.stamp ||
        (stampOf(row) === cursor.stamp && String(row.client_id) > cursor.clientId)
    )
    .sort(
      (a, b) =>
        stampOf(a) - stampOf(b) || (String(a.client_id) < String(b.client_id) ? -1 : String(a.client_id) > String(b.client_id) ? 1 : 0)
    )
    .slice(0, limit)
    // The driver returns bigint columns as strings.
    .map((row) => ({ ...row, updated_at: String(row.updated_at), server_updated_at: String(row.server_updated_at) }));
}

vi.mock("@/db/drizzle", () => ({ neonSql: { query: (text: string, values: unknown[]) => runPageQuery(text, values) } }));
const derived = vi.hoisted(() => ({ applyRebuild: vi.fn() }));
vi.mock("@/lib/data/derived", () => ({ applyRebuild: derived.applyRebuild }));

import { GET } from "./pull/route";
import { pullFromServer } from "@/lib/sync";

const SECRET = "test-sync-secret-long-enough";
let database: Dexie;
let responses: { status: number; bytes: number }[];

/** A made-up imported session about 1.5 KB long, as the server stores it. */
function importedRow(i: number, stamp: number): PgRow {
  const id = `imp-${String(i).padStart(5, "0")}`;
  return {
    id, client_id: id, updated_at: 1_763_000_000_000, deleted_at: null, external_id: null, synced: true,
    server_updated_at: stamp, source_app: "fitbod", started_at: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000),
    start_is_local: true, ended_at: null, title: "Made-up session", notes: "", import_batch_id: "batch-1",
    sets: Array.from({ length: 12 }, (_, n) => ({
      exerciseName: "Made-up press", exerciseId: "db_bench", reps: 10, weightPerImplementLbs: 40,
      implementCount: 2, role: "working", setNumber: n + 1,
    })),
  };
}

beforeEach(async () => {
  vi.stubEnv("SYNC_SECRET", SECRET);
  localStorage.setItem("recomp-sync-key", SECRET);
  derived.applyRebuild.mockReset().mockResolvedValue({});
  pg.tables.clear();
  responses = [];
  // The client's fetch goes straight into the route handler.
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const response = await GET(new NextRequest(new URL(String(input), "http://localhost"), init as never));
    const text = await response.text();
    responses.push({ status: response.status, bytes: Buffer.byteLength(text) });
    return new Response(text, { status: response.status, headers: response.headers });
  });
  database = makeDeviceDb(`pull-e2e-${Math.random()}`);
  await database.open();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  database.close();
  await database.delete();
});

describe("paged pull, client and route together", () => {
  it("pulls a table of about 4 MB completely, in pages far below the response limit", async () => {
    const count = 2_600;
    pg.tables.set("imported_sessions", Array.from({ length: count }, (_, i) => importedRow(i, 1_000 + Math.floor(i / 7))));
    const total = (pg.tables.get("imported_sessions") ?? []).reduce((sum, row) => sum + JSON.stringify(row).length, 0);
    expect(total).toBeGreaterThan(3_500_000);

    const result = await pullFromServer(database);

    expect(result.errors).toEqual({});
    expect(await database.table("importedSessions").count()).toBe(count);
    expect(result.inserted).toBe(count);
    const pages = responses.filter((r) => r.status === 200);
    expect(pages.length).toBeGreaterThan(4);
    for (const page of pages) expect(page.bytes).toBeLessThan(PULL_PAGE_BYTES + 20_000);
    const stored = await database.table("importedSessions").get("imp-01234");
    expect(stored.startedAt).toBeInstanceOf(Date);
    expect(stored.sets).toHaveLength(12);
  });

  it("the next pull asks only for rows written since, and gets the new one", async () => {
    const now = Date.now();
    pg.tables.set("runs", [
      { id: "r1", client_id: "r1", updated_at: 1, deleted_at: null, server_updated_at: now - 3_600_000, notes: "old" },
    ]);
    await pullFromServer(database);
    pg.tables.get("runs")!.push({ id: "r2", client_id: "r2", updated_at: 1, deleted_at: null, server_updated_at: now + 1, notes: "new" });
    responses = [];

    const result = await pullFromServer(database);

    // The old row is not sent again: only the new one, in one page.
    expect(result.inserted).toBe(1);
    expect(result.kept).toBe(0);
    expect(await database.table("runs").count()).toBe(2);
  });

  it("answers in the documented page shape", async () => {
    pg.tables.set("runs", [{ id: "r1", client_id: "r1", updated_at: 1, deleted_at: null, server_updated_at: 5 }]);
    const res = await GET(
      new NextRequest("http://localhost/api/sync/pull?table=runs", { headers: { authorization: `Bearer ${SECRET}` } })
    );
    const body: PullPageResponse = await res.json();
    expect(Object.keys(body).sort()).toEqual(["nextCursor", "rows", "serverTime", "table"]);
    expect(body.rows).toEqual([{ id: "r1", clientId: "r1", updatedAt: 1, deletedAt: null }]);
  });
});
