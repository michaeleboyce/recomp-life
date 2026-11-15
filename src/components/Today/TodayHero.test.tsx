import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { WorkoutExerciseState } from "@/lib/workout/types";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SETTLE_IN, SETTLE_STEP_MS, TodayHero, resetSettled } from "./TodayHero";
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

describe("TodayHero first-load motion", () => {
  it("settles the words, then the figure, in on first load only, and only under motion-safe", () => {
    resetSettled();
    const section = hero(t1());
    const parts = Array.from(section.querySelectorAll("[data-settle]")) as HTMLElement[];
    expect(parts).toHaveLength(2);
    for (const part of parts) {
      expect(part).toHaveClass(SETTLE_IN);
      expect(part.className).not.toMatch(/(^|\s)animate-/);
    }
    expect(parts[0].style.animationDelay).toBe("");
    expect(parts[1].style.animationDelay).toBe(`${SETTLE_STEP_MS}ms`);
    cleanup();

    // Back on Today later in the session: still.
    expect(hero(t1()).querySelectorAll("[data-settle]")).toHaveLength(0);
  });

  it("uses a short ease-out animation that ends within 400 ms of the first part", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const ms = Number(css.match(/--animate-settle-in:\s*settle-in\s+(\d+)ms/)![1]);
    // Two hero parts and up to three tiles, a step apart.
    expect(4 * SETTLE_STEP_MS + ms).toBeLessThanOrEqual(400);
  });
});

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
