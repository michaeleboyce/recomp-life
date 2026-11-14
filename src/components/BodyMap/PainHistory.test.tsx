import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import PainHistory from "./PainHistory";
import type { PainSorenessEntry } from "@/types";

beforeEach(clearDb);

const DAY = 24 * 60 * 60 * 1000;
const pain = (
  id: string,
  region: PainSorenessEntry["region"],
  daysAgo: number
): PainSorenessEntry => ({
  id,
  clientId: id,
  date: new Date(Date.now() - daysAgo * DAY),
  region,
  sensation: "pain",
  severity: 2,
  synced: true,
});

describe("PainHistory", () => {
  it("shows only the selected region and resolving deletes the entry", async () => {
    await db.painEntries.bulkAdd([pain("p1", "left_shoulder", 10), pain("p2", "right_knee", 1)]);
    render(<PainHistory region="left_shoulder" />);
    expect(await screen.findByText(/over 7 days old/)).toBeInTheDocument();
    expect(screen.getAllByText("pain")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Resolved!" }));
    // Resolving is a soft delete: the row stays so the delete can sync.
    await waitFor(async () => expect((await db.painEntries.get("p1"))?.deletedAt).toEqual(expect.any(Number)));
    expect(await db.painEntries.get("p2")).toBeDefined();
  });

  it("Still there refreshes the entry and marks it unsynced", async () => {
    await db.painEntries.add(pain("p3", "left_shoulder", 10));
    render(<PainHistory region="left_shoulder" />);
    fireEvent.click(await screen.findByRole("button", { name: "Still there" }));
    await waitFor(async () => expect((await db.painEntries.get("p3"))?.synced).toBe(false));
  });
});
