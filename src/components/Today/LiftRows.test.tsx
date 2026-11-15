import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import { LiftRows, buildLiftRows } from "./LiftRows";

afterEach(cleanup);

const entry = (over: Partial<WorkoutExerciseState>): WorkoutExerciseState => ({
  exerciseId: "squat",
  tier: "T1",
  targetSets: 5,
  targetReps: 3,
  weight: 190,
  isAMRAP: true,
  isWarmUp: false,
  completedSets: 0,
  ...over,
});

describe("LiftRows", () => {
  it("opens the lift page from Today", () => {
    render(<LiftRows rows={buildLiftRows([entry({})], [])} />);
    expect(screen.getByRole("link", { name: "Squat" })).toHaveAttribute(
      "href",
      "/progress/lift/squat?from=today"
    );
  });

  it("has a why control beside the row's link, never inside it, that opens the sheet", () => {
    render(<LiftRows rows={buildLiftRows([entry({})], [])} />);
    const why = screen.getByRole("button", { name: "Why this weight for Squat" });
    expect(why.closest("a")).toBeNull();
    fireEvent.click(why);
    expect(window.location.search).toBe("?why=squat:T1");
    window.history.replaceState(null, "", "/");
  });

  it("opens the home version a substituted row shows, not the barbell lift", () => {
    const home = entry({ substituteExerciseId: "goblet_squat", weight: 60, originalWeight: 190 });
    render(<LiftRows rows={buildLiftRows([home], [])} />);
    expect(screen.getByRole("link", { name: "Goblet squat" })).toHaveAttribute(
      "href",
      "/progress/lift/squat?as=goblet_squat&from=today"
    );
    expect(screen.getByText("60")).toBeInTheDocument();
  });
});
