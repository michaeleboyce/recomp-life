import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { BodyweightLog } from "@/types";

const { updateBodyweight, softDelete, restore, toast } = vi.hoisted(() => ({
  updateBodyweight: vi.fn(),
  softDelete: vi.fn(),
  restore: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/data/records", () => ({ updateBodyweight }));
vi.mock("@/lib/data/logEdits", () => ({ softDelete, restore, commitLogChange: vi.fn() }));
vi.mock("@/lib/data/derived", () => ({ loadRebuildInput: vi.fn() }));
vi.mock("@/components/ui/toast", () => ({ toast }));

import { WeighInEditSheet } from "./WeighInEditSheet";

const ENTRY: BodyweightLog = {
  id: "bw1",
  clientId: "bw1",
  date: new Date("2026-11-11T07:00:00"),
  weight: 201.4,
  timeOfDay: "morning",
  synced: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  updateBodyweight.mockResolvedValue(undefined);
  softDelete.mockResolvedValue(undefined);
  restore.mockResolvedValue(undefined);
});
afterEach(cleanup);

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("WeighInEditSheet", () => {
  it("saves weight and time of day", async () => {
    render(<WeighInEditSheet entry={ENTRY} open onOpenChange={() => {}} now={new Date("2026-11-12T12:00:00")} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: /^Weight/ }), { target: { value: "200.8" } });
    fireEvent.click(screen.getByRole("radio", { name: "Evening" }));
    await click("Save change");
    expect(updateBodyweight).toHaveBeenCalledWith("bw1", { weight: 200.8, timeOfDay: "evening" });
  });

  it("rejects a weight out of range", async () => {
    render(<WeighInEditSheet entry={ENTRY} open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: /^Weight/ }), { target: { value: "20" } });
    await click("Save change");
    expect(updateBodyweight).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("between 50 and 500 lbs");
  });

  it("deletes with Undo that restores it", async () => {
    render(<WeighInEditSheet entry={ENTRY} open onOpenChange={() => {}} />);
    await click("Delete weigh-in");
    expect(softDelete).toHaveBeenCalledWith("bodyweight", "bw1");
    const t = toast.mock.calls.at(-1)![0];
    expect(t.message).toBe("Weigh-in 201.4 lbs deleted");
    await act(async () => t.action.onAction());
    expect(restore).toHaveBeenCalledWith("bodyweight", "bw1");
  });
});
