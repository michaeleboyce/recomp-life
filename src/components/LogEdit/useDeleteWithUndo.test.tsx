import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LogTable } from "@/lib/data/logEdits";
import { input, NEXT_CHANGES, UNAFFECTED, workout } from "./testFixtures";

const { previewLogChange, loadRebuildInput, commitLogChange, softDelete, restore, toast } = vi.hoisted(() => ({
  previewLogChange: vi.fn(),
  loadRebuildInput: vi.fn(),
  commitLogChange: vi.fn(),
  softDelete: vi.fn(),
  restore: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/rebuild", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rebuild")>()),
  previewLogChange,
}));
vi.mock("@/lib/data/derived", () => ({ loadRebuildInput }));
vi.mock("@/lib/data/logEdits", () => ({ commitLogChange, softDelete, restore }));
vi.mock("@/components/ui/toast", () => ({ toast }));

import { useDeleteWithUndo } from "./useDeleteWithUndo";

function Harness({ table, id, label }: { table: LogTable; id: string; label: string }) {
  const { deleteEntry, sheet } = useDeleteWithUndo();
  return (
    <>
      <button onClick={() => void deleteEntry(table, id, label)}>delete</button>
      {sheet}
    </>
  );
}

const lastToast = () => toast.mock.calls.at(-1)![0];
async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  softDelete.mockResolvedValue(undefined);
  restore.mockResolvedValue(undefined);
  loadRebuildInput.mockResolvedValue(input([workout({ id: "w1" })]));
});
afterEach(cleanup);

describe("useDeleteWithUndo", () => {
  it("soft-deletes, then Undo in the toast restores", async () => {
    render(<Harness table="bodyweight" id="bw1" label="Weigh-in 201.4 lbs" />);
    await click("delete");
    expect(softDelete).toHaveBeenCalledWith("bodyweight", "bw1");
    expect(lastToast()).toMatchObject({ message: "Weigh-in 201.4 lbs deleted", action: { label: "Undo" } });
    await act(async () => {
      await lastToast().action.onAction();
    });
    expect(restore).toHaveBeenCalledWith("bodyweight", "bw1");
    expect(lastToast().message).toBe("Weigh-in 201.4 lbs restored");
  });

  it("reports a failed delete", async () => {
    softDelete.mockRejectedValue(new Error("offline"));
    render(<Harness table="runs" id="r1" label="Run" />);
    await click("delete");
    expect(lastToast().message).toBe("Could not delete: offline");
  });

  it("deletes a workout at once when the next workout is unchanged", async () => {
    previewLogChange.mockReturnValue(UNAFFECTED);
    render(<Harness table="workouts" id="w1" label="Workout A1" />);
    await click("delete");
    expect(previewLogChange).toHaveBeenCalledWith(expect.anything(), { kind: "deleteWorkout", workoutId: "w1" }, expect.any(Number));
    expect(softDelete).toHaveBeenCalledWith("workouts", "w1");
    expect(commitLogChange).not.toHaveBeenCalled();
    await act(async () => {
      await lastToast().action.onAction();
    });
    expect(restore).toHaveBeenCalledWith("workouts", "w1");
  });

  it("shows the preview before deleting a workout that changes the next one", async () => {
    previewLogChange.mockReturnValue(NEXT_CHANGES);
    render(<Harness table="workouts" id="w1" label="Workout A1" />);
    await click("delete");
    expect(screen.getByText("What this changes")).toBeInTheDocument();
    expect(softDelete).not.toHaveBeenCalled();
    await click("Delete workout");
    expect(softDelete).toHaveBeenCalledWith("workouts", "w1");
  });
});
