import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ActivityLog } from "@/types";

const { updateActivity, softDelete, toast } = vi.hoisted(() => ({
  updateActivity: vi.fn(),
  softDelete: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/data/logEdits", () => ({ updateActivity, softDelete, restore: vi.fn(), commitLogChange: vi.fn() }));
vi.mock("@/lib/data/derived", () => ({ loadRebuildInput: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

import { ActivityEditSheet } from "./ActivityEditSheet";

const base: ActivityLog = {
  id: "a1",
  clientId: "a1",
  date: new Date("2026-11-11T07:00:00"),
  kind: "yoga",
  durationMinutes: 45,
  style: "flow",
  distanceMiles: null,
  notes: "",
  perceivedEffort: 2,
  synced: true,
};
const NOW = new Date("2026-11-12T12:00:00");

beforeEach(() => {
  vi.clearAllMocks();
  updateActivity.mockResolvedValue(undefined);
  softDelete.mockResolvedValue(undefined);
});
afterEach(cleanup);

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("ActivityEditSheet", () => {
  it("edits a yoga session's style; no distance field for yoga", async () => {
    render(<ActivityEditSheet entry={base} open onOpenChange={() => {}} now={NOW} />);
    expect(screen.getByRole("dialog", { name: "Edit flow yoga" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Distance (miles, optional)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Power" }));
    fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Hot room" } });
    await click("Save change");
    expect(updateActivity).toHaveBeenCalledWith("a1", { style: "power", notes: "Hot room" });
    expect(toast.mock.calls.at(-1)![0].message).toBe("Flow yoga saved");
  });

  it("offers distance for a hike and deletes", async () => {
    const hike: ActivityLog = { ...base, kind: "hiking", style: null, distanceMiles: 4 };
    render(<ActivityEditSheet entry={hike} open onOpenChange={() => {}} now={NOW} />);
    expect(screen.queryByRole("radiogroup", { name: "Yoga style" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Distance (miles, optional)"), { target: { value: "5.5" } });
    await click("Save change");
    expect(updateActivity).toHaveBeenCalledWith("a1", { distanceMiles: 5.5 });
    await click("Delete activity");
    expect(softDelete).toHaveBeenCalledWith("activities", "a1");
  });
});
