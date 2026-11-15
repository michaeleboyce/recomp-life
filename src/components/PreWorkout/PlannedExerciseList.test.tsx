import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import { PlannedExerciseList } from "./PlannedExerciseList";

afterEach(cleanup);

const entry = (overrides: Partial<WorkoutExerciseState>): WorkoutExerciseState => ({
  exerciseId: "squat",
  tier: "T1",
  targetSets: 5,
  targetReps: 3,
  weight: 190,
  isAMRAP: true,
  isWarmUp: false,
  completedSets: 0,
  ...overrides,
});

describe("PlannedExerciseList", () => {
  it("lets the first badge of each tier open its glossary entry", () => {
    render(
      <PlannedExerciseList
        plan={[
          entry({}),
          entry({ exerciseId: "bench", tier: "T2", targetSets: 3, targetReps: 10, isAMRAP: false }),
          entry({ exerciseId: "lat_pulldown", tier: "T3", targetSets: 3, targetReps: 15 }),
          entry({ exerciseId: "face_pulls", tier: "T3", targetSets: 3, targetReps: 15 }),
        ]}
      />
    );
    const rows = screen.getAllByTestId("planned-exercise");
    expect(rows[0].querySelector('[data-term="t1"]')).not.toBeNull();
    expect(rows[1].querySelector('[data-term="t2"]')).not.toBeNull();
    expect(rows[2].querySelector('[data-term="t3"]')).not.toBeNull();
    // A second T3 keeps a plain badge.
    expect(rows[3].querySelector("[data-term]")).toBeNull();
  });

  it("wraps a long name instead of cutting it off", () => {
    render(
      <PlannedExerciseList
        plan={[entry({ substituteExerciseId: "single_leg_db_rdl", exerciseId: "deadlift", originalWeight: 225 })]}
      />
    );
    for (const text of [/Single-Leg DB RDL/, /in place of/]) {
      const line = screen.getByText(text);
      expect(line.className).not.toMatch(/\btruncate\b/);
    }
  });
});
