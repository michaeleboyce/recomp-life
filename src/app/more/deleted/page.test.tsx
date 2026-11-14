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
});
