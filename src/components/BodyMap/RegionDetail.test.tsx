import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import RegionDetail from "./RegionDetail";

// Radix sliders measure themselves; jsdom has no ResizeObserver.
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
);

beforeEach(clearDb);

describe("RegionDetail", () => {
  it("saves an unsynced pain entry and reports it", async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(
      <RegionDetail
        region="left_shoulder"
        onClose={onClose}
        onSave={onSave}
        onRedFlagTriggered={vi.fn()}
      />
    );
    fireEvent.click(await screen.findByRole("button", { name: "Save Entry" }));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const rows = await db.painEntries.toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      region: "left_shoulder",
      sensation: "soreness",
      severity: 1,
      synced: false,
    });
    expect(onSave.mock.calls[0][0].id).toBe(rows[0].id);
    expect(onClose).toHaveBeenCalled();
  });
});
