import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, makeE1RM } from "@/lib/data/testUtils";
import { startWorkout, type StartWorkoutInput } from "@/lib/data/workouts";
import { useWorkoutStore } from "@/stores/workoutStore";
import { logTapGuard } from "@/components/ActiveWorkout/useActiveWorkout";
import ActiveWorkoutPage from "./page";

const nav = vi.hoisted(() => ({
  sessionId: "",
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams({ sessionId: nav.sessionId }),
}));

const describePrOpportunity = vi.hoisted(() => vi.fn());
vi.mock("@/lib/projection", () => ({ describePrOpportunity }));

beforeEach(async () => {
  // These tests tap through sets faster than a person can; the guard has its own test.
  logTapGuard.ms = 0;
  cleanup();
  await clearDb();
  await initializeDatabase();
  useWorkoutStore.getState().reset();
  nav.push.mockReset();
  nav.replace.mockReset();
  describePrOpportunity.mockReset();
  describePrOpportunity.mockReturnValue(null);
});

async function open(overrides: Partial<StartWorkoutInput> = {}) {
  nav.sessionId = await startWorkout({
    templateId: "A1",
    location: "gym",
    includeWarmUps: false,
    selectedAccessories: [],
    ...overrides,
  });
  const view = render(<ActiveWorkoutPage />);
  await screen.findByRole("button", { name: /^LOG/ });
  return view;
}

/** Every set logged so far: sets live on their workout row. */
async function loggedSets() {
  return (await db.workouts.toArray()).flatMap((workout) => workout.sets ?? []);
}

const logButton = () => screen.getByRole("button", { name: /^LOG/ });
const skipRest = () => fireEvent.click(screen.getByRole("button", { name: "Skip rest" }));

async function logSets(count: number) {
  for (let i = 0; i < count; i++) {
    const before = (await loggedSets()).length;
    fireEvent.click(logButton());
    await waitFor(async () => expect((await loggedSets()).length).toBe(before + 1));
    const skip = screen.queryByRole("button", { name: "Skip rest" });
    if (skip) fireEvent.click(skip);
    await waitFor(() => expect(logButton()).toBeEnabled());
  }
}

