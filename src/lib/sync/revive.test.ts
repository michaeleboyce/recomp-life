import { describe, expect, it } from "vitest";
import { decidePull, reviveDates, stampOf, toLocalRow } from "./revive";

describe("decidePull", () => {
  it("inserts without a local row", () => {
    expect(decidePull(undefined, { updatedAt: 1 })).toBe("insert");
  });

  it("overwrites only when the server stamp is strictly greater", () => {
    expect(decidePull({ updatedAt: 1 }, { updatedAt: 2 })).toBe("overwrite");
    expect(decidePull({ updatedAt: 2 }, { updatedAt: 2 })).toBe("keep");
    expect(decidePull({ updatedAt: 3 }, { updatedAt: 2 })).toBe("keep");
  });

  it("counts a missing stamp as 0", () => {
    expect(decidePull({}, { updatedAt: 1 })).toBe("overwrite");
    expect(decidePull({}, { updatedAt: null })).toBe("keep");
    expect(stampOf(undefined)).toBe(0);
  });
});

describe("toLocalRow", () => {
  it("revives dates, drops null optionals, keeps nullable fields and marks synced", () => {
    const row = toLocalRow({
      id: "w1",
      startedAt: "2026-11-10T09:00:00.000Z",
      completedAt: null,
      externalId: null,
      updatedAt: 5,
      sets: [{ completedAt: "2026-11-10T09:10:00.000Z" }],
    });
    expect(row.startedAt).toBeInstanceOf(Date);
    expect(row.completedAt).toBeNull();
    expect("externalId" in row).toBe(false);
    expect(row.deletedAt).toBeNull();
    expect((row.sets as { completedAt: unknown }[])[0].completedAt).toBeInstanceOf(Date);
    expect(row.synced).toBe(true);
  });

  it("leaves ordinary strings alone", () => {
    expect(reviveDates({ templateId: "A1", note: "2026" })).toEqual({ templateId: "A1", note: "2026" });
  });
});
