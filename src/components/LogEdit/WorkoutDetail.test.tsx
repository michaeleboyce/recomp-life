import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { WorkoutSession } from "@/types";
import { input, set, UNAFFECTED, workout } from "./testFixtures";

const { useWorkout, previewLogChange, loadRebuildInput, commitLogChange, softDelete, restore, toast } =
  vi.hoisted(() => ({
    useWorkout: vi.fn(),
    previewLogChange: vi.fn(),
    loadRebuildInput: vi.fn(),
    commitLogChange: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    toast: vi.fn(),
  }));
vi.mock("@/hooks", () => ({ useWorkout }));
vi.mock("@/lib/rebuild", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rebuild")>()),
  previewLogChange,
}));
vi.mock("@/lib/data/derived", () => ({ loadRebuildInput }));
vi.mock("@/lib/data/logEdits", () => ({ commitLogChange, softDelete, restore }));
vi.mock("@/components/ui/toast", () => ({ toast }));

import { WorkoutDetail } from "./WorkoutDetail";

const at = (minute: number) => new Date(`2026-11-10T09:${String(minute).padStart(2, "0")}:00`);

const W: WorkoutSession = workout({
  id: "w1",
  location: "home",
  sets: [
    // Stored out of order: the detail sorts by completion time.
    set({ id: "b1", exerciseId: "bench", tier: "T2", setNumber: 1, targetReps: 10, actualReps: 10, weight: 135, completedAt: at(30) }),
    set({ id: "q2", setNumber: 2, actualReps: 3, completedAt: at(12), rpe: 8.5 }),
    set({ id: "wu", tier: "warmup", setNumber: 1, actualReps: 5, weight: 95, completedAt: at(5) }),
    set({ id: "q1", setNumber: 1, actualReps: 3, completedAt: at(10) }),
    set({ id: "q3", setNumber: 3, actualReps: 1, targetReps: 3, isAMRAP: true, status: "failed", completedAt: at(14) }),
  ],
});

beforeEach(() => {
  vi.clearAllMocks();
  useWorkout.mockReturnValue(W);
  loadRebuildInput.mockResolvedValue(input([W]));
  previewLogChange.mockReturnValue(UNAFFECTED);
  commitLogChange.mockResolvedValue({});
  softDelete.mockResolvedValue(undefined);
});
afterEach(cleanup);

describe("WorkoutDetail", () => {
  it("shows the template, location and duration", () => {
    render(<WorkoutDetail workoutId="w1" />);
    expect(screen.getByRole("heading", { level: 2, name: "Workout A1" })).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("52 min")).toBeInTheDocument();
  });

  it("groups sets by exercise in the order performed, warm-ups first and quieter", () => {
    render(<WorkoutDetail workoutId="w1" />);
    const sections = screen.getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual(["Squat", "Bench Press"]);
    const rows = within(sections[0]).getAllByRole("listitem");
    expect(rows.map((r) => r.getAttribute("data-kind"))).toEqual(["warmup", "working", "working", "working"]);
    expect(rows[0]).toHaveTextContent("Warm-up");
    expect(rows[1]).toHaveTextContent("Set 1");
    expect(rows[2]).toHaveTextContent("Set 2");
    expect(rows[2]).toHaveTextContent("RPE 8.5");
    // Warm-ups are not tappable; working sets are.
    expect(within(rows[0]).queryByRole("button")).toBeNull();
    expect(within(rows[1]).getByRole("button")).toBeInTheDocument();
  });

  it("marks failed and AMRAP sets in words", () => {
    render(<WorkoutDetail workoutId="w1" />);
    const failed = screen.getByText("Set 3").closest("li")!;
    expect(failed).toHaveTextContent("Failed");
    expect(failed).toHaveTextContent("1+ reps");
    expect(failed).toHaveTextContent("AMRAP");
    expect(screen.getByText("Set 1", { selector: "section[aria-label='Squat'] *" }).closest("li")).not.toHaveTextContent("Failed");
  });

  it("opens the set editor on tap and saves through the flow", async () => {
    render(<WorkoutDetail workoutId="w1" />);
    fireEvent.click(within(screen.getByText("Set 2").closest("li")!).getByRole("button"));
    expect(screen.getByRole("dialog", { name: "Squat, set 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Increase reps by 1" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save change" }));
    });
    expect(commitLogChange).toHaveBeenCalledWith({ kind: "editSet", workoutId: "w1", setId: "q2", patch: { actualReps: 4 } });
    expect(toast.mock.calls.at(-1)![0]).toMatchObject({ message: "Set saved. Nothing else changes", action: { label: "Undo" } });
  });

  it("Add set opens the editor in add mode for that exercise", () => {
    render(<WorkoutDetail workoutId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: "Add set to Bench Press" }));
    expect(screen.getByRole("dialog", { name: "Add set: Bench Press" })).toBeInTheDocument();
  });

  it("deletes the workout with Undo", async () => {
    const onDeleted = vi.fn();
    render(<WorkoutDetail workoutId="w1" onDeleted={onDeleted} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Delete workout" }));
    });
    expect(softDelete).toHaveBeenCalledWith("workouts", "w1");
    expect(onDeleted).toHaveBeenCalled();
    expect(toast.mock.calls.at(-1)![0]).toMatchObject({ message: "Workout A1 deleted. Nothing else changes" });
  });

  it("renders the header slot", () => {
    render(<WorkoutDetail workoutId="w1" headerExtra={<button>Favourite</button>} />);
    expect(screen.getByRole("button", { name: "Favourite" })).toBeInTheDocument();
  });

  it("handles loading and missing workouts", () => {
    useWorkout.mockReturnValue(undefined);
    const { rerender } = render(<WorkoutDetail workoutId="w1" />);
    expect(screen.getByText("Loading workout...")).toBeInTheDocument();
    useWorkout.mockReturnValue(null);
    rerender(<WorkoutDetail workoutId="w1" />);
    expect(screen.getByText("Workout not found")).toBeInTheDocument();
  });
});
