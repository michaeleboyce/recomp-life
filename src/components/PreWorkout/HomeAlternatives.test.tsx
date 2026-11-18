import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { EXERCISES } from "@/lib/exercises";
import { HomeAlternatives } from "./HomeAlternatives";

afterEach(cleanup);

const EQUIPMENT = DEFAULT_USER_PROFILE.settings.equipment;
const BENCH = { exerciseId: "bench", tier: "T2" as const, sets: 3, reps: 10, isAMRAP: true };

function show(chosenExerciseId: string | undefined) {
  // Bench 95: DB bench fits, so the conversion lists no alternatives.
  const adaptation = adaptExerciseForHome(EXERCISES.bench, 95, EQUIPMENT, EXERCISES.db_bench);
  render(
    <HomeAlternatives
      adaptations={[{ templateExercise: BENCH, weight: 95, adaptation, chosenExerciseId }]}
      maxDumbbellWeight={EQUIPMENT.maxDumbbellWeight}
      onChoose={vi.fn()}
    />
  );
}

describe("HomeAlternatives", () => {
  it("shows the conversion's pick as before", () => {
    show("db_bench");
    expect(screen.getByText("DB Bench Press")).toBeInTheDocument();
  });

  it("names another home version picked in Edit workout instead of the conversion's pick", () => {
    show("db_floor_press");
    expect(screen.getByText("DB Floor Press")).toBeInTheDocument();
    expect(screen.getByText(/picked in Edit workout/)).toBeInTheDocument();
    expect(screen.queryByText("DB Bench Press")).toBeNull();
  });
});
