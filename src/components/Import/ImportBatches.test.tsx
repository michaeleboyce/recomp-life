import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ImportBatchSummary } from "@/lib/data/imported";

const data = vi.hoisted(() => ({
  listImportBatches: vi.fn(),
  undoImportBatch: vi.fn(),
  restoreImportBatch: vi.fn(),
}));
vi.mock("@/lib/data/imported", () => data);
vi.mock("dexie-react-hooks", () => ({ useLiveQuery: () => data.listImportBatches() }));
const toasts = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/components/ui/toast", () => toasts);

import { ImportBatches } from "./ImportBatches";

const counts = { sessions: 2, runs: 0, activities: 0 };
const none = { sessions: 0, runs: 0, activities: 0 };
const batch = {
  batchId: "fitbod-1",
  sourceApp: "fitbod",
  importedOn: "2026-11-16",
  live: counts,
  undone: none,
} as unknown as ImportBatchSummary;

beforeEach(() => {
  data.listImportBatches.mockReturnValue([batch]);
  data.undoImportBatch.mockResolvedValue({ ...counts, sets: 10 });
  toasts.toast.mockReset();
});
afterEach(cleanup);

describe("ImportBatches", () => {
  it("says so when Restore from the undo toast fails, instead of failing silently", async () => {
    render(<ImportBatches />);
    fireEvent.click(screen.getByRole("button", { name: /^Undo / }));
    await waitFor(() => expect(toasts.toast).toHaveBeenCalled());
    const shown = toasts.toast.mock.calls[0][0];
    expect(shown.action.label).toBe("Restore");

    data.restoreImportBatch.mockRejectedValue(new Error("disk full"));
    await shown.action.onAction();
    await waitFor(() =>
      expect(toasts.toast).toHaveBeenLastCalledWith({ message: "Could not restore the import." })
    );
  });

  it("says what came back when Restore from the undo toast works", async () => {
    render(<ImportBatches />);
    fireEvent.click(screen.getByRole("button", { name: /^Undo / }));
    await waitFor(() => expect(toasts.toast).toHaveBeenCalled());
    const shown = toasts.toast.mock.calls[0][0];

    data.restoreImportBatch.mockResolvedValue(counts);
    await shown.action.onAction();
    await waitFor(() =>
      expect(toasts.toast).toHaveBeenLastCalledWith({ message: expect.stringMatching(/restored: 2 sessions$/) })
    );
  });
});
