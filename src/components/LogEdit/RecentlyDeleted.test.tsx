import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { DeletedItem } from "@/lib/data/logEdits";
import { input, UNAFFECTED, workout } from "./testFixtures";

const { useRecentlyDeleted, previewLogChange, loadRebuildInput, commitLogChange, softDelete, restore, toast } =
  vi.hoisted(() => ({
    useRecentlyDeleted: vi.fn(),
    previewLogChange: vi.fn(),
    loadRebuildInput: vi.fn(),
    commitLogChange: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    toast: vi.fn(),
  }));
vi.mock("@/hooks", () => ({ useRecentlyDeleted }));
vi.mock("@/lib/rebuild", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rebuild")>()),
  previewLogChange,
}));
vi.mock("@/lib/data/derived", () => ({ loadRebuildInput }));
vi.mock("@/lib/data/logEdits", () => ({ commitLogChange, softDelete, restore }));
vi.mock("@/components/ui/toast", () => ({ toast }));

import { groupByDeletionDay, RecentlyDeleted } from "./RecentlyDeleted";

const NOW = new Date("2026-11-12T15:00:00").getTime();
const ITEMS: DeletedItem[] = [
  { table: "bodyweight", id: "bw1", deletedAt: new Date("2026-11-12T09:00:00").getTime(), date: new Date("2026-11-11T07:00:00"), label: "Weigh-in 201.4 lbs" },
  { table: "workouts", id: "w1", deletedAt: new Date("2026-11-11T20:00:00").getTime(), date: new Date("2026-11-10T10:00:00"), label: "A1 workout" },
  { table: "runs", id: "r1", deletedAt: new Date("2026-11-03T20:00:00").getTime(), date: new Date("2026-11-02T10:00:00"), label: "Run, 3.1 mi" },
];

beforeEach(() => {
  vi.clearAllMocks();
  useRecentlyDeleted.mockReturnValue(ITEMS);
  restore.mockResolvedValue(undefined);
  loadRebuildInput.mockResolvedValue(input([workout({ id: "w1", deletedAt: 1 })]));
  previewLogChange.mockReturnValue(UNAFFECTED);
});
afterEach(cleanup);

describe("RecentlyDeleted", () => {
  it("groups entries by the day they were deleted, with what and when", () => {
    render(<RecentlyDeleted now={NOW} />);
    expect(screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"))).toEqual([
      "Deleted today",
      "Deleted yesterday",
      "Deleted Tue, Nov 3, 2026",
    ]);
    expect(screen.getByText("Weigh-in 201.4 lbs")).toBeInTheDocument();
    expect(screen.getByText("Wed, Nov 11, 2026")).toBeInTheDocument();
  });

  it("restores an entry and says so", async () => {
    render(<RecentlyDeleted now={NOW} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restore Weigh-in 201.4 lbs" }));
    });
    expect(restore).toHaveBeenCalledWith("bodyweight", "bw1");
    expect(toast.mock.calls.at(-1)![0].message).toBe("Weigh-in 201.4 lbs restored");
  });

  it("restores a workout through the save flow, with Undo", async () => {
    render(<RecentlyDeleted now={NOW} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restore A1 workout" }));
    });
    expect(previewLogChange).toHaveBeenCalledWith(expect.anything(), { kind: "restoreWorkout", workoutId: "w1" }, expect.any(Number));
    expect(restore).toHaveBeenCalledWith("workouts", "w1");
    expect(toast.mock.calls.at(-1)![0]).toMatchObject({ message: "A1 workout restored", action: { label: "Undo" } });
  });

  it("reports a failed restore", async () => {
    restore.mockRejectedValue(new Error("offline"));
    render(<RecentlyDeleted now={NOW} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Restore Run, 3.1 mi" }));
    });
    expect(toast.mock.calls.at(-1)![0].message).toBe("Could not restore: offline");
  });

  it("shows an empty state when nothing was deleted", () => {
    useRecentlyDeleted.mockReturnValue([]);
    render(<RecentlyDeleted />);
    expect(screen.getByText("Nothing deleted")).toBeInTheDocument();
  });

  it("groupByDeletionDay orders newest day first", () => {
    expect(groupByDeletionDay(ITEMS, NOW).map((g) => g.items.length)).toEqual([1, 1, 1]);
  });
});
