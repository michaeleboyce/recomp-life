import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import WeighInPrompt from "./WeighInPrompt";

describe("WeighInPrompt", () => {
  beforeEach(clearDb);
  afterEach(cleanup);

  it("shows the latest weight when nothing is logged today", async () => {
    await db.bodyweight.bulkAdd([
      { id: "a", clientId: "a", date: new Date("2026-01-01T00:00:00"), weight: 180, timeOfDay: "morning", synced: true },
      { id: "b", clientId: "b", date: new Date("2026-01-05T00:00:00"), weight: 178, timeOfDay: "morning", synced: true },
    ]);
    render(<WeighInPrompt />);
    expect(await screen.findByText("Last: 178 lbs")).toBeInTheDocument();
  });

  it("renders nothing once today's weight is logged", async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    await db.bodyweight.add({ id: "t", clientId: "t", date: today, weight: 177, timeOfDay: "morning", synced: false });
    const { container } = render(<WeighInPrompt />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
