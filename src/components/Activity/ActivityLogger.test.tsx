import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import ActivityLogger from "./ActivityLogger";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("ActivityLogger", () => {
  beforeEach(async () => {
    push.mockClear();
    await clearDb();
  });
  afterEach(cleanup);

  it("saves an unsynced yoga session with its style and effort", async () => {
    render(<ActivityLogger kind="yoga" />);
    expect(screen.queryByLabelText("Distance (miles)")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Duration/), { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: "Power" }));
    fireEvent.click(screen.getByRole("button", { name: /Hard/ }));
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/?activitySaved=1"));
    const rows = await db.activities.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "yoga",
      durationMinutes: 45,
      style: "power",
      distanceMiles: null,
      perceivedEffort: 4,
      synced: false,
    });
    expect(await db.runs.count()).toBe(0);
  });

  it("records distance and no style for a ride", async () => {
    render(<ActivityLogger kind="cycling" />);
    expect(screen.queryByRole("button", { name: "Power" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Duration/), { target: { value: "60" } });
    fireEvent.change(screen.getByLabelText("Distance (miles)"), { target: { value: "12.5" } });
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));

    await waitFor(() => expect(push).toHaveBeenCalled());
    expect((await db.activities.toArray())[0]).toMatchObject({
      kind: "cycling",
      style: null,
      distanceMiles: 12.5,
    });
  });

  it("refuses to save without a duration", async () => {
    render(<ActivityLogger kind="yoga" />);
    fireEvent.click(screen.getByRole("button", { name: "SAVE" }));
    expect(await screen.findByText("Please enter a valid duration.")).toBeInTheDocument();
    expect(await db.activities.count()).toBe(0);
    expect(push).not.toHaveBeenCalled();
  });
});
