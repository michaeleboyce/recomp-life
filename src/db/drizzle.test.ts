import { afterEach, describe, expect, it, vi } from "vitest";

const neon = vi.fn((url: string) => ({ query: vi.fn(async () => [{ url }]) }));
vi.mock("@neondatabase/serverless", () => ({ neon: (url: string) => neon(url) }));

const saved = process.env.DATABASE_URL;

afterEach(() => {
  if (saved === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = saved;
  neon.mockClear();
  vi.resetModules();
});

describe("the server database client", () => {
  it("loads without a database URL, so a build with none (a preview deployment) does not fail", async () => {
    delete process.env.DATABASE_URL;
    await expect(import("./drizzle")).resolves.toBeDefined();
    expect(neon).not.toHaveBeenCalled();
  });

  it("refuses a query, by name, when there is no database URL", async () => {
    delete process.env.DATABASE_URL;
    const { neonSql } = await import("./drizzle");
    await expect(neonSql.query("select 1", [])).rejects.toThrow(/DATABASE_URL is not set/);
  });

  it("connects once, on the first query", async () => {
    process.env.DATABASE_URL = "postgres://made-up:made-up@localhost:5432/made_up";
    const { neonSql } = await import("./drizzle");
    expect(neon).not.toHaveBeenCalled();
    await neonSql.query("select 1", []);
    await neonSql.query("select 2", []);
    expect(neon).toHaveBeenCalledTimes(1);
  });
});
