import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeWorkout } from "@/lib/data/testUtils";
import AbandonedWorkoutBanner from "./AbandonedWorkoutBanner";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const HOUR = 60 * 60 * 1000;
beforeEach(async () => {
  await clearDb();
  push.mockClear();
});

describe("AbandonedWorkoutBanner", () => {
  it("shows for an unfinished workout started an hour ago and resumes it", async () => {
    await db.workouts.add(makeWorkout({ id: "w1", startedAt: new Date(Date.now() - HOUR) }));
    render(<AbandonedWorkoutBanner />);
    expect(await screen.findByText(/unfinished workout/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(push).toHaveBeenCalledWith("/workout/active?sessionId=w1");
  });

  it("does not show for one started two days ago, and cleans it up", async () => {
    await db.workouts.add(makeWorkout({ id: "old", startedAt: new Date(Date.now() - 48 * HOUR) }));
    render(<AbandonedWorkoutBanner />);
    await waitFor(async () => expect(await db.workouts.get("old")).toBeUndefined());
    expect(screen.queryByText(/unfinished workout/i)).not.toBeInTheDocument();
  });

  it("Discard removes the workout", async () => {
    await db.workouts.add(makeWorkout({ id: "w2", startedAt: new Date(Date.now() - HOUR) }));
    render(<AbandonedWorkoutBanner />);
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(async () => expect(await db.workouts.get("w2")).toBeUndefined());
  });
});
