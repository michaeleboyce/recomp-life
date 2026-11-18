// W11 on the active workout screen: Swap from the exercise's block and from the overview,
// Remove from the overview, and dropped entries hidden. Made-up data only.
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { startWorkout } from "@/lib/data/workouts";
import { useWorkoutStore } from "@/stores/workoutStore";
import { Toaster, dismissToast } from "@/components/ui/toast";
import { logTapGuard } from "@/components/ActiveWorkout/useActiveWorkout";
import ActiveWorkoutPage from "./page";

const nav = vi.hoisted(() => ({ sessionId: "", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams({ sessionId: nav.sessionId }),
}));
vi.mock("@/lib/projection", () => ({ describePrOpportunity: () => null }));

beforeEach(async () => {
  logTapGuard.ms = 0;
  cleanup();
  dismissToast();
  await clearDb();
  await initializeDatabase();
  await seedFixtureStartingWeights();
  useWorkoutStore.getState().reset();
});

async function open() {
  nav.sessionId = await startWorkout({ templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [] });
  render(
    <>
      <ActiveWorkoutPage />
      <Toaster />
    </>
  );
  await screen.findByRole("button", { name: /^LOG/ });
}

const logButton = () => screen.getByRole("button", { name: /^LOG/ });
async function logSets(count: number) {
  for (let i = 0; i < count; i++) {
    const before = (await db.workouts.get(nav.sessionId))!.sets.length;
    fireEvent.click(logButton());
    await waitFor(async () => expect((await db.workouts.get(nav.sessionId))!.sets.length).toBe(before + 1));
    const skip = screen.queryByRole("button", { name: "Skip rest" });
    if (skip) fireEvent.click(skip);
    await waitFor(() => expect(logButton()).toBeEnabled());
  }
}

async function pickTop(sheet: HTMLElement) {
  const recommended = await within(sheet).findByRole("region", { name: "Recommended" });
  const row = within(recommended).getAllByTestId("swap-candidate")[0];
  const pick = within(row).getByRole("button", { name: /^Pick / });
  const name = pick.getAttribute("aria-label")!.replace(/^Pick /, "");
  fireEvent.click(pick);
  fireEvent.click(within(sheet).getByRole("button", { name: `Swap in ${name}` }));
  return name;
}

describe("swapping during the workout", () => {
  it("swaps the exercise on screen from its block before any set: one tap plus confirm", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Swap Barbell Squat" }));
    const sheet = await screen.findByRole("dialog", { name: "Swap Barbell Squat" });
    expect(within(sheet).getByRole("switch")).not.toBeChecked();
    const name = await pickTop(sheet);
    expect(await screen.findByText(`${name} swapped in`)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
    const saved = (await db.workouts.get(nav.sessionId))!;
    expect(saved.planEdits![0]).toMatchObject({ kind: "swap", exerciseId: "squat", tier: "T1" });
  });

  it("after two sets, says they are kept, and the overview lists both", async () => {
    await open();
    await logSets(2);
    fireEvent.click(screen.getByRole("button", { name: "Swap Barbell Squat" }));
    const sheet = await screen.findByRole("dialog", { name: "Swap Barbell Squat" });
    expect(within(sheet).getByTestId("swap-effect")).toHaveTextContent(/2 sets of Barbell Squat already done are kept/);
    const name = await pickTop(sheet);
    expect(await screen.findByRole("heading", { name })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Workout overview" }));
    const overview = await screen.findByRole("dialog", { name: "Workout Overview" });
    expect(within(overview).getByText("Barbell Squat")).toBeInTheDocument();
    expect(within(overview).getByText(name)).toBeInTheDocument();
    // The squat is finished now (its two sets): no swap for it any more.
    expect(within(overview).queryByRole("button", { name: "Swap Barbell Squat" })).toBeNull();
  });

  it("removes an exercise with no set logged from the overview and hides it", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Workout overview" }));
    const overview = await screen.findByRole("dialog", { name: "Workout Overview" });
    // A logged set takes Remove away; the squat has none yet, nor the bench.
    fireEvent.click(within(overview).getByRole("button", { name: "Remove Barbell Bench Press" }));
    expect(await screen.findByText("Barbell Bench Press removed from this workout")).toBeInTheDocument();
    await waitFor(() => expect(within(overview).queryByText("Barbell Bench Press")).toBeNull());
    expect((await db.workouts.get(nav.sessionId))!.planEdits).toEqual([
      { kind: "scheme", exerciseId: "bench", tier: "T2", sets: 0, reps: 10 },
    ]);
  });

  it("swaps from the overview too", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Workout overview" }));
    const overview = await screen.findByRole("dialog", { name: "Workout Overview" });
    fireEvent.click(within(overview).getByRole("button", { name: "Swap Lat Pulldown" }));
    const sheet = await screen.findByRole("dialog", { name: "Swap Lat Pulldown" });
    const name = await pickTop(sheet);
    expect(await screen.findByText(`${name} swapped in`)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name })).toBeInTheDocument();
  });
});
