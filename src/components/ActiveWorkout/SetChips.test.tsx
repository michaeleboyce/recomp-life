import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { SetChip } from "./setPlan";
import { SetChips } from "./SetChips";

function chip(index: number, overrides: Partial<SetChip> = {}): SetChip {
  return {
    index,
    weight: 190,
    plannedWeight: 190,
    changed: false,
    reps: 3,
    role: "work",
    state: "todo",
    isAMRAP: false,
    drops: 0,
    ...overrides,
  };
}

const CHIPS: SetChip[] = [
  chip(0, { state: "done" }),
  chip(1, { state: "current" }),
  chip(2),
  chip(3, { weight: 200, changed: true }),
  chip(4, { isAMRAP: true }),
];

function renderChips(chips = CHIPS) {
  const onChange = vi.fn();
  render(<SetChips name="Barbell Squat" chips={chips} unit="lbs" step={5} minWeight={45} onChange={onChange} />);
  const region = screen.getByRole("region", { name: "Sets of Barbell Squat" });
  return { onChange, region };
}

describe("SetChips", () => {
  it("makes every set still to come a button, and leaves done sets as they were logged", () => {
    const { region } = renderChips();
    expect(within(region).getAllByRole("button")).toHaveLength(4);
    expect(within(region).getByText("Set 1: 190 lbs × 3, done")).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Set 2: 190 lbs × 3, next. Change its weight" })).toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "Set 3: 190 lbs × 3. Change its weight" })).toBeInTheDocument();
  });

  it("opens a later set's steppers and changes that set alone", () => {
    const { region, onChange } = renderChips();
    fireEvent.click(within(region).getByRole("button", { name: /^Set 3:/ }));
    const panel = screen.getByRole("group", { name: "Set 3 weight" });
    fireEvent.click(within(panel).getByRole("button", { name: "5 lbs heavier" }));
    expect(onChange).toHaveBeenLastCalledWith(2, 195);
    fireEvent.click(within(panel).getByRole("button", { name: "5 lbs lighter" }));
    expect(onChange).toHaveBeenLastCalledWith(2, 185);
    expect(within(panel).queryByRole("button", { name: /^Back to the planned/ })).toBeNull();
  });

  it("shows the plan's weight beside a changed set and puts that set back", () => {
    const { region, onChange } = renderChips();
    const changed = within(region).getByRole("button", { name: "Set 4: 200 lbs × 3, planned 190 lbs. Change its weight" });
    expect(changed).toHaveTextContent("plan 190");
    fireEvent.click(changed);
    expect(changed).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("plan-beside")).toHaveTextContent("Plan 190 · You 200");
    fireEvent.click(screen.getByRole("button", { name: "Back to the planned 190 lbs" }));
    expect(onChange).toHaveBeenLastCalledWith(3, null);
  });

  it("does not go below the lightest weight", () => {
    const { region } = renderChips([chip(0, { state: "current", weight: 45, plannedWeight: 45 })]);
    fireEvent.click(within(region).getByRole("button", { name: /^Set 1:/ }));
    expect(screen.getByRole("button", { name: "5 lbs lighter" })).toBeDisabled();
  });

  it("closes a set once it is done", () => {
    const onChange = vi.fn();
    const props = { name: "Barbell Squat", unit: "lbs", step: 5, minWeight: 45, onChange };
    const { rerender } = render(<SetChips {...props} chips={CHIPS} />);
    fireEvent.click(screen.getByRole("button", { name: /^Set 2:/ }));
    expect(screen.getByRole("group", { name: "Set 2 weight" })).toBeInTheDocument();
    rerender(<SetChips {...props} chips={CHIPS.map((c) => (c.index === 1 ? { ...c, state: "done" } : c))} />);
    expect(screen.queryByRole("group", { name: "Set 2 weight" })).toBeNull();
  });
});
