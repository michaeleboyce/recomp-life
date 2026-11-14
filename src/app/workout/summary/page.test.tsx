import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { initializeDatabase } from "@/db/init";
import { clearDb, runSession } from "@/lib/data/testUtils";

// The 3D figure needs WebGL; the card's list is what this page adds.
vi.mock("@/components/Anatomy/Anatomy3D", () => ({ Anatomy3D: () => null }));

let query = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => query,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import WorkoutSummaryPage from "./page";

const setNow = (date: Date) => vi.setSystemTime(date);
let workoutId = "";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-03-01T08:00:00Z"));
  await clearDb();
  await initializeDatabase();
  workoutId = (await runSession({ templateId: "A1", startedAt: new Date("2026-03-02T09:00:00Z") }, setNow)).workoutId;
  vi.useRealTimers();
});
afterEach(cleanup);

describe("/workout/summary", () => {
  it("shows the finished workout with what it did, the body check and Done", async () => {
    query = new URLSearchParams({ sessionId: workoutId });
    render(<WorkoutSummaryPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Workout complete" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Workout A1" })).toBeInTheDocument();
    const did = within(await screen.findByRole("region", { name: "What it did" }));
    expect(await did.findByText(/^passed: next \d+ lbs 5x3$/)).toBeInTheDocument();
    expect(screen.getByText("How do you feel?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Log an issue/ })).toHaveAttribute("href", "/body-check");
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/");
  });

  it("without a session id it still offers Done", async () => {
    query = new URLSearchParams();
    render(<WorkoutSummaryPage />);
    expect(await screen.findByText("No workout to show")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/");
  });
});
