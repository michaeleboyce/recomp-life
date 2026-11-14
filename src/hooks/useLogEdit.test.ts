import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ChangePreview, DerivedDiff, LogChange, RebuildInput } from "@/lib/rebuild";

const { previewLogChange, loadRebuildInput, checkDerived, applyRebuild, listDeleted } = vi.hoisted(() => ({
  previewLogChange: vi.fn(),
  loadRebuildInput: vi.fn(),
  checkDerived: vi.fn(),
  applyRebuild: vi.fn(),
  listDeleted: vi.fn(),
}));
vi.mock("@/lib/rebuild", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rebuild")>()),
  previewLogChange,
}));
vi.mock("@/lib/data/derived", () => ({ loadRebuildInput, checkDerived, applyRebuild }));
vi.mock("@/lib/data/logEdits", () => ({ listDeleted }));

import { useDerivedCheck, useLogChangePreview, useRecentlyDeleted } from "./useLogEdit";

const INPUT = { workouts: [], adjustments: [], settings: {} } as unknown as RebuildInput;
const PREVIEW: ChangePreview = { nextWorkout: [], prChanges: [], e1rmChanges: 1, unaffected: false };
const CHANGE: LogChange = { kind: "deleteWorkout", workoutId: "w1" };
const DIFF: DerivedDiff = {
  liftStatesToPut: [],
  liftStateIdsToDelete: ["x"],
  e1rmsToPut: [],
  e1rmIdsToDelete: [],
  consistent: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  loadRebuildInput.mockResolvedValue(INPUT);
  previewLogChange.mockReturnValue(PREVIEW);
});

describe("useLogChangePreview", () => {
  it("is undefined for no change and never loads", async () => {
    const { result } = renderHook(() => useLogChangePreview(null));
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toBeUndefined();
    expect(loadRebuildInput).not.toHaveBeenCalled();
  });

  it("loads the engine input and runs the pure preview", async () => {
    const { result } = renderHook(() => useLogChangePreview(CHANGE));
    expect(result.current).toBeUndefined();
    await waitFor(() => expect(result.current).toEqual(PREVIEW));
    expect(previewLogChange).toHaveBeenCalledWith(INPUT, CHANGE, expect.any(Number));
  });

  it("does not recompute for an equal change object, but does for a different one", async () => {
    const { result, rerender } = renderHook(({ c }) => useLogChangePreview(c), {
      initialProps: { c: { ...CHANGE } as LogChange },
    });
    await waitFor(() => expect(result.current).toEqual(PREVIEW));
    rerender({ c: { ...CHANGE } });
    await new Promise((r) => setTimeout(r, 10));
    expect(previewLogChange).toHaveBeenCalledTimes(1);
    rerender({ c: { kind: "deleteWorkout", workoutId: "w2" } });
    await waitFor(() => expect(previewLogChange).toHaveBeenCalledTimes(2));
  });
});

describe("useRecentlyDeleted", () => {
  it("returns the deleted list", async () => {
    listDeleted.mockResolvedValue([{ table: "runs", id: "r1", deletedAt: 1, date: new Date(), label: "Run" }]);
    const { result } = renderHook(() => useRecentlyDeleted());
    await waitFor(() => expect(result.current).toHaveLength(1));
  });
});

describe("useDerivedCheck", () => {
  it("checks, then rebuilds, counting the rows that differ", async () => {
    checkDerived.mockResolvedValue(DIFF);
    applyRebuild.mockResolvedValue(DIFF);
    const { result } = renderHook(() => useDerivedCheck());
    expect(result.current.status).toBe("idle");
    await act(() => result.current.run());
    expect(result.current).toMatchObject({ status: "inconsistent", differences: 1 });
    await act(() => result.current.rebuild());
    expect(result.current).toMatchObject({ status: "rebuilt", differences: 1 });
  });

  it("reports consistency and errors", async () => {
    checkDerived.mockResolvedValueOnce({ ...DIFF, liftStateIdsToDelete: [], consistent: true });
    const { result } = renderHook(() => useDerivedCheck());
    await act(() => result.current.run());
    expect(result.current.status).toBe("consistent");
    checkDerived.mockRejectedValueOnce(new Error("closed"));
    await act(() => result.current.run());
    expect(result.current).toMatchObject({ status: "error", error: "closed" });
  });
});
