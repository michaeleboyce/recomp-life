import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { RunLog } from "@/types";

const { updateRun, softDelete, restore, toast } = vi.hoisted(() => ({
  updateRun: vi.fn(),
  softDelete: vi.fn(),
  restore: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/data/logEdits", () => ({ updateRun, softDelete, restore, commitLogChange: vi.fn() }));
vi.mock("@/lib/data/derived", () => ({ loadRebuildInput: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

import { EntryEditSheet } from "./EntryEditSheet";

const RUN: RunLog = {
  id: "r1",
  clientId: "r1",
  date: new Date("2026-11-11T07:00:00"),
  durationMinutes: 30,
  distanceMiles: 3.1,
  type: "outdoor",
  category: "easy",
  notes: "",
  perceivedEffort: 2,
  synced: true,
};
const NOW = new Date("2026-11-12T12:00:00");

function open() {
  const onOpenChange = vi.fn();
  render(<EntryEditSheet entry={{ table: "runs", row: RUN }} open onOpenChange={onOpenChange} now={NOW} />);
  return { onOpenChange };
}
async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  updateRun.mockResolvedValue(undefined);
  softDelete.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("RunEditSheet", () => {
  it("saves only the changed fields with Undo restoring them", async () => {
    const { onOpenChange } = open();
    fireEvent.change(screen.getByLabelText("Duration (minutes)"), { target: { value: "32" } });
    fireEvent.click(screen.getByRole("radio", { name: "Tempo" }));
    fireEvent.click(screen.getByRole("button", { name: /4\s*Hard/ }));
    await click("Save change");
    expect(updateRun).toHaveBeenCalledWith("r1", { durationMinutes: 32, category: "tempo", perceivedEffort: 4 });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const t = toast.mock.calls.at(-1)![0];
    expect(t.message).toBe("Run saved");
    await act(async () => t.action.onAction());
    expect(updateRun).toHaveBeenLastCalledWith("r1", { durationMinutes: 30, category: "easy", perceivedEffort: 2 });
  });

  it("clears the distance when emptied and rejects a future date", async () => {
    open();
    fireEvent.change(screen.getByLabelText("Distance (miles, optional)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-13T07:00" } });
    await click("Save change");
    expect(updateRun).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("not in the future");
    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-11-11T07:00" } });
    await click("Save change");
    expect(updateRun).toHaveBeenCalledWith("r1", { distanceMiles: null });
  });

  it("deletes the run with Undo", async () => {
    open();
    await click("Delete run");
    expect(softDelete).toHaveBeenCalledWith("runs", "r1");
    expect(toast.mock.calls.at(-1)![0].message).toBe("Run deleted");
  });
});
