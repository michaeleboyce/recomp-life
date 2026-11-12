import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeSet, makeWorkout } from "@/lib/data/testUtils";
import HistoryPage from "./page";

describe("HistoryPage", () => {
  beforeEach(clearDb);
  afterEach(cleanup);

  it("shows the empty state when nothing is logged", async () => {
    render(<HistoryPage />);
    expect(await screen.findByText(/No workouts yet/)).toBeInTheDocument();
  });

  it("lists a completed workout and omits an unfinished one", async () => {
    await db.workouts.bulkAdd([
      makeWorkout({
        id: "w-done",
        completedAt: new Date("2026-11-10T10:00:00Z"),
        startedAt: new Date("2026-11-10T09:00:00Z"),
        totalDurationSeconds: 3600,
        sets: [makeSet({ id: "s1" })],
      }),
      makeWorkout({ id: "w-open", completedAt: null, templateId: "B1" }),
    ]);
    render(<HistoryPage />);
    expect(await screen.findByText(/Squat Day/)).toBeInTheDocument();
    expect(screen.queryByText(/B1/)).not.toBeInTheDocument();
  });
});
