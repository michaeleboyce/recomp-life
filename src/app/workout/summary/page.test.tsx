import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { displayLiftName } from "@/components/Today/todayModel";
import { clearDb, makeSet, runSession } from "@/lib/data/testUtils";

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
    expect(await screen.findByRole("heading", { level: 1, name: "Squat day, done" })).toBeInTheDocument();
    expect(screen.getByText(/^A1 complete/)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "A1 · Squat day" })).toBeInTheDocument();
    const did = within(await screen.findByRole("region", { name: "What it did" }));
    expect(await did.findByText(/^passed: next \d+ lbs 5x3$/)).toBeInTheDocument();
    // Each outcome carries the grade of the rule behind it.
    expect(did.getAllByText("Program rule").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Full log" })).toHaveAttribute("href", "/log");
    expect(screen.getByText("How do you feel?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Log an issue/ })).toHaveAttribute("href", "/body-check");
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/");
  });

  it("at home, says what changed for each home exercise: its own next weight, not the barbell's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const home = await runSession(
      { templateId: "B1", location: "home", startedAt: new Date("2026-03-04T09:00:00Z") },
      setNow
    );
    vi.useRealTimers();
    const barbellBefore = (await db.liftStates.get("ohp"))!.t1Weight;
    const entry = home.plan.find((e) => !e.isWarmUp && e.tier === "T1")!;
    expect(entry.substituteExerciseId).toBeTruthy();
    const variant = (await db.variantStates.toArray()).find(
      (v) => v.liftId === entry.exerciseId && v.exerciseId === entry.substituteExerciseId && v.tier === "T1"
    )!;
    // Every set passed: the home exercise went up one dumbbell step; the barbell did not move.
    expect(variant.weight).toBe(entry.weight + 5);
    expect((await db.liftStates.get("ohp"))!.t1Weight).toBe(barbellBefore);

    query = new URLSearchParams({ sessionId: home.workoutId });
    render(<WorkoutSummaryPage />);
    const did = await screen.findByRole("region", { name: "What it did" });
    const name = displayLiftName(entry.substituteExerciseId!);
    const row = (await within(did).findByText(name)).closest("li")!;
    expect(row).toHaveTextContent(
      `passed: next ${variant.weight} lbs${variant.perHand ? " a hand" : ""} ${variant.stage}`
    );
    expect(row).toHaveTextContent("+5");
    expect(did).not.toHaveTextContent(`next ${barbellBefore}`);
  });

  it("says what each accessory does next time and why (A10)", async () => {
    const workout = (await db.workouts.get(workoutId))!;
    const done = new Date(workout.completedAt!).getTime() - 60_000;
    const curls = [15, 15, 15].map((reps, i) =>
      makeSet({
        exerciseId: "bicep_curls",
        tier: "accessory",
        setNumber: i + 1,
        targetReps: 15,
        actualReps: reps,
        weight: 25,
        isAMRAP: true,
        completedAt: new Date(done - (3 - i) * 60_000),
      })
    );
    const raises = [15, 13, 12].map((reps, i) =>
      makeSet({ exerciseId: "lateral_raises", tier: "accessory", setNumber: i + 1, targetReps: 20, actualReps: reps, weight: 15, isAMRAP: true, completedAt: new Date(done) })
    );
    await db.workouts.update(workoutId, { sets: [...workout.sets, ...curls, ...raises] });

    query = new URLSearchParams({ sessionId: workoutId });
    render(<WorkoutSummaryPage />);
    const did = await screen.findByRole("region", { name: "What it did" });
    const rows = await within(did).findAllByText(/next time$/);
    expect(rows.map((r) => r.textContent)).toEqual([
      "All sets at 15: up to 30 lb next time",
      "Short of 20 on a set: 15 lb again next time",
    ]);
  });

  it("sets every forecast made at start against what happened", async () => {
    query = new URLSearchParams({ sessionId: workoutId });
    render(<WorkoutSummaryPage />);
    const table = within(await screen.findByRole("region", { name: "Forecast against what happened" }));
    const rows = await table.findAllByTestId("forecast-row");
    const labels = rows.map((row) => row.firstElementChild?.textContent);
    expect(labels).toContain("Squat, last set");
    expect(labels).toContain("Squat passes");
    expect(labels.at(-1)).toMatch(/^Session length/);
    const squat = rows.find((row) => row.textContent?.startsWith("Squat, last set"))!;
    // Stated as "most likely (range)", then the reps logged.
    expect(squat).toHaveTextContent(/\d+ \(\d+–\d+\)\d+ reps/);
    expect(table.getByRole("link", { name: "track record" })).toHaveAttribute("href", "/progress/forecasts/record");
  });

  it("offers the favourite star for the finished workout", async () => {
    query = new URLSearchParams({ sessionId: workoutId });
    render(<WorkoutSummaryPage />);
    expect(await screen.findByRole("button", { name: "Save as favourite" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  it("without a session id it links to the Log it names, and offers Done", async () => {
    query = new URLSearchParams();
    render(<WorkoutSummaryPage />);
    expect(await screen.findByText("No workout to show")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the Log" })).toHaveAttribute("href", "/log");
    expect(screen.getByRole("link", { name: "Done" })).toHaveAttribute("href", "/");
  });
});
