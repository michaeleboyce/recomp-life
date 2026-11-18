import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { adaptExerciseForHome } from "@/lib/autoAdapt";
import { EXERCISES } from "@/lib/exercises";
import { HomeAlternatives } from "./HomeAlternatives";

afterEach(cleanup);

const EQUIPMENT = DEFAULT_USER_PROFILE.settings.equipment;
const BENCH = { exerciseId: "bench", tier: "T2" as const, sets: 3, reps: 10, isAMRAP: true };

function show(chosenExerciseId: string | undefined, plannedWeight?: number, onChange = vi.fn()) {
  // Bench 95: DB bench fits, so the conversion lists no alternatives.
  const adaptation = adaptExerciseForHome(EXERCISES.bench, 95, EQUIPMENT, EXERCISES.db_bench);
  render(
    <HomeAlternatives
      adaptations={[{ templateExercise: BENCH, weight: 95, adaptation, chosenExerciseId, plannedWeight }]}
      maxDumbbellWeight={EQUIPMENT.maxDumbbellWeight}
      onChange={onChange}
    />
  );
  return onChange;
}

describe("HomeAlternatives", () => {
  it("shows the conversion's pick as before", () => {
    show("db_bench");
    expect(screen.getByText("DB Bench Press")).toBeInTheDocument();
  });

  it("names another home version chosen for today instead of the conversion's pick", () => {
    show("db_floor_press");
    expect(screen.getByText("DB Floor Press")).toBeInTheDocument();
    expect(screen.getByText(/chosen for today/)).toBeInTheDocument();
    expect(screen.queryByText("DB Bench Press")).toBeNull();
  });

  it("shows the weight planned, not the conversion's", () => {
    show("db_bench", 35);
    expect(screen.getByTestId("home-planned-weight")).toHaveTextContent("@ 35 lbs/hand");
  });

  it("chooses nothing itself: Change opens the swap sheet on that lift", () => {
    const onChange = show("db_bench", 35);
    expect(screen.queryByRole("group", { name: "Alternatives" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Change Barbell Bench Press" }));
    expect(onChange).toHaveBeenCalledWith("bench", "T2");
  });
});
