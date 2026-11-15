import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import { TodayHero } from "./TodayHero";
import { photoPosition } from "./todayModel";

vi.mock("@/components/ui/workout-figure", () => ({ WorkoutFigure: () => null }));

afterEach(cleanup);

const t1 = (substituteExerciseId?: string): WorkoutExerciseState => ({
  exerciseId: substituteExerciseId === "single_leg_db_rdl" ? "deadlift" : "squat",
  substituteExerciseId,
  tier: "T1",
  targetSets: 5,
  targetReps: 3,
  weight: 60,
  isAMRAP: true,
  isWarmUp: false,
  completedSets: 0,
});

function hero(entry: WorkoutExerciseState) {
  render(
    <TodayHero templateId="A1" title="Squat day" working={[entry]} location="home" onLocationChange={() => {}} />
  );
  return screen.getByTestId("today-hero");
}

describe("TodayHero photo", () => {
  it("shows the home substitute's photo, framed for it", () => {
    const section = hero(t1("goblet_squat"));
    expect(section).toHaveAttribute("data-photo", "goblet_squat");
    expect(photoPosition("goblet_squat", "hero")).toBeDefined();
  });

  it("falls back to the plain card when the substitute has no photo", () => {
    const section = hero(t1("single_leg_db_rdl"));
    expect(section).toHaveAttribute("data-photo", "none");
    expect(screen.getByRole("heading", { name: "Squat day" })).toBeInTheDocument();
    expect(section.querySelector("img")).toBeNull();
  });
});
