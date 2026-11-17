import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { NextSetPlan, PlannedSet } from "@/types";
import type { NextSetPlanStore } from "./nextSetPlanAdapter";

const toasts = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/components/ui/toast", () => toasts);

import { NextSetPlanEditor } from "./NextSessionParts";

afterEach(() => {
  cleanup();
  toasts.toast.mockReset();
});

const planSets: PlannedSet[] = [
  { weight: 100, reps: 5 },
  { weight: 100, reps: 5 },
];

function renderEditor(store: NextSetPlanStore) {
  return render(
    <NextSetPlanEditor
      exerciseId="squat"
      liftId="squat"
      tier="T1"
      name="Squat"
      planSets={planSets}
      unit="lbs"
      step={5}
      minWeight={45}
      store={store}
    />
  );
}

describe("NextSetPlanEditor", () => {
  it("keeps every tap while the store has not caught up yet", async () => {
    // The save is written, but the live query has not given the new plan back yet.
    const save = vi.fn<NextSetPlanStore["save"]>(() => new Promise<void>(() => undefined));
    renderEditor({ plans: {}, save });

    fireEvent.click(screen.getByRole("button", { name: /^Set 1: 100 lbs × 5/ }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Squat set 1 weight" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Squat set 1 weight" }));

    expect(save).toHaveBeenCalledTimes(2);
    const last = save.mock.calls[1][0] as NextSetPlan;
    expect(last.sets.map((s) => s.weight)).toEqual([110, 100]);
    expect(screen.getByRole("button", { name: /^Set 1: 110 lbs × 5/ })).toBeInTheDocument();
  });

  it("goes back to the stored sets and says so when a save fails", async () => {
    const save = vi.fn<NextSetPlanStore["save"]>(() => Promise.reject(new Error("disk full")));
    renderEditor({ plans: {}, save });

    fireEvent.click(screen.getByRole("button", { name: /^Set 1: 100 lbs × 5/ }));
    fireEvent.click(screen.getByRole("button", { name: "Increase Squat set 1 weight" }));

    await waitFor(() =>
      expect(toasts.toast).toHaveBeenCalledWith({ message: "Could not save the set weights: disk full" })
    );
    expect(await screen.findByRole("button", { name: /^Set 1: 100 lbs × 5/ })).toBeInTheDocument();
  });
});
