import { describe, expect, it } from "vitest";
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

  it("keeps exactly one single-row table: the profile", () => {
    expect(SYNC_REGISTRY.filter((t) => t.singleRow).map((t) => t.name)).toEqual(["userProfile"]);
  });
});
