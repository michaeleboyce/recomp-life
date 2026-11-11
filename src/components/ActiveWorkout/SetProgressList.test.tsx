import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { SetLog, Tier } from "@/types";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import { SetProgressList } from "./SetProgressList";

let counter = 0;
function set(exerciseId: string, tier: Tier, overrides: Partial<SetLog> = {}): SetLog {
  counter += 1;
  return {
    id: `set-${counter}`,
    clientId: `client-${counter}`,
    exerciseId,
    tier,
    setNumber: 1,
    targetReps: 3,
    actualReps: 3,
    weight: 190,
    isAMRAP: false,
    completedAt: new Date("2026-11-11T10:00:00Z"),
    restAfterSeconds: 0,
    status: "completed",
    isSubstituted: false,
    location: "gym",
    synced: false,
    ...overrides,
  };
}

const squatT1: WorkoutExerciseState = {
  exerciseId: "squat",
  tier: "T1",
  targetSets: 5,
  targetReps: 3,
  weight: 190,
  isAMRAP: true,
  isWarmUp: false,
  completedSets: 0,
};

const squatWarmUps = [
  set("squat", "warmup", { weight: 45, targetReps: 10, actualReps: 9 }),
  set("squat", "warmup", { weight: 95, targetReps: 5, actualReps: 5 }),
  set("squat", "warmup", { weight: 135, targetReps: 3, actualReps: 3 }),
  set("squat", "warmup", { weight: 160, targetReps: 1, actualReps: 1 }),
];

const row = (n: number) => screen.getByText(`Set ${n}`).parentElement!;

describe("SetProgressList", () => {
  it("shows the T1 set in row 1 when warm-ups were logged first (D1 / R6)", () => {
    render(
      <SetProgressList
        exercise={{ ...squatT1, completedSets: 1 }}
        completedSets={[...squatWarmUps, set("squat", "T1", { weight: 190, actualReps: 3, rpe: 8 })]}
        location="gym"
      />
    );

    expect(row(1)).toHaveTextContent(/190\s*×\s*3/);
    expect(row(1)).toHaveTextContent("RPE 8");
    expect(row(1)).not.toHaveTextContent(/45\s*×\s*9/);
    // Row 2 is the current set and still shows the target.
    expect(row(2)).toHaveTextContent(/190\s*×\s*3\s*target/);
  });

  it("renders one row per target set and marks the AMRAP target with a plus", () => {
    render(<SetProgressList exercise={squatT1} completedSets={[]} location="gym" />);

    expect(screen.getAllByText(/^Set \d+$/)).toHaveLength(5);
    expect(row(4)).toHaveTextContent(/190\s*×\s*3\s*target/);
    expect(row(5)).toHaveTextContent(/190\s*×\s*3\+\s*target/);
  });

  it("labels a logged AMRAP set using a theme token, not a raw palette class", () => {
    render(
      <SetProgressList
        exercise={{ ...squatT1, completedSets: 5 }}
        completedSets={[
          ...[1, 2, 3, 4].map((n) => set("squat", "T1", { setNumber: n })),
          set("squat", "T1", { setNumber: 5, actualReps: 6, isAMRAP: true }),
        ]}
        location="gym"
      />
    );

    expect(row(5)).toHaveTextContent(/190\s*×\s*6/);
    const badge = screen.getByText("AMRAP");
    expect(badge).toHaveClass("text-warning");
    expect(row(1).querySelector(".text-success")).not.toBeNull();
  });

  it("does not show another tier's sets of the same exercise", () => {
    render(
      <SetProgressList
        exercise={{ ...squatT1, tier: "T2", targetSets: 3, targetReps: 10, weight: 135, isAMRAP: false, completedSets: 1 }}
        completedSets={[
          set("squat", "T1", { weight: 190, actualReps: 3 }),
          set("squat", "T2", { weight: 135, targetReps: 10, actualReps: 10 }),
        ]}
        location="gym"
      />
    );

    expect(row(1)).toHaveTextContent(/135\s*×\s*10/);
  });

  it("shows a home substitute's sets per hand, matched by the template exercise id", () => {
    render(
      <SetProgressList
        exercise={{
          ...squatT1,
          substituteExerciseId: "bulgarian_split_squat",
          weight: 75,
          originalWeight: 190,
          completedSets: 1,
        }}
        completedSets={[
          set("squat", "T1", {
            weight: 75,
            actualReps: 4,
            isSubstituted: true,
            substituteExerciseId: "bulgarian_split_squat",
            location: "home",
          }),
        ]}
        location="home"
      />
    );

    expect(row(1)).toHaveTextContent(/75\/h\s*×\s*4/);
  });
});