describe("active workout page", () => {
  it("opens on the first set with the weight, plates and target reps ready", async () => {
    await open();
    expect(screen.getByText("A1 · Squat day")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Barbell Squat" })).toBeInTheDocument();
    expect(screen.getByText("Set 1 of 5")).toBeInTheDocument();
    expect(screen.getByTestId("weight")).toHaveTextContent("190");
    expect(screen.getByTestId("loading-line")).toHaveTextContent("per side: 45 · 25 · 2.5");
    expect(screen.getByTestId("rep-count")).toHaveTextContent("3");
    expect(logButton()).toHaveTextContent("LOG 3 REPS");
    // No modal number entry anywhere.
    expect(document.querySelector("input")).toBeNull();
  });

  it("shows the session's own location in the header, whatever the default", async () => {
    await open({ location: "home" });
    const chip = document.querySelector("header [data-slot=location-chip]");
    expect(chip).toHaveAttribute("data-location", "home");
  });

  it("logs a set that hit target with one tap, then rests where the button was", async () => {
    await open();
    fireEvent.click(logButton());

    const timer = await screen.findByRole("timer");
    expect(timer).toHaveTextContent("3:30"); // T1 while cutting: 180 + 30
    expect(screen.queryByRole("button", { name: /^LOG/ })).toBeNull();
    await waitFor(() => expect(timer).toHaveTextContent("Next: set 2 of 5 · 190 lbs"));

    const sets = await loggedSets();
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ exerciseId: "squat", actualReps: 3, status: "completed" });

    skipRest();
    expect(logButton()).toHaveTextContent("LOG 3 REPS");
    expect(screen.getByText("Set 2 of 5")).toBeInTheDocument();
  });

  it("the stepper and chips change the count on the button and what is logged", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "One more rep" }));
    expect(logButton()).toHaveTextContent("LOG 4 REPS");
    fireEvent.click(screen.getByRole("button", { name: "One fewer rep" }));
    fireEvent.click(screen.getByRole("button", { name: "One fewer rep" }));
    expect(logButton()).toHaveTextContent("LOG 2 REPS");
    fireEvent.click(screen.getByRole("button", { name: "6 reps" }));
    expect(logButton()).toHaveTextContent("LOG 6 REPS");

    fireEvent.click(logButton());
    await waitFor(async () => expect((await loggedSets()).length).toBe(1));
    expect((await loggedSets())[0].actualReps).toBe(6);
    // The next set starts back at the target.
    skipRest();
    await waitFor(() => expect(logButton()).toHaveTextContent("LOG 3 REPS"));
  });

  it("hides effort for warm-ups and when RPE is switched off", async () => {
    const view = await open({ includeWarmUps: true });
    expect(screen.getByText(/Warm-up · 10 reps/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Effort" })).toBeNull();
    expect(screen.queryByRole("button", { name: "RPE 8" })).toBeNull();

    await logSets(4);
    expect(screen.getByText("Set 1 of 5")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "RPE 8" })).toBeInTheDocument();

    const profile = (await db.userProfile.toCollection().first())!;
    await act(() =>
      db.userProfile.update(profile.id, { settings: { ...profile.settings, showRPE: false } })
    );
    await waitFor(() => expect(screen.queryByRole("button", { name: "RPE 8" })).toBeNull());
    view.unmount();
  });

  it("never lists completed warm-ups above the controls", async () => {
    await open({ includeWarmUps: true });
    await logSets(4);
    expect(screen.getByRole("heading", { name: "Barbell Squat" })).toBeInTheDocument();
    expect(screen.queryByText(/Warm-up/)).toBeNull();
  });

  it("shows the PR line on the AMRAP set only, and highlights the reps that beat the best", async () => {
    describePrOpportunity.mockImplementation(({ isAMRAP }: { isAMRAP: boolean }) =>
      isAMRAP ? { repsNeeded: 5, e1rmAtRepsNeeded: 222, bestE1RM: 220, chance: "likely" } : null
    );
    await db.estimated1RMs.put(makeE1RM({ exerciseId: "squat", estimated1RM: 220 }));
    await db.liftStates.update("squat", { recentAMRAPReps: [5, 4, 6] });
    await open();
    expect(screen.queryByTestId("pr-opportunity")).toBeNull();

    await logSets(4);
    expect(screen.getByText("Set 5 of 5")).toBeInTheDocument();
    expect(screen.getByText(/AMRAP/)).toBeInTheDocument();
    expect(await screen.findByTestId("pr-opportunity")).toHaveTextContent(
      "5 reps = new best, est. 222 (now 220). Likely: your last three were 5, 4, 6."
    );
    expect(screen.getByRole("button", { name: "5 reps, new best" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "4 reps" })).toBeInTheDocument();
  });

  it("offers the T2 drop with its evidence line and applies it when accepted", async () => {
    await open();
    await logSets(5);
    expect(screen.getByRole("heading", { name: "Barbell Bench Press" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "RPE 9" }));
    fireEvent.click(logButton());
    const accept = await screen.findByRole("button", { name: "Accept Drop" });
    expect(document.querySelector('[data-evidence="t2-autoregulation"]')).not.toBeNull();
    expect(screen.getByText(/That set was RPE/)).toHaveTextContent("dropping to 95 lbs");

    fireEvent.click(accept);
    expect(screen.queryByRole("button", { name: "Accept Drop" })).toBeNull();
    expect(screen.getByTestId("weight")).toHaveTextContent("95");
  });

  it("keeps End workout and Discard in the overview, not under the log button", async () => {
    await open();
    expect(screen.queryByRole("button", { name: /End workout/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Discard/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Workout overview" }));
    expect(await screen.findByRole("button", { name: "End workout" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard Workout" }));

    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/"));
    // Discard is a soft delete, so it can sync and the row no longer shows anywhere.
    const remaining = await db.workouts.toArray();
    expect(remaining.filter((w) => w.deletedAt == null)).toHaveLength(0);
  });

  it("ends early from the overview, saves and goes to the summary", async () => {
    await open();
    await logSets(2);
    fireEvent.click(screen.getByRole("button", { name: "Workout overview" }));
    fireEvent.click(await screen.findByRole("button", { name: "End workout" }));
    fireEvent.click(await screen.findByRole("button", { name: /End & Save Progress/ }));

    fireEvent.click(await screen.findByRole("button", { name: "Finish & View Summary" }));
    await waitFor(() =>
      expect(nav.push).toHaveBeenCalledWith(`/workout/summary?sessionId=${nav.sessionId}`)
    );
    const workout = (await db.workouts.get(nav.sessionId))!;
    expect(workout.endedEarly).toBe(true);
    expect(workout.sets).toHaveLength(2);
  });

  it("offers to discard when the workout is ended with nothing logged", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Workout overview" }));
    fireEvent.click(await screen.findByRole("button", { name: "End workout" }));
    // With no sets the dialog only offers to keep going or discard.
    expect(await screen.findByText("You haven't logged any sets yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /End & Save Progress/ })).toBeNull();
  });

  it("resumes at the fourth set after a reload", async () => {
    const first = await open();
    await logSets(3);
    first.unmount();
    useWorkoutStore.getState().reset();

    render(<ActiveWorkoutPage />);
    expect(await screen.findByText("Set 4 of 5")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "3 of 11 sets done" })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-state="done"]')).toHaveLength(3);
    expect(logButton()).toHaveTextContent("LOG 3 REPS");
  });
});
