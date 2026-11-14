import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PainSorenessEntry } from "@/types";

const { updatePainEntry, softDelete, toast } = vi.hoisted(() => ({
  updatePainEntry: vi.fn(),
  softDelete: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/data/records", () => ({ updatePainEntry }));
vi.mock("@/lib/data/logEdits", () => ({ softDelete, restore: vi.fn(), commitLogChange: vi.fn() }));
vi.mock("@/lib/data/derived", () => ({ loadRebuildInput: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

import { PainEditSheet } from "./PainEditSheet";

const ENTRY: PainSorenessEntry = {
  id: "p1",
  clientId: "p1",
  date: new Date("2026-11-11T07:00:00"),
  region: "lower_back",
  sensation: "pain",
  severity: 3,
  synced: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  updatePainEntry.mockResolvedValue(undefined);
  softDelete.mockResolvedValue(undefined);
});
afterEach(cleanup);

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("PainEditSheet", () => {
  it("edits region, severity and notes", async () => {
    render(<PainEditSheet entry={ENTRY} open onOpenChange={() => {}} />);
    expect(screen.getByLabelText("Region")).toHaveDisplayValue("Lower Back");
    fireEvent.change(screen.getByLabelText("Region"), { target: { value: "left_knee" } });
    fireEvent.click(screen.getByRole("radio", { name: "2" }));
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Better" } });
    await click("Save change");
    expect(updatePainEntry).toHaveBeenCalledWith("p1", { region: "left_knee", severity: 2, notes: "Better" });
    expect(toast.mock.calls.at(-1)![0].message).toBe("Pain entry saved");
  });

  it("deletes the entry", async () => {
    render(<PainEditSheet entry={ENTRY} open onOpenChange={() => {}} />);
    await click("Delete entry");
    expect(softDelete).toHaveBeenCalledWith("painEntries", "p1");
    expect(toast.mock.calls.at(-1)![0].message).toBe("Pain entry, lower back deleted");
  });
});
