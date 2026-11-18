import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import { EditEntryRow } from "./EditEntryRow";

const entry = (overrides: Partial<WorkoutExerciseState> = {}): WorkoutExerciseState => ({
  exerciseId: "ohp",
  tier: "T1",
  targetSets: 5,
  targetReps: 3,
  weight: 45,
  isAMRAP: true,
  isWarmUp: false,
  completedSets: 0,
  ...overrides,
});

function renderRow(props: Partial<Parameters<typeof EditEntryRow>[0]> = {}) {
  const onWeight = vi.fn();
  render(
    <ul>
      <EditEntryRow
        entry={entry()}
        impact={undefined}
        onSwap={vi.fn()}
        onRemove={vi.fn()}
        onScheme={vi.fn()}
        onWeight={onWeight}
        {...props}
      />
    </ul>
  );
  return { onWeight };
}

describe("EditEntryRow, one weight for every set", () => {
  it("moves the weight by the equipment's step, not always 5 lb", () => {
    const { onWeight } = renderRow({ weightStep: 2.5, minWeight: 45 });
    fireEvent.click(screen.getByRole("button", { name: /^Increase .* weight$/ }));
    expect(onWeight).toHaveBeenCalledWith(47.5);
  });

  it("does not go below the empty bar", () => {
    const { onWeight } = renderRow({ weightStep: 5, minWeight: 45 });
    const decrease = screen.getByRole<HTMLButtonElement>("button", { name: /^Decrease .* weight$/ });
    expect(decrease.disabled).toBe(true);
    fireEvent.click(decrease);
    expect(onWeight).not.toHaveBeenCalled();
  });

  it("steps by 5 lb down to zero when no equipment limits are given", () => {
    const { onWeight } = renderRow({ entry: entry({ weight: 5 }) });
    fireEvent.click(screen.getByRole("button", { name: /^Decrease .* weight$/ }));
    expect(onWeight).toHaveBeenCalledWith(0);
  });
});
