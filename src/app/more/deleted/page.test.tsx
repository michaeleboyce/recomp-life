import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { softDelete } from "@/lib/data/logEdits";
import { clearDb } from "@/lib/data/testUtils";
import RecentlyDeletedPage from "./page";

beforeEach(async () => {
  cleanup();
  await clearDb();
  await initializeDatabase();
});

async function addWeighIn(id: string, weight: number) {
  await db.bodyweight.add({
    id,
    clientId: id,
    date: new Date("2026-11-10T07:00:00Z"),
    weight,
    timeOfDay: "morning",
    updatedAt: 1,
    deletedAt: null,
    synced: false,
  });
}

describe("Recently deleted page", () => {
  it("has a title, a way back to More and an empty state", async () => {
    render(<RecentlyDeletedPage />);
    expect(screen.getByRole("heading", { name: "Recently deleted", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/more");
    expect(await screen.findByText("Nothing deleted")).toBeInTheDocument();
  });

  it("lists a deleted entry and restores it", async () => {
    await addWeighIn("bw1", 201.4);
    await softDelete("bodyweight", "bw1");
    render(<RecentlyDeletedPage />);

    expect(await screen.findByText("Weigh-in 201.4 lbs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore Weigh-in 201.4 lbs" }));

    await waitFor(async () => expect((await db.bodyweight.get("bw1"))!.deletedAt).toBeNull());
    expect(await screen.findByText("Nothing deleted")).toBeInTheDocument();
  });

  it("lists an import with its day, source and counts; undoes it as a whole and restores it", async () => {
    await db.importedSessions.add({
      id: "imp-1", clientId: "imp-1", sourceApp: "fitbod", startedAt: new Date("2024-03-04T17:00:00Z"),
      startIsLocal: false, endedAt: null, title: "", notes: "", importBatchId: "preload-2026-11-16",
      sets: [], updatedAt: 1, deletedAt: null, synced: true,
    });
    await db.runs.add({
      id: "run-1", clientId: "run-1", date: new Date("2024-03-05T07:00:00Z"), durationMinutes: 20, distanceMiles: 2,
      type: "outdoor", category: "other", notes: "", perceivedEffort: null, sourceName: "Fitbod",
      importBatchId: "preload-2026-11-16", updatedAt: 1, deletedAt: null, synced: true,
    });
    render(<RecentlyDeletedPage />);

    expect(await screen.findByText("Fitbod history preload, Nov 16, 2026")).toBeInTheDocument();
    expect(screen.getByText("In the log: 1 session (0 sets), 1 run")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo Fitbod history preload, Nov 16, 2026" }));
    await waitFor(async () => expect((await db.runs.get("run-1"))!.deletedAt).not.toBeNull());
    expect((await db.importedSessions.get("imp-1"))!.deletedAt).not.toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Restore Fitbod history preload, Nov 16, 2026" }));
    await waitFor(async () => expect((await db.importedSessions.get("imp-1"))!.deletedAt).toBeNull());
    expect((await db.runs.get("run-1"))!.deletedAt).toBeNull();
  });
});
