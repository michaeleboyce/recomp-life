import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import WeighInPage from "./page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("WeighInPage", () => {
  beforeEach(async () => {
    push.mockClear();
    await clearDb();
  });
  afterEach(cleanup);

  it("saves a new unsynced bodyweight row and returns home", async () => {
    render(<WeighInPage />);
    const input = await screen.findByPlaceholderText("0.0");
    fireEvent.change(input, { target: { value: "181.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Weight" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
    const rows = await db.bodyweight.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ weight: 181.5, synced: false });
    expect(rows[0].clientId).toBe(rows[0].id);
  });

  it("pre-fills from the latest entry and lists recent entries", async () => {
    await db.bodyweight.add({
      id: "b1",
      clientId: "b1",
      date: new Date("2026-11-01T00:00:00"),
      weight: 190,
      timeOfDay: "morning",
      synced: true,
    });
    render(<WeighInPage />);
    expect(await screen.findByDisplayValue("190")).toBeInTheDocument();
    expect(screen.getByText("Last 1 Entries")).toBeInTheDocument();
  });
});
