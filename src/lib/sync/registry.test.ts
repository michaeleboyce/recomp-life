import { describe, expect, it } from "vitest";
import { getTableColumns, getTableName } from "drizzle-orm";
import * as schema from "@/db/schema";
import { SYNC_REGISTRY, getSyncTable } from "./registry";

describe("SYNC_REGISTRY", () => {
  it("lists each table once, by local name and by Postgres name", () => {
    const names = SYNC_REGISTRY.map((t) => t.name);
    const pgNames = SYNC_REGISTRY.map((t) => t.pgName);
    expect(new Set(names).size).toBe(names.length);
    expect(new Set(pgNames).size).toBe(pgNames.length);
  });

  it("does not sync derived tables or the removed sets table", () => {
    for (const name of ["liftStates", "estimated1RMs", "sets"]) {
      expect(getSyncTable(name), name).toBeUndefined();
    }
  });

  it("gives every table the sync stamps", () => {
    for (const table of SYNC_REGISTRY) {
      expect(table.columns.clientId, table.name).toBe("client_id");
      expect(table.columns.updatedAt, table.name).toBe("updated_at");
      expect(table.columns.deletedAt, table.name).toBe("deleted_at");
    }
  });

  it("maps every column to a distinct snake_case name", () => {
    for (const table of SYNC_REGISTRY) {
      const columns = Object.values(table.columns);
      expect(new Set(columns).size, table.name).toBe(columns.length);
      for (const column of columns) expect(column, table.name).toMatch(/^[a-z0-9_]+$/);
    }
  });

  it("maps the forecast, coach event and workout decision fields onto the Drizzle columns", () => {
    const tables = new Map<string, (typeof schema)[keyof typeof schema]>(
      Object.values(schema).map((t) => [getTableName(t), t])
    );
    for (const name of ["forecasts", "coachEvents", "workouts"]) {
      const def = getSyncTable(name)!;
      const known = new Set(Object.values(getTableColumns(tables.get(def.pgName)!)).map((c) => c.name));
      for (const column of Object.values(def.columns)) expect(known.has(column), `${name}.${column}`).toBe(true);
    }
    expect(getSyncTable("workouts")!.jsonFields).toContain("decisions");
    expect(getSyncTable("forecasts")!.jsonFields).toEqual(["event", "prediction", "inputs"]);
    expect(getSyncTable("coachEvents")!.jsonFields).toEqual(["data"]);
  });

  it("keeps exactly one single-row table: the profile", () => {
    expect(SYNC_REGISTRY.filter((t) => t.singleRow).map((t) => t.name)).toEqual(["userProfile"]);
  });
});
