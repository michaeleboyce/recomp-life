import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LiftState } from "@/types";
import { input, UNAFFECTED } from "./testFixtures";

const { useLiftStates, previewLogChange, loadRebuildInput, commitLogChange, toast } = vi.hoisted(() => ({
  useLiftStates: vi.fn(),
  previewLogChange: vi.fn(),
  loadRebuildInput: vi.fn(),
  commitLogChange: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/hooks", () => ({ useLiftStates }));
vi.mock("@/lib/rebuild", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rebuild")>()),
  previewLogChange,
}));
vi.mock("@/lib/data/derived", () => ({ loadRebuildInput }));
vi.mock("@/lib/data/logEdits", () => ({ commitLogChange }));
vi.mock("@/components/ui/toast", () => ({ toast }));

import { AdjustLiftSheet, buildManualAdjustment } from "./AdjustLiftSheet";

const SQUAT = { exerciseId: "squat", t1Weight: 205, t1Stage: "5x3", t2Weight: 150, t2Stage: "3x10", t3Weight: 0 } as LiftState;

beforeEach(() => {
  vi.clearAllMocks();
  useLiftStates.mockReturnValue([SQUAT]);
  loadRebuildInput.mockResolvedValue(input());
  previewLogChange.mockReturnValue(UNAFFECTED);
  commitLogChange.mockResolvedValue({});
});
afterEach(cleanup);

describe("buildManualAdjustment", () => {
  it("builds a dated manual adjustment of the tier's fields", () => {
    const at = new Date("2026-11-12T08:00:00");
    expect(buildManualAdjustment("squat", "T1", 200, "6x2", at, () => "id1")).toEqual({
      kind: "adjustLift",
      adjustment: { id: "id1", clientId: "id1", exerciseId: "squat", at, source: "manual", set: { t1Weight: 200, t1Stage: "6x2" }, synced: false },
    });
    expect(buildManualAdjustment("squat", "T3", 50, null, at, () => "id2")).toMatchObject({
      adjustment: { set: { t3Weight: 50 } },
    });
  });
});

describe("AdjustLiftSheet", () => {
  it("opens from its button with the current weight and the explanation", () => {
    render(<AdjustLiftSheet exerciseId="squat" />);
    fireEvent.click(screen.getByRole("button", { name: "Adjust weight" }));
    expect(screen.getByRole("dialog", { name: "Adjust Squat" })).toBeInTheDocument();
    expect(screen.getByText("Saved as a dated change from today on. Past sessions are not altered.")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: /^Weight/ })).toHaveValue(205);
  });

  it("saves a manual adjustment through the save flow", async () => {
    render(<AdjustLiftSheet exerciseId="squat" open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Decrease weight by 5" }));
    fireEvent.click(screen.getByRole("radio", { name: "6x2" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save change" }));
    });
    expect(commitLogChange).toHaveBeenCalledTimes(1);
    const change = commitLogChange.mock.calls[0][0];
    expect(change).toMatchObject({
      kind: "adjustLift",
      adjustment: { exerciseId: "squat", source: "manual", set: { t1Weight: 200, t1Stage: "6x2" }, synced: false },
    });
    expect(change.adjustment.id).toBe(change.adjustment.clientId);
    expect(change.adjustment.at).toBeInstanceOf(Date);
    expect(toast.mock.calls.at(-1)![0].message).toBe("Squat T1 weight saved");
  });

  it("switches tier to the T2 values and leaves the stage out when unchanged", async () => {
    render(<AdjustLiftSheet exerciseId="squat" open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "T2" }));
    expect(screen.getByRole("spinbutton", { name: /^Weight/ })).toHaveValue(150);
    fireEvent.click(screen.getByRole("button", { name: "Increase weight by 5" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save change" }));
    });
    expect(commitLogChange.mock.calls[0][0].adjustment.set).toEqual({ t2Weight: 155 });
  });
});
