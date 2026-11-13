import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { initializeDatabase } from "@/db/init";
import { clearDb, runSession } from "@/lib/data/testUtils";

let id = "";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id }),
  useRouter: () => ({ push, replace: vi.fn() }),
}));

import LogWorkoutPage from "./page";

const DAY = 24 * 60 * 60 * 1000;
const FIRST = new Date("2026-03-02T09:00:00Z").getTime();
const setNow = (date: Date) => vi.setSystemTime(date);

let first = "";
let second = "";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-01T08:00:00Z"));
  await clearDb();
  await initializeDatabase();
  // A1 passed everywhere with a 26-rep last T3 set, then A1 again with a 1-rep T1 AMRAP.
  first = (await runSession({ templateId: "A1", startedAt: new Date(FIRST), lastReps: { T3: 26 } }, setNow)).workoutId;
  second = (
    await runSession({ templateId: "A1", startedAt: new Date(FIRST + 2 * DAY), lastReps: { T1: 1 } }, setNow)
  ).workoutId;
  vi.useRealTimers();
});
afterEach(cleanup);

async function whatItDid() {
  return within(await screen.findByRole("region", { name: "What it did" }));
}

describe("/log/workout/[id]", () => {
  it("renders every set with a back link to the Log", async () => {
    id = first;
    render(<LogWorkoutPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Workout A1" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/log");
    expect(screen.getByRole("region", { name: "Squat" })).toBeInTheDocument();
    expect(screen.getAllByText(/^Set \d+$/).length).toBeGreaterThanOrEqual(11);
  });

  it("shows a passed T1 and a T3 increase as of that workout, with the T3 citation", async () => {
    id = first;
    render(<LogWorkoutPage />);
    const section = await whatItDid();
    expect(await section.findByText(/^passed: next \d+ lbs 5x3$/)).toBeInTheDocument();
    expect(section.getByText("last set reached 25: next 95 lbs")).toBeInTheDocument();
    const t3Row = section.getByText("last set reached 25: next 95 lbs").closest("li")!;
    expect(t3Row.querySelector('[data-evidence="t3-progression"]')).not.toBeNull();
    // The later failed session does not leak into this one's result.
    expect(section.queryByText(/missed/)).toBeNull();
  });

  it("shows a missed T1 moving to the next stage at the weight it was given", async () => {
    id = first;
    const { unmount } = render(<LogWorkoutPage />);
    const passed = await (await whatItDid()).findByText(/^passed: next \d+ lbs 5x3$/);
    const weight = passed.textContent!.match(/next (\d+) lbs/)![1];
    unmount();

    id = second;
    render(<LogWorkoutPage />);
    const section = await whatItDid();
    expect(await section.findByText(`missed: moves to 6x2 at ${weight} lbs`)).toBeInTheDocument();
    expect(section.getByText(/^stays at 95 lbs \(last set 15 of 25 reps\)$/)).toBeInTheDocument();
  });

  it("says the workout is not found for an unknown id", async () => {
    id = "nope";
    render(<LogWorkoutPage />);
    expect(await screen.findByText("Workout not found")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "What it did" })).toBeNull();
  });
});
