import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import type { PainSorenessEntry } from "@/types";
import BodyCheckPage from "./page";

vi.mock("@/components/BodyMap/BodyMapSVG", () => ({
  default: ({ activeEntries }: { activeEntries: unknown[] }) => (
    <div data-testid="map">entries:{activeEntries.length}</div>
  ),
}));
vi.mock("@/components/BodyMap/RegionDetail", () => ({ default: () => null }));
vi.mock("@/components/BodyMap/PainHistory", () => ({ default: () => null }));

const DAY = 24 * 60 * 60 * 1000;

function entry(id: string, ageDays: number): PainSorenessEntry {
  return {
    id,
    clientId: id,
    date: new Date(Date.now() - ageDays * DAY),
    region: "left_shoulder",
    type: "pain",
    severity: 4,
    synced: false,
  } as unknown as PainSorenessEntry;
}

describe("BodyCheckPage", () => {
  beforeEach(clearDb);
  afterEach(cleanup);

  it("passes only the last 30 days of pain entries to the map", async () => {
    await db.painEntries.bulkAdd([entry("p1", 2), entry("p2", 45)]);
    render(<BodyCheckPage />);
    expect(await screen.findByText("entries:1")).toBeInTheDocument();
  });
});
