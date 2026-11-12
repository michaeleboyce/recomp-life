import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { tierStyle } from "@/lib/tierStyle";
import { WorkoutMiniMap } from "./WorkoutMiniMap";
import type { WorkoutExerciseState } from "@/lib/workout/types";

const ex = (tier: "T1" | "T2", completedSets: number): WorkoutExerciseState =>
  ({
    exerciseId: "squat",
    tier,
    targetSets: 3,
    completedSets,
    isWarmUp: false,
  }) as WorkoutExerciseState;

describe("WorkoutMiniMap", () => {
  it("colours done sets with the tier dot and the rest with the muted dot", () => {
    const { container } = render(
      <WorkoutMiniMap
        exercises={[ex("T1", 1), ex("T2", 0)]}
        currentExerciseIndex={1}
        onTap={vi.fn()}
      />
    );
    const bars = container.querySelectorAll("div.h-2");
    expect(bars[0]).toHaveClass(tierStyle("T1").dot);
    expect(bars[1]).toHaveClass(tierStyle("T1").dotMuted);
    expect(bars[3]).toHaveClass(tierStyle("T2").dot); // current set of the current exercise
    expect(bars[4]).toHaveClass(tierStyle("T2").dotMuted);
  });
});
