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

  it("shows a lift with a weight per set as its working sets plus its ramp and back-off sets", () => {
    render(
      <PlannedExerciseList
        plan={[
          entry({
            targetSets: 8,
            weight: 250,
            perSet: [
              { weight: 200, reps: 3, role: "ramp" },
              { weight: 225, reps: 3, role: "ramp" },
              ...Array.from({ length: 5 }, () => ({ weight: 250, reps: 3 })),
              { weight: 200, reps: 8, role: "backoff" },
            ],
          }),
        ]}
      />
    );
    const row = screen.getByTestId("planned-exercise");
    expect(screen.getByTestId("planned-scheme")).toHaveTextContent(/^5×3\+$/);
    expect(row).toHaveTextContent("250 lbs");
    expect(row).not.toHaveTextContent("8×3");
    expect(screen.getAllByTestId("planned-sets").map((line) => line.textContent)).toEqual([
      "ramp: 200×3 · 225×3",
      "back-off: 200×8",
    ]);
  });

  it("lists every working set when they differ, the AMRAP on the last one", () => {
    render(
      <PlannedExerciseList
        plan={[
          entry({
            targetSets: 3,
            weight: 250,
            perSet: [
              { weight: 240, reps: 3 },
              { weight: 250, reps: 3, role: "work" },
              { weight: 250, reps: 2 },
            ],
          }),
        ]}
      />
    );
    expect(screen.getByTestId("planned-scheme")).toHaveTextContent(/^3 working sets$/);
    expect(screen.getAllByTestId("planned-sets").map((line) => line.textContent)).toEqual([
      "working: 240×3 · 250×3 · 250×2+",
    ]);
  });

  it("keeps the sets × reps of a lift without per-set weights", () => {
    render(<PlannedExerciseList plan={[entry({})]} />);
    expect(screen.getByTestId("planned-scheme")).toHaveTextContent(/^5×3\+$/);
    expect(screen.queryByTestId("planned-sets")).toBeNull();
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
