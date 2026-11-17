import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { clearDb } from "@/lib/data/testUtils";
import MuscleHeatCard from "./MuscleHeatCard";

const EMPTY = "Log a workout to see which muscles you have trained.";

describe("MuscleHeatCard", () => {
  beforeEach(clearDb);
  afterEach(cleanup);

  it("does not tell the user to log a workout before this week's workouts have loaded", () => {
    render(<MuscleHeatCard />);
    expect(screen.queryByText(EMPTY)).toBeNull();
  });

  it("asks for a workout once it knows there is none this week", async () => {
    render(<MuscleHeatCard />);
    expect(await screen.findByText(EMPTY)).toBeInTheDocument();
  });
});
