import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import RunLogger from "./RunLogger";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("RunLogger", () => {
  beforeEach(async () => {
    push.mockClear();
    await clearDb();
  });
  afterEach(cleanup);

  it("saves an unsynced run", async () => {
    render(<RunLogger />);
    fireEvent.change(screen.getByPlaceholderText("30"), { target: { value: "25" } });
    fireEvent.change(screen.getByPlaceholderText("3.0"), { target: { value: "2.5" } });
    fireEvent.click(screen.getByRole("button", { name: "SAVE RUN" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/?runSaved=1"));
    const runs = await db.runs.toArray();
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      durationMinutes: 25,
      distanceMiles: 2.5,
      perceivedEffort: 3,
      synced: false,
    });
  });
});
