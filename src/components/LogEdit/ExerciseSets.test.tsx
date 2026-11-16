import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { SetLog } from "@/types";
import { ExerciseSets } from "./ExerciseSets";

let n = 0;
function set(overrides: Partial<SetLog> = {}): SetLog {
  n += 1;
  return {
    id: `s${n}`,
    clientId: `c${n}`,
    exerciseId: "squat",
    tier: "T1",
    setNumber: 1,
    targetReps: 3,
    actualReps: 3,
    weight: 205,
    isAMRAP: false,
    completedAt: new Date(2026, 10, 16, 10, 0, n),
    restAfterSeconds: 0,
    status: "completed",
    isSubstituted: false,
    location: "gym",
    synced: false,
    ...overrides,
  };
}

describe("ExerciseSets", () => {
  const ramp = set({ setNumber: 1, weight: 165, role: "ramp" });
  const work = set({ setNumber: 2, weight: 205, actualReps: 6, isAMRAP: true });
  const d1 = set({ setNumber: 2, weight: 185, actualReps: 6, targetReps: 6, role: "drop", dropOf: work.id });
  const d2 = set({ setNumber: 2, weight: 155, actualReps: 5, targetReps: 5, role: "drop", dropOf: d1.id });
  const group = { exerciseId: "squat", tiers: ["T1" as const], sets: [ramp, work, d1, d2] };

  it("shows the drops indented under the set they continued, on one line", () => {
    render(<ExerciseSets group={group} onEditSet={vi.fn()} />);
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.getAttribute("data-kind"))).toEqual(["working", "working", "drops"]);
    expect(rows[2]).toHaveTextContent(/^↳ 185×6, 155×5$/);
    // Drops are not rows of their own and are never failed for missing a target.
    expect(screen.queryByText("Failed")).toBeNull();
  });

  it("names ramp and back-off sets, and not working sets", () => {
    render(<ExerciseSets group={group} onEditSet={vi.fn()} />);
    const [rampRow, workRow] = screen.getAllByRole("listitem");
    expect(rampRow).toHaveAttribute("data-role", "ramp");
    expect(within(rampRow).getByText("Ramp")).toBeInTheDocument();
    expect(within(workRow).queryByText(/Ramp|Back-off/)).toBeNull();
  });

  it("opens each drop to edit, like any set", () => {
    const onEditSet = vi.fn();
    render(<ExerciseSets group={group} onEditSet={onEditSet} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit drop set: 155 lbs, 5 reps" }));
    expect(onEditSet).toHaveBeenCalledWith(d2);
  });

  it("shows a drop whose set is gone on a line of its own", () => {
    const lone = set({ role: "drop", dropOf: "deleted", weight: 150, actualReps: 4 });
    render(<ExerciseSets group={{ exerciseId: "squat", tiers: ["T1"], sets: [lone] }} onEditSet={vi.fn()} />);
    expect(screen.getByRole("listitem")).toHaveTextContent("↳ 150×4");
  });
});
