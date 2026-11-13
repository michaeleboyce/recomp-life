import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeE1RM, makeSet, makeWorkout } from "@/lib/data/testUtils";
import type { BodyweightLog, RunLog } from "@/types";
import LogPage from "./page";

const stamp = { updatedAt: 1, deletedAt: null };

const run = (id: string, date: string, deletedAt: number | null = null): RunLog => ({
  id,
  clientId: id,
  date: new Date(date),
  durationMinutes: 30,
  distanceMiles: 3.1,
  type: "outdoor",
  category: "easy",
  notes: "",
  perceivedEffort: 2,
  ...stamp,
  deletedAt,
  synced: true,
});

const weighIn = (id: string, date: string): BodyweightLog => ({
  id,
  clientId: id,
  date: new Date(date),
  weight: 182.4,
  timeOfDay: "morning",
  ...stamp,
  synced: true,
});

async function seed() {
  await db.workouts.bulkAdd([
    makeWorkout({
      id: "w-old",
      ...stamp,
      startedAt: new Date("2026-11-03T09:00:00"),
      completedAt: new Date("2026-11-03T10:00:00"),
      sets: [makeSet({ id: "s0", weight: 185 })],
    }),
    makeWorkout({
      id: "w-new",
      ...stamp,
      startedAt: new Date("2026-11-10T09:00:00"),
      completedAt: new Date("2026-11-10T10:00:00"),
      sets: [makeSet({ id: "s1", weight: 195 })],
    }),
    makeWorkout({ id: "w-open", ...stamp, templateId: "B1", completedAt: null }),
    makeWorkout({
      id: "w-gone",
      ...stamp,
      templateId: "B2",
      startedAt: new Date("2026-11-05T09:00:00"),
      completedAt: new Date("2026-11-05T10:00:00"),
      deletedAt: 5,
    }),
  ]);
  await db.runs.bulkAdd([run("r1", "2026-11-10T18:00:00"), run("r-gone", "2026-11-04T18:00:00", 5)]);
  await db.bodyweight.add(weighIn("b1", "2026-11-11T07:00:00"));
  await db.estimated1RMs.bulkAdd([
    makeE1RM({ id: "e-old", workoutSessionId: "w-old", date: new Date("2026-11-03T09:30:00"), estimated1RM: 215 }),
    makeE1RM({ id: "e-new", workoutSessionId: "w-new", date: new Date("2026-11-10T09:30:00"), estimated1RM: 225 }),
  ]);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-12T12:00:00"));
  await clearDb();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const days = () => screen.getAllByRole("region").filter((r) => r.getAttribute("aria-label") !== "Calendar");

describe("/log", () => {
  it("shows the empty state when nothing is logged", async () => {
    render(<LogPage />);
    expect(await screen.findByText("Nothing logged yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start a workout" })).toHaveAttribute("href", "/workout/configure");
  });

  it("groups entries by day, newest first, without unfinished or deleted rows", async () => {
    await seed();
    render(<LogPage />);
    await screen.findByText("Weigh-in");
    expect(days().map((d) => d.getAttribute("aria-label"))).toEqual(["Yesterday", "Tue, Nov 10", "Tue, Nov 3"]);
    expect(within(days()[1]).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/log/workout/w-new"]);
    expect(within(days()[1]).getByText(/Outdoor run, easy/)).toBeInTheDocument();
    expect(screen.queryByText("Workout B1")).toBeNull();
    expect(screen.queryByText("Workout B2")).toBeNull();
    expect(screen.getAllByText(/Outdoor run/)).toHaveLength(1);
  });

  it("describes a workout's result and marks a PR against earlier sessions only", async () => {
    await seed();
    render(<LogPage />);
    const latest = (await screen.findByRole("link", { name: /Workout A1.*Squat 195 lbs/ })) as HTMLElement;
    expect(latest).toHaveTextContent("Gym · Squat 195 lbs · all targets hit");
    expect(within(latest).getByText("PR")).toBeInTheDocument();
    const older = screen.getByRole("link", { name: /Squat 185 lbs/ });
    expect(within(older).queryByText("PR")).toBeNull();
  });

  it("filters by kind and shows an empty state when nothing matches", async () => {
    await seed();
    render(<LogPage />);
    await screen.findByText("Weigh-in");
    fireEvent.click(screen.getByRole("radio", { name: "Weigh-ins" }));
    expect(days()).toHaveLength(1);
    expect(screen.queryByText("Workout A1")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Cardio & activity" }));
    expect(screen.getByText(/Outdoor run, easy/)).toBeInTheDocument();
    expect(screen.queryByText("Weigh-in")).toBeNull();
  });

  it("tapping a marked day shows only that day; tapping again shows all", async () => {
    await seed();
    render(<LogPage />);
    await screen.findByText("Weigh-in");
    expect(screen.getByRole("heading", { name: "November 2026" })).toBeInTheDocument();
    const nov10 = screen.getByRole("button", { name: "Tue, Nov 10: 2 entries" });
    expect(screen.getByRole("button", { name: /Mon, Nov 9: nothing logged/ })).toBeDisabled();
    fireEvent.click(nov10);
    expect(nov10).toHaveAttribute("aria-pressed", "true");
    expect(days().map((d) => d.getAttribute("aria-label"))).toEqual(["Tue, Nov 10"]);
    expect(screen.getByText("Showing Tue, Nov 10 only")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Weigh-ins" }));
    expect(screen.getByText("Nothing matches")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Show all days/ }));
    expect(days()).toHaveLength(1);
    expect(screen.getByText("Weigh-in")).toBeInTheDocument();
  });

  it("moves between months", async () => {
    await seed();
    render(<LogPage />);
    await screen.findByText("Weigh-in");
    fireEvent.click(screen.getByRole("button", { name: "Previous month" }));
    expect(screen.getByRole("heading", { name: "October 2026" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByRole("heading", { name: "December 2026" })).toBeInTheDocument();
  });

  it.each([
    [/Outdoor run, easy/, "Edit run"],
    [/^Weigh-in/, "Edit weigh-in"],
  ])("tapping %s opens its edit sheet", async (row, title) => {
    await seed();
    render(<LogPage />);
    fireEvent.click(await screen.findByRole("button", { name: row }));
    expect(await screen.findByRole("heading", { name: title })).toBeInTheDocument();
  });
});
