import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { buildWorkoutMetaChange, WorkoutMetaSheet } from "./WorkoutMetaSheet";
import { workout } from "./testFixtures";

afterEach(cleanup);

const NOW = new Date("2026-11-12T12:00:00");
const W = workout({ id: "w1", completedAt: new Date("2026-11-10T10:00:00"), location: "gym" });

function open() {
  const onSubmit = vi.fn().mockResolvedValue("committed");
  const onOpenChange = vi.fn();
  render(<WorkoutMetaSheet open onOpenChange={onOpenChange} workout={W} onSubmit={onSubmit} now={NOW} />);
  return { onSubmit, onOpenChange };
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Save change" }));
  });
}

describe("WorkoutMetaSheet", () => {
  it("builds an editWorkout change for a new date and location", async () => {
    const { onSubmit } = open();
    fireEvent.change(screen.getByLabelText("Finished at"), { target: { value: "2026-11-09T18:30" } });
    fireEvent.click(screen.getByRole("radio", { name: "Home" }));
    await save();
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "editWorkout",
      workoutId: "w1",
      patch: { completedAt: new Date("2026-11-09T18:30"), location: "home" },
    });
  });

  it("rejects a future date", async () => {
    const { onSubmit } = open();
    fireEvent.change(screen.getByLabelText("Finished at"), { target: { value: "2026-11-13T09:00" } });
    await save();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("The date cannot be in the future.");
    expect(screen.getByLabelText("Finished at")).toHaveAttribute("max", "2026-11-12T12:00");
  });

  it("only includes what changed, and nothing when nothing did", () => {
    expect(buildWorkoutMetaChange(W, "2026-11-10T10:00", "home", NOW)).toEqual({
      kind: "editWorkout",
      workoutId: "w1",
      patch: { location: "home" },
    });
    expect(buildWorkoutMetaChange(W, "2026-11-10T10:00", "gym", NOW)).toBeNull();
  });
});
