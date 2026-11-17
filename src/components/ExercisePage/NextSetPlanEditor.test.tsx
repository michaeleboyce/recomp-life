import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NextSetPlan, PlannedSet } from "@/types";
import { nextSetPlanKey } from "@/lib/workout/nextSetPlans";
import { NextSetPlanEditor } from "./NextSessionParts";

const plan = (weight: number): PlannedSet[] => Array.from({ length: 3 }, () => ({ weight, reps: 10 }));
const yours: PlannedSet[] = [{ weight: 95, reps: 10 }, { weight: 100, reps: 10 }, { weight: 110, reps: 10 }];

function weightsShown(): number[] {
  return [...screen.getByLabelText("DB bench press sets").querySelectorAll("li")].map((li) =>
    Number(li.getAttribute("data-set-weight"))
  );
}

function renderWith(entrySets: PlannedSet[], madeAgainst: PlannedSet[]) {
  const stored: NextSetPlan = {
    exerciseId: "db_bench",
    liftId: "bench",
    tier: "T2",
    sets: yours,
    planSets: madeAgainst,
    createdAt: "2026-11-17T09:00:00.000Z",
  };
  render(
    <NextSetPlanEditor
      exerciseId="db_bench"
      liftId="bench"
      tier="T2"
      name="DB bench press"
      planSets={entrySets}
      unit="lbs a hand"
      step={5}
      minWeight={5}
      store={{ plans: { [nextSetPlanKey("db_bench", "T2")]: stored }, save: vi.fn().mockResolvedValue(undefined) }}
    />
  );
}

describe("NextSetPlanEditor", () => {
  it("shows a stored set plan while the plan is still what it was made against", () => {
    renderWith(plan(100), plan(100));
    expect(weightsShown()).toEqual([95, 100, 110]);
  });

  it("shows a stored set plan when the next plan already has it applied", () => {
    renderWith(yours, plan(100));
    expect(weightsShown()).toEqual([95, 100, 110]);
  });

  it("ignores a stale set plan once the plan has moved", () => {
    renderWith(plan(105), plan(100));
    expect(weightsShown()).toEqual([105, 105, 105]);
  });
});
