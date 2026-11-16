// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fromPostgresRow } from "@/lib/syncGuard";
import { toLocalRow } from "@/lib/sync/revive";
import type { TimedRow } from "./cardio";
import { buildFitbodFile, buildGravlFile, fRow, gRow } from "./parse/fixtures";
import {
  PRELOAD_BATCH_SIZE,
  formatTotals,
  insertIgnoring,
  planPreload,
  toPgRows,
  writePreload,
  type PreloadDatabase,
  type Statement,
} from "./preload";

// Every file here is made up: invented names, dates and weights in the real column layout.

const fitbod = () =>
  buildFitbodFile([
    fRow({ Date: "2023-05-01 10:00:00 +0000", Exercise: "Barbell Bench Press", "Weight(kg)": 60, multiplier: " 1.0" }),
    fRow({ Date: "2023-05-01 10:00:00 +0000", Exercise: "Barbell Bench Press", "Weight(kg)": 60, multiplier: " 1.0", isWarmup: "true" }),
    fRow({ Date: "2023-05-01 10:00:00 +0000", Exercise: "Wobbly Hammer Curl" }),
    fRow({ Date: "2023-05-03 07:00:00 +0000", Exercise: "Walking", Reps: 0, "Weight(kg)": 0, "Duration(s)": 1800, "Distance(m)": 2000 }),
    fRow({ Date: "bad" }),
  ]);

const gravl = () =>
  buildGravlFile([
    gRow({ Date: "2023/05/02", "Start Date": "6:00 PM", Exercise: "Dumbbell Bench Press", "Weight (lb)": 50 }),
    gRow({ Date: "2023/05/02", "Start Date": "6:00 PM", Exercise: "Zorblax", Set: 2 }),
    gRow({ Date: "2023/05/02", "Start Date": "6:00 PM", Exercise: "Dumbbell Bench Press", Set: 3, "Set Type": "Dropset", "Weight (lb)": 35 }),
  ]);

describe("planPreload", () => {
  it("parses every file with the built-in mapping and totals counts only", () => {
    const plan = planPreload([{ text: fitbod() }, { text: gravl() }], "preload-test");
    expect(plan.totals.sessions).toBe(2);
    expect(plan.totals.sets).toBe(6);
    expect(plan.totals.files.map((f) => [f.app, f.sessions, f.sets, f.warmups, f.drops, f.cardio, f.rejected])).toEqual([
      ["fitbod", 1, 3, 1, 0, 1, 1],
      ["gravl", 1, 3, 0, 1, 0, 0],
    ]);
    expect(plan.totals.cardio).toEqual({ runs: 0, activities: 1, overlapping: 0, noDuration: 0 });
    expect(plan.totals.names.mapped.names).toBe(2);
    expect(plan.totals.names.guessed.names).toBe(1);
    expect(plan.totals.names.unknown).toEqual({ names: 1, sets: 1 });
    expect(plan.sessions.every((s) => s.importBatchId === "preload-test")).toBe(true);

    const text = formatTotals(plan.totals).join("\n");
    // Names, dates and weights never appear in what the script prints.
    for (const secret of ["Bench", "Zorblax", "Hammer", "2023", "Walking"]) expect(text).not.toContain(secret);
  });

  it("adds the same walk exported twice once", () => {
    const plan = planPreload([{ text: fitbod() }, { text: fitbod() }], "b");
    expect(plan.totals.sessions).toBe(1);
    expect(plan.totals.cardio.activities).toBe(1);
  });
});

