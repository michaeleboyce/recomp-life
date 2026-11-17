import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import type { PlannedSet } from "@/types";
import { SetPlanEditor, type SetPlanEditorProps } from "./SetPlanEditor";

const PLAN: PlannedSet[] = [
  { weight: 150, reps: 3, role: "ramp" },
  { weight: 190, reps: 3 },
  { weight: 190, reps: 3 },
  { weight: 150, reps: 5, role: "backoff" },
];

/** The editor holding its own sets, as a parent would. */
function Harness(props: Partial<SetPlanEditorProps> & { spy?: (sets: PlannedSet[] | null) => void }) {
  const { spy, ...rest } = props;
  const [sets, setSets] = useState<PlannedSet[]>(rest.sets ?? PLAN);
  return (
    <SetPlanEditor
      name="Barbell Squat"
      planSets={PLAN}
      unit="lbs"
      step={5}
      minWeight={45}
      {...rest}
      sets={sets}
      onChange={(next) => {
        spy?.(next);
        setSets(next ?? PLAN);
      }}
    />
  );
}

const list = () => screen.getByRole("list", { name: "Barbell Squat sets" });
const chip = (n: number) => within(list()).getByRole("button", { name: new RegExp(`^Set ${n}\\b`) });
const chipWeights = () =>
  [...list().querySelectorAll("[data-set-weight]")].map((el) => Number(el.getAttribute("data-set-weight")));

describe("SetPlanEditor", () => {
  it("shows the sets as chips in order, with weight, reps and the ramp and back-off labels", () => {
    render(<Harness />);
    expect(within(list()).getAllByRole("listitem")).toHaveLength(4);
    expect(chipWeights()).toEqual([150, 190, 190, 150]);
    expect(chip(1)).toHaveAccessibleName("Set 1, ramp: 150 lbs × 3. Change it");
    expect(chip(4)).toHaveTextContent("Back-off");
    expect(chip(2)).toHaveTextContent("190");
    expect(chip(2)).toHaveTextContent("×3");
    expect(screen.queryByRole("group", { name: /^Set \d of Barbell Squat/ })).toBeNull();
  });

  it("opens one set's steppers on tap and changes that set alone", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    fireEvent.click(chip(2));
    expect(chip(2)).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("group", { name: "Set 2 of Barbell Squat" });
    fireEvent.click(within(panel).getByRole("button", { name: "Decrease Barbell Squat set 2 weight" }));
    expect(spy).toHaveBeenLastCalledWith([PLAN[0], { weight: 185, reps: 3 }, PLAN[2], PLAN[3]]);
    fireEvent.click(within(panel).getByRole("button", { name: "Increase Barbell Squat set 2 reps" }));
    expect(chipWeights()).toEqual([150, 185, 190, 150]);
    expect(chip(2)).toHaveTextContent("×4");
  });

  it("shows the plan's number beside a changed set, and puts one set back", () => {
    render(<Harness />);
    fireEvent.click(chip(2));
    fireEvent.click(screen.getByRole("button", { name: "Increase Barbell Squat set 2 weight" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Barbell Squat set 2 weight" }));
    expect(screen.getByTestId("plan-beside")).toHaveTextContent("Plan 190 · You 200");
    expect(chip(2)).toHaveAccessibleName("Set 2: 200 lbs × 3, plan 190 lbs × 3. Change it");
    expect(chip(2)).toHaveTextContent("plan 190");
    fireEvent.click(screen.getByRole("button", { name: "Set 2 back to the plan's 190 lbs × 3" }));
    expect(chipWeights()).toEqual([150, 190, 190, 150]);
    expect(screen.queryByTestId("plan-beside")).toBeNull();
  });

  it("goes back to the plan for every set with Back to plan, shown only when something differs", () => {
    const spy = vi.fn();
    render(<Harness spy={spy} />);
    expect(screen.queryByRole("button", { name: "Back to plan: Barbell Squat" })).toBeNull();
    fireEvent.click(chip(1));
    fireEvent.click(screen.getByRole("button", { name: "Increase Barbell Squat set 1 weight" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to plan: Barbell Squat" }));
    expect(spy).toHaveBeenLastCalledWith(null);
  });

  it("keeps the weight within its limits", () => {
    render(<Harness maxWeight={195} />);
    fireEvent.click(chip(1));
    expect(screen.getByRole("button", { name: "Decrease Barbell Squat set 1 weight" })).toBeEnabled();
    fireEvent.click(chip(2));
    fireEvent.click(screen.getByRole("button", { name: "Increase Barbell Squat set 2 weight" }));
    expect(screen.getByRole("button", { name: "Increase Barbell Squat set 2 weight" })).toBeDisabled();
    render(<Harness sets={[{ weight: 45, reps: 3 }, ...PLAN.slice(1)]} />);
    const second = screen.getAllByRole("list", { name: "Barbell Squat sets" })[1];
    fireEvent.click(within(second).getByRole("button", { name: /^Set 1\b/ }));
    expect(screen.getAllByRole("button", { name: "Decrease Barbell Squat set 1 weight" }).at(-1)).toBeDisabled();
  });

  it("shows sets before lockedBefore as done, and does not let them change", () => {
    render(<Harness lockedBefore={2} />);
    expect(within(list()).queryByRole("button", { name: /^Set 1\b/ })).toBeNull();
    expect(within(list()).queryByRole("button", { name: /^Set 2\b/ })).toBeNull();
    expect(within(list()).getByText("Set 1, ramp: 150 lbs × 3, done")).toBeInTheDocument();
    expect(chip(3)).toBeEnabled();
  });

  it("can leave reps alone and add tools for the open set", () => {
    render(
      <Harness
        editReps={false}
        setTools={(index) => <button type="button">{`Tool for set ${index + 1}`}</button>}
      />
    );
    fireEvent.click(chip(3));
    expect(screen.queryByRole("button", { name: "Increase Barbell Squat set 3 reps" })).toBeNull();
    expect(screen.getByRole("button", { name: "Tool for set 3" })).toBeInTheDocument();
  });

  it("closes the open set with a second tap", () => {
    render(<Harness />);
    fireEvent.click(chip(2));
    fireEvent.click(chip(2));
    expect(chip(2)).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("group", { name: "Set 2 of Barbell Squat" })).toBeNull();
  });
});
