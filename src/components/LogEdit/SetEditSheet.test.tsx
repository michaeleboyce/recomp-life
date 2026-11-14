import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SetEditSheet } from "./SetEditSheet";
import { set } from "./testFixtures";

afterEach(cleanup);

function open(overrides: Partial<Parameters<typeof SetEditSheet>[0]> = {}) {
  const onSubmit = vi.fn().mockResolvedValue("committed");
  const onOpenChange = vi.fn();
  render(
    <SetEditSheet
      open
      onOpenChange={onOpenChange}
      workoutId="w1"
      set={set({ actualReps: 3, weight: 205, rpe: 8 })}
      onSubmit={onSubmit}
      {...overrides}
    />
  );
  return { onSubmit, onOpenChange };
}

const field = (label: string) => screen.getByRole("spinbutton", { name: new RegExp(`^${label}`) }) as HTMLInputElement;

async function save(name = "Save change") {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

describe("SetEditSheet", () => {
  it("builds an editSet change with only the fields that changed", async () => {
    const { onSubmit, onOpenChange } = open();
    fireEvent.click(screen.getByRole("button", { name: "Decrease reps by 1" }));
    fireEvent.change(field("Weight"), { target: { value: "200" } });
    await save();
    expect(onSubmit).toHaveBeenCalledWith({
      kind: "editSet",
      workoutId: "w1",
      setId: "s1",
      patch: { actualReps: 2, weight: 200 },
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("steps weight by 5, or by 2.5 when chosen", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Increase weight by 5" }));
    expect(field("Weight").value).toBe("210");
    fireEvent.click(screen.getByRole("radio", { name: "2.5 lb steps" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease weight by 2.5" }));
    expect(field("Weight").value).toBe("207.5");
  });

  it("can clear the RPE: the patch carries rpe undefined", async () => {
    const { onSubmit } = open();
    fireEvent.click(screen.getByRole("button", { name: "Clear RPE" }));
    await save();
    const change = onSubmit.mock.calls[0][0];
    expect(change.kind).toBe("editSet");
    expect("rpe" in change.patch).toBe(true);
    expect(change.patch.rpe).toBeUndefined();
    expect(Object.keys(change.patch)).toEqual(["rpe"]);
  });

  it("builds a deleteSet change", async () => {
    const { onSubmit } = open();
    await save("Delete set");
    expect(onSubmit).toHaveBeenCalledWith({ kind: "deleteSet", workoutId: "w1", setId: "s1" });
  });

  it("closes without a change when nothing was edited", async () => {
    const { onSubmit, onOpenChange } = open();
    await save();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("rejects invalid entry and stays open", async () => {
    const { onSubmit } = open();
    fireEvent.change(field("RPE"), { target: { value: "14" } });
    await save();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter an RPE from 1 to 10, or clear it.");
  });

  it("stays open when the save flow reports an error", async () => {
    const onSubmit = vi.fn().mockResolvedValue("error");
    const { onOpenChange } = open({ onSubmit });
    fireEvent.change(field("Reps"), { target: { value: "5" } });
    await save();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("in add mode builds an addSet change copying the exercise and tier", async () => {
    const { onSubmit } = open({ mode: "add", nextSetNumber: 6 });
    expect(screen.queryByRole("button", { name: "Delete set" })).not.toBeInTheDocument();
    fireEvent.change(field("Reps"), { target: { value: "2" } });
    await save("Add set");
    const change = onSubmit.mock.calls[0][0];
    expect(change).toMatchObject({
      kind: "addSet",
      workoutId: "w1",
      set: { exerciseId: "squat", tier: "T1", setNumber: 6, actualReps: 2, weight: 205, rpe: 8, status: "failed" },
    });
    expect(change.set.id).not.toBe("s1");
  });

  it("gives every stepper button a 44px or larger target", () => {
    open();
    for (const name of ["Decrease reps by 1", "Increase reps by 1"]) {
      expect(screen.getByRole("button", { name }).className).toContain("size-12");
    }
  });
});
