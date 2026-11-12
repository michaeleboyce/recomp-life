import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { tierStyle } from "@/lib/tierStyle";
import { WorkoutMiniMap } from "./WorkoutMiniMap";
import type { WorkoutExerciseState } from "@/lib/workout/types";

const ex = (
  tier: "T1" | "T2" | "warmup",
  completedSets: number,
  targetSets = 3
): WorkoutExerciseState =>
  ({
    exerciseId: "squat",
    tier,
    targetSets,
    completedSets,
    isWarmUp: tier === "warmup",
  }) as WorkoutExerciseState;

describe("WorkoutMiniMap", () => {
  it("draws one segment per working set: done in the tier colour, current bright, the rest muted", () => {
    const { container } = render(
      <WorkoutMiniMap exercises={[ex("T1", 1), ex("T2", 0)]} currentExerciseIndex={1} />
    );
    const bars = container.querySelectorAll("span.h-1");
    expect(bars).toHaveLength(6);
    expect(bars[0]).toHaveClass(tierStyle("T1").dot);
    expect(bars[1]).toHaveClass(tierStyle("T1").dotMuted);
    expect(bars[3]).toHaveClass("bg-foreground"); // the set on screen
    expect(bars[3]).toHaveAttribute("data-state", "current");
    expect(bars[4]).toHaveClass(tierStyle("T2").dotMuted);
  });

  it("leaves warm-ups out and says how far along the workout is", () => {
    const { container } = render(
      <WorkoutMiniMap
        exercises={[ex("warmup", 1, 1), ex("warmup", 0, 1), ex("T1", 2, 5)]}
        currentExerciseIndex={1}
      />
    );
    expect(container.querySelectorAll("span.h-1")).toHaveLength(5);
    expect(container.querySelector('[data-state="current"]')).toBeNull();
    expect(screen.getByRole("img")).toHaveAccessibleName("2 of 5 sets done");
  });
});
