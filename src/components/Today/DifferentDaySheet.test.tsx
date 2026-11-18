import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, makeWorkout, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { DifferentDayButton } from "./DifferentDaySheet";
import { NextWorkoutHero } from "./NextWorkoutHero";

beforeEach(async () => {
  cleanup();
  await clearDb();
  await initializeDatabase();
  await seedFixtureStartingWeights();
});

const days = () => screen.getAllByTestId("different-day");

describe("Do a different day", () => {
  it("lists the four days from the due one, each opening its full view", async () => {
    render(<DifferentDayButton location="home" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Do a different day" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(/does not move the rotation/)).toBeInTheDocument();
    await waitFor(() => expect(days()).toHaveLength(4));
    expect(days().map((d) => within(d).getByRole("link").getAttribute("href"))).toEqual([
      "/progress/upcoming/workout?n=0&location=home&from=today",
      "/progress/upcoming/workout?n=1&location=home&from=today",
      "/progress/upcoming/workout?n=2&location=home&from=today",
      "/progress/upcoming/workout?n=3&location=home&from=today",
    ]);
    expect(within(days()[0]).getByText("Squat day")).toBeInTheDocument();
    expect(within(days()[0]).getByText("due")).toBeInTheDocument();
    expect(within(days()[1]).queryByText("due")).toBeNull();
    expect(within(days()[2]).getByText("Bench day")).toBeInTheDocument();
    // Each row shows its lifts and its length.
    expect(within(days()[1]).getByText(/·/)).toBeInTheDocument();
    expect(within(days()[1]).getByText(/^\d+ min$/)).toBeInTheDocument();
  });

  it("marks the due day after the rotation has moved", async () => {
    await db.workouts.put(
      makeWorkout({
        id: "done-a1",
        templateId: "A1",
        startedAt: new Date(2026, 10, 10, 9),
        completedAt: new Date(2026, 10, 10, 10),
      })
    );
    render(<DifferentDayButton location="gym" />);
    fireEvent.click(screen.getByRole("button", { name: "Do a different day" }));
    await waitFor(() => expect(days()).toHaveLength(4));
    expect(within(days()[0]).getByText("Press day")).toBeInTheDocument();
    expect(within(days()[0]).getByText("due")).toBeInTheDocument();
  });

  it("sits under START on Today", async () => {
    render(<NextWorkoutHero />);
    expect(await screen.findByRole("button", { name: "Do a different day" })).toBeInTheDocument();
  });
});
