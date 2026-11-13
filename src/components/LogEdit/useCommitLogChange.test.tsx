import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LogChange } from "@/lib/rebuild";
import { input, NEXT_CHANGES, set, UNAFFECTED, workout } from "./testFixtures";

const { previewLogChange, loadRebuildInput, commitLogChange, toast } = vi.hoisted(() => ({
  previewLogChange: vi.fn(),
  loadRebuildInput: vi.fn(),
  commitLogChange: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/lib/rebuild", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rebuild")>()),
  previewLogChange,
}));
vi.mock("@/lib/data/derived", () => ({ loadRebuildInput }));
vi.mock("@/lib/data/logEdits", () => ({ commitLogChange }));
vi.mock("@/components/ui/toast", () => ({ toast }));

import { savedMessage, useCommitLogChange, type SubmitResult } from "./useCommitLogChange";

const EDIT: LogChange = { kind: "editSet", workoutId: "w1", setId: "s1", patch: { actualReps: 2 } };
let result: SubmitResult | null = null;

function Harness({ change = EDIT }: { change?: LogChange }) {
  const flow = useCommitLogChange();
  return (
    <>
      <button onClick={async () => (result = await flow.submit(change, { message: "Set saved" }))}>
        go
      </button>
      {flow.sheet}
    </>
  );
}

async function go() {
  await act(async () => {
    fireEvent.click(screen.getByText("go"));
  });
}

/** The toast options from the last call. */
const lastToast = () => toast.mock.calls.at(-1)![0];

beforeEach(() => {
  result = null;
  vi.clearAllMocks();
  loadRebuildInput.mockResolvedValue(input([workout({ sets: [set({ actualReps: 3, rpe: 8 })] })]));
  commitLogChange.mockResolvedValue({});
});
afterEach(cleanup);

describe("useCommitLogChange", () => {
  it("commits at once when the next workout is unchanged, with Undo in the toast", async () => {
    previewLogChange.mockReturnValue(UNAFFECTED);
    render(<Harness />);
    await go();
    expect(result).toBe("committed");
    expect(commitLogChange).toHaveBeenCalledWith(EDIT);
    expect(screen.queryByText("What this changes")).not.toBeInTheDocument();
    expect(lastToast()).toMatchObject({ message: "Set saved", action: { label: "Undo" } });
  });

  it("shows the preview first when the next workout changes, and commits on confirm", async () => {
    previewLogChange.mockReturnValue(NEXT_CHANGES);
    render(<Harness />);
    await go();
    expect(result).toBe("previewing");
    expect(screen.getByText("What this changes")).toBeInTheDocument();
    expect(commitLogChange).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save change" }));
    });
    expect(commitLogChange).toHaveBeenCalledWith(EDIT);
    await waitFor(() => expect(screen.queryByText("What this changes")).not.toBeInTheDocument());
  });

  it("commits nothing when the preview is cancelled", async () => {
    previewLogChange.mockReturnValue(NEXT_CHANGES);
    render(<Harness />);
    await go();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByText("What this changes")).not.toBeInTheDocument());
    expect(commitLogChange).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("Undo commits the inverse change built before saving", async () => {
    previewLogChange.mockReturnValue(UNAFFECTED);
    render(<Harness />);
    await go();
    await act(async () => {
      await lastToast().action.onAction();
    });
    expect(commitLogChange).toHaveBeenLastCalledWith({
      kind: "editSet",
      workoutId: "w1",
      setId: "s1",
      patch: { actualReps: 3 },
    });
    expect(lastToast().message).toBe("Change undone");
  });

  it("reports an error and saves nothing when the preview cannot be computed", async () => {
    loadRebuildInput.mockRejectedValue(new Error("database closed"));
    render(<Harness />);
    await go();
    expect(result).toBe("error");
    expect(commitLogChange).not.toHaveBeenCalled();
    expect(lastToast().message).toBe("Could not save: database closed");
  });

  it("keeps the preview open with the error when saving fails", async () => {
    previewLogChange.mockReturnValue(NEXT_CHANGES);
    commitLogChange.mockRejectedValue(new Error("quota exceeded"));
    render(<Harness />);
    await go();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save change" }));
    });
    expect(screen.getByText("quota exceeded")).toBeInTheDocument();
    expect(screen.getByText("What this changes")).toBeInTheDocument();
  });
});

describe("savedMessage", () => {
  it("adds the PR change, else the e1RM count", () => {
    expect(savedMessage("Set saved", NEXT_CHANGES)).toBe(
      "Set saved. Bench Press best estimated 1RM is now 210 lbs"
    );
    expect(savedMessage("Set saved", { ...UNAFFECTED, e1rmChanges: 2, unaffected: false })).toBe(
      "Set saved. 2 estimated 1RM entries updated"
    );
    expect(savedMessage("Set saved", UNAFFECTED)).toBe("Set saved");
  });
});
