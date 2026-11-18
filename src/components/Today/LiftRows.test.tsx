import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile, makeSet, makeWorkout } from "@/lib/data/testUtils";
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

  it("says a home weight held at the heaviest dumbbell is capped, and what a pass does next", async () => {
    await db.userProfile.put(makeProfile());
    const capped = entry({
      substituteExerciseId: "bulgarian_split_squat",
      weight: 80,
      originalWeight: 245,
      perHand: true,
    });
    const before = makeWorkout({
      completedAt: new Date("2026-11-10T10:00:00"),
      sets: [
        makeSet({
          exerciseId: "squat",
          tier: "T1",
          weight: 80,
          originalWeight: 240,
          isSubstituted: true,
          substituteExerciseId: "bulgarian_split_squat",
        }),
      ],
    });
    render(<LiftRows rows={buildLiftRows([capped], [before])} />);
    expect(await screen.findByText("Held at 80, your heaviest dumbbell")).toBeInTheDocument();
    expect(screen.getByTestId("lift-cap-next")).toHaveTextContent("A pass adds 1 rep a set");
    expect(screen.getByTestId("lift-cap-next").parentElement!.querySelector('[data-evidence="cap-progression"]')).not.toBeNull();
    await clearDb();
  });

  it("marks a per-hand weight for the program's own dumbbell lift, not only for a home version", () => {
    render(
      <LiftRows
        rows={buildLiftRows(
          [entry({ exerciseId: "db_row", tier: "T3", targetSets: 3, targetReps: 15, weight: 35 }), entry({})],
          []
        )}
      />
    );
    // Dumbbell row is done one dumbbell a hand; the barbell squat is not.
    expect(screen.getAllByText("/hand")).toHaveLength(1);
  });

  it("opens the home version a substituted row shows, not the barbell lift", () => {
    const home = entry({ substituteExerciseId: "goblet_squat", weight: 60, originalWeight: 190 });
    render(<LiftRows rows={buildLiftRows([home], [])} />);
    expect(screen.getByRole("link", { name: "Goblet squat" })).toHaveAttribute(
      "href",
      "/exercises/goblet_squat?from=today"
    );
    expect(screen.getByText("60")).toBeInTheDocument();
  });
});