describe("rows in the sync format", () => {
  it("maps fields to the push route's columns, stamped now, with sets as JSON", () => {
    const plan = planPreload([{ text: gravl() }], "b");
    const [row] = toPgRows("importedSessions", plan.sessions, 1234);
    expect(row).toMatchObject({
      id: plan.sessions[0].id,
      client_id: plan.sessions[0].id,
      source_app: "gravl",
      start_is_local: true,
      import_batch_id: "b",
      updated_at: 1234,
      deleted_at: null,
      synced: true,
    });
    expect(typeof row.started_at).toBe("string");
    expect(JSON.parse(row.sets as string)).toHaveLength(3);

    // What a device pulls back is the stored record.
    const pulled = toLocalRow(fromPostgresRow("importedSessions", { ...row, sets: JSON.parse(row.sets as string) }));
    expect(pulled.startedAt).toEqual(plan.sessions[0].startedAt);
    expect(pulled.sets).toEqual(JSON.parse(JSON.stringify(plan.sessions[0].sets)));
  });

  it("inserts many rows in one statement that skips stored ids", () => {
    const plan = planPreload([{ text: fitbod() }, { text: gravl() }], "b");
    const rows = toPgRows("importedSessions", plan.sessions, 1);
    const statement = insertIgnoring("importedSessions", rows);
    expect(statement.text).toMatch(/^INSERT INTO "imported_sessions" \(/);
    expect(statement.text).toMatch(/ON CONFLICT DO NOTHING RETURNING "id"$/);
    expect(statement.values).toHaveLength(rows.length * Object.keys(rows[0]).length);
    expect(() => insertIgnoring("importedSessions", [{ bogus: 1 }])).toThrow(/Unknown column/);
  });
});

/** A database that remembers ids, like the primary keys would. */
function fakeDatabase(logged: TimedRow[] = []) {
  const stored = new Map<string, Set<string>>();
  const transactions: Statement[][] = [];
  const db: PreloadDatabase = {
    async transaction(statements) {
      transactions.push(statements);
      return statements.map((s) => {
        const table = /INSERT INTO "([a-z_]+)"/.exec(s.text)![1];
        const columns = /\(([^)]*)\) VALUES/.exec(s.text)![1].split(", ").map((c) => c.replace(/"/g, ""));
        const ids = stored.get(table) ?? new Set<string>();
        stored.set(table, ids);
        const inserted: Array<{ id: string }> = [];
        for (let i = 0; i < s.values.length; i += columns.length) {
          const id = s.values[i + columns.indexOf("id")] as string;
          if (!ids.has(id)) {
            ids.add(id);
            inserted.push({ id });
          }
        }
        return inserted;
      });
    },
    async loggedCardio() {
      return logged;
    },
  };
  return { db, stored, transactions };
}

describe("writePreload", () => {
  it("writes in batches, one transaction each, and a second run inserts nothing", async () => {
    const plan = planPreload([{ text: fitbod() }, { text: gravl() }], "b");
    const fake = fakeDatabase();
    const first = await writePreload(plan, fake.db, 10);
    expect(first).toMatchObject({ sessionsInserted: 2, sessionsSkipped: 0, activitiesInserted: 1, runsInserted: 0 });
    expect(fake.transactions.every((t) => t.length === 1)).toBe(true);
    const second = await writePreload(plan, fake.db, 20);
    expect(second).toMatchObject({ sessionsInserted: 0, sessionsSkipped: 2, activitiesInserted: 0 });
  });

  it("skips cardio that overlaps a session already in the database", async () => {
    const plan = planPreload([{ text: fitbod() }], "b");
    const fake = fakeDatabase([{ id: "health-1", date: "2023-05-03T07:10:00.000Z", durationMinutes: 30, deletedAt: null }]);
    const result = await writePreload(plan, fake.db, 10);
    expect(result.activitiesInserted).toBe(0);
    expect(result.cardioOverlappingLogged).toBe(1);
  });

  it("splits large plans into batches", async () => {
    // One session a day.
    const spread = Array.from({ length: PRELOAD_BATCH_SIZE + 5 }, (_, i) =>
      fRow({ Date: `2022-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")} 10:00:00 +0000` })
    );
    const big = planPreload([{ text: buildFitbodFile(spread) }], "b");
    expect(big.sessions).toHaveLength(PRELOAD_BATCH_SIZE + 5);
    const fake = fakeDatabase();
    const result = await writePreload(big, fake.db, 1);
    expect(result.sessionsInserted).toBe(PRELOAD_BATCH_SIZE + 5);
    expect(fake.transactions).toHaveLength(2);
  });
});
