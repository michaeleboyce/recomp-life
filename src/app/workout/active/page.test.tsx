import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, makeE1RM, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { startWorkout, type StartWorkoutInput } from "@/lib/data/workouts";
import { useWorkoutStore } from "@/stores/workoutStore";
import { Toaster, dismissToast } from "@/components/ui/toast";
import { logTapGuard } from "@/components/ActiveWorkout/useActiveWorkout";
import type { PlanEdit } from "@/types";
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
  dismissToast();
  await clearDb();
  await initializeDatabase();
  await seedFixtureStartingWeights();
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

    // The stored trace is for the planned weight; the sheet says what changed since.
    fireEvent.click(screen.getByRole("button", { name: /^Why \d+ lbs\?$/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByTestId("why-dropped")).toHaveTextContent(
      "Lowered during the workout from 100 to 95 lbs: you accepted the drop after a hard first set. The steps above are how 100 lbs was planned."
    );
    expect(sheet.querySelector('[data-evidence="t2-autoregulation"]')).not.toBeNull();
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
      expect(nav.replace).toHaveBeenCalledWith(`/workout/summary?sessionId=${nav.sessionId}`)
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

  it("Back opens the stop dialog: keep going is the default, leaving keeps everything", async () => {
    await open();
    await logSets(2);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    const dialog = await screen.findByRole("dialog");
    const buttons = within(dialog).getAllByRole("button").filter((b) => !b.dataset.term);
    expect(buttons.map((b) => b.textContent)).toEqual([
      "Keep going",
      "Leave, resume later",
      "End & Save Progress",
      "Discard workout and all its sets",
    ]);
    expect(buttons[0]).toHaveFocus();
    // Tier and stage words explain themselves.
    expect(within(dialog).getAllByRole("button", { name: "What does T2 mean?" }).length).toBeGreaterThan(0);
    expect(within(dialog).getByRole("button", { name: "What does stages mean?" })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Leave, resume later" }));
    expect(nav.push).toHaveBeenCalledWith("/");
    const workout = (await db.workouts.get(nav.sessionId))!;
    expect(workout.completedAt).toBeNull();
    expect(workout.deletedAt).toBeFalsy();
    expect(workout.sets).toHaveLength(2);
  });

  it("discarding from the stop dialog asks once more", async () => {
    await open();
    await logSets(1);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    fireEvent.click(await screen.findByRole("button", { name: "Discard workout and all its sets" }));
    expect(await screen.findByText(/Discarding deletes all of them/)).toBeInTheDocument();
    expect((await db.workouts.get(nav.sessionId))!.deletedAt).toBeFalsy();
    fireEvent.click(screen.getByRole("button", { name: "Discard Workout" }));
    await waitFor(async () => expect((await db.workouts.get(nav.sessionId))!.deletedAt).toBeTruthy());
  });

  it("Back from the summary goes on to Today instead of reopening the summary", async () => {
    const view = await open();
    await logSets(2);
    fireEvent.click(screen.getByRole("button", { name: "Workout overview" }));
    fireEvent.click(await screen.findByRole("button", { name: "End workout" }));
    fireEvent.click(await screen.findByRole("button", { name: /End & Save Progress/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Finish & View Summary" }));
    await waitFor(() =>
      expect(nav.replace).toHaveBeenCalledWith(`/workout/summary?sessionId=${nav.sessionId}`)
    );
    view.unmount();
    nav.replace.mockReset();
    // Back from the summary lands on this screen again.
    render(<ActiveWorkoutPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"));
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("a workout finished elsewhere, or before a reload, goes on to Today, not its summary again", async () => {
    nav.sessionId = await startWorkout({ templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [] });
    await db.workouts.update(nav.sessionId, { completedAt: new Date() });
    render(<ActiveWorkoutPage />);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/"));
    expect(nav.replace).not.toHaveBeenCalledWith(expect.stringContaining("/workout/summary"));
    expect(nav.push).not.toHaveBeenCalled();
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

describe("a weight per set and drop sets", () => {
  const RAMP_EDIT: PlanEdit = {
    kind: "setWeights",
    exerciseId: "squat",
    tier: "T1",
    sets: [
      { weight: 150, reps: 3, role: "ramp" },
      { weight: 170, reps: 3, role: "ramp" },
      ...Array.from({ length: 5 }, () => ({ weight: 190, reps: 3 })),
    ],
  };
  const chips = () => screen.getByRole("region", { name: "Sets of Barbell Squat" });
  const logDrop = () => screen.getByRole("button", { name: /^Log drop/ });
  const doneRest = () => screen.getByRole("button", { name: "Done · rest" });
  /**
   * Clicks a button of the drop screen once it is enabled: both stay disabled while
   * the previous set is still being saved, which takes longer on a busy machine.
   */
  async function clickWhenEnabled(button: () => HTMLElement) {
    await waitFor(() => expect(button()).toBeEnabled());
    fireEvent.click(button());
  }

  it("shows each set's own weight and plates, says which sets ramp, and logs each at its weight", async () => {
    await open({ planEdits: [RAMP_EDIT] });
    expect(screen.getByText("Set 1 of 7 · Ramp")).toBeInTheDocument();
    expect(screen.getByTestId("weight")).toHaveTextContent("150");
    expect(screen.getByTestId("loading-line")).toHaveTextContent("per side: 45 · 5 · 2.5");
    expect(within(chips()).getAllByRole("listitem")).toHaveLength(7);
    expect(chips().querySelectorAll("[data-role='ramp']")).toHaveLength(2);

    await logSets(2);
    expect(screen.getByText("Set 3 of 7")).toBeInTheDocument();
    expect(screen.getByTestId("weight")).toHaveTextContent("190");
    expect((await loggedSets()).map((s) => [s.weight, s.role])).toEqual([
      [150, "ramp"],
      [170, "ramp"],
    ]);
  });

  it("changes the next set's weight on the spot from its chip, with the plates to match", async () => {
    await open();
    fireEvent.click(within(chips()).getByRole("button", { name: /^Set 1: 190 lbs × 3, next/ }));
    fireEvent.click(screen.getByRole("button", { name: "5 lbs lighter" }));
    expect(screen.getByTestId("weight")).toHaveTextContent("185");
    expect(screen.getByTestId("loading-line")).toHaveTextContent("per side: 45 · 25");
    fireEvent.click(screen.getByRole("button", { name: "Back to the planned 190 lbs" }));
    expect(screen.getByTestId("weight")).toHaveTextContent("190");
    fireEvent.click(screen.getByRole("button", { name: "5 lbs lighter" }));
    fireEvent.click(logButton());
    await waitFor(async () => expect((await loggedSets())[0]?.weight).toBe(185));
  });

  it("drops from the rest screen in one tap, with no rest between drops, as often as wanted, then rests", async () => {
    await open();
    fireEvent.click(logButton());
    const timer = await screen.findByRole("timer");
    fireEvent.click(await within(timer).findByRole("button", { name: "Drop to 150 lbs" }));
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByTestId("drop-set")).toHaveTextContent("Drop 1 · after set 1 · no rest");
    expect(screen.getByTestId("drop-set").querySelector('[data-evidence="drop-set-evidence"]')).not.toBeNull();
    expect(screen.getByTestId("weight")).toHaveTextContent("150");
    expect(screen.getByTestId("loading-line")).toHaveTextContent("per side: 45 · 5 · 2.5");

    // Adjusted before logging.
    fireEvent.click(screen.getByRole("button", { name: "5 lbs heavier" }));
    expect(screen.getByTestId("weight")).toHaveTextContent("155");
    fireEvent.click(screen.getByRole("button", { name: "One more rep" }));
    await clickWhenEnabled(logDrop);
    await waitFor(async () => expect(await loggedSets()).toHaveLength(2));
    await waitFor(() => expect(screen.getByTestId("drop-set")).toHaveTextContent("Drop 2"));
    expect(screen.queryByRole("timer")).toBeNull();
    expect(screen.getByTestId("drop-chain")).toHaveTextContent("190×3 → 155×4");
    // 155 x 0.8 = 124 -> 125.
    expect(screen.getByTestId("weight")).toHaveTextContent("125");

    await clickWhenEnabled(logDrop);
    await waitFor(async () => expect(await loggedSets()).toHaveLength(3));
    await waitFor(() => expect(screen.getByTestId("drop-set")).toHaveTextContent("Drop 3"));
    expect(screen.queryByRole("timer")).toBeNull();

    await clickWhenEnabled(doneRest);
    const rest = await screen.findByRole("timer");
    expect(rest).toHaveTextContent("3:30");
    const sets = await loggedSets();
    expect(sets.map((s) => [s.weight, s.actualReps, s.role ?? "work", s.dropOf ?? null])).toEqual([
      [190, 3, "work", null],
      [155, 4, "drop", sets[0].id],
      [125, 4, "drop", sets[1].id],
    ]);

    // Drops are not sets of the lift: set 2 of 5 is next.
    fireEvent.click(within(rest).getByRole("button", { name: "Skip rest" }));
    expect(screen.getByText("Set 2 of 5")).toBeInTheDocument();
  });

  it("lists drops under their set in the overview, each one correctable", async () => {
    await open();
    fireEvent.click(logButton());
    fireEvent.click(
      await within(await screen.findByRole("timer")).findByRole("button", { name: "Drop to 150 lbs" })
    );
    await clickWhenEnabled(logDrop);
    await waitFor(async () => expect(await loggedSets()).toHaveLength(2));
    await clickWhenEnabled(doneRest);
    fireEvent.click(within(await screen.findByRole("timer")).getByRole("button", { name: "Skip rest" }));

    fireEvent.click(screen.getByRole("button", { name: "Workout overview" }));
    const list = screen.getByRole("list", { name: "Barbell Squat logged sets" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(
      within(list).getByRole("button", { name: /^Correct drop after set 1 of Barbell Squat: 3 reps at 150 lbs/ })
    ).toHaveTextContent("150×3");
  });
});

describe("correcting a logged set from the overview", () => {
  const openOverview = () => fireEvent.click(screen.getByRole("button", { name: "Workout overview" }));
  const squatSets = () => screen.getByRole("list", { name: "Barbell Squat logged sets" });
  const setButton = (n: number) =>
    within(squatSets()).getByRole("button", { name: new RegExp(`^Correct set ${n} of Barbell Squat`) });

  async function openWithToaster() {
    nav.sessionId = await startWorkout({
      templateId: "A1",
      location: "gym",
      includeWarmUps: false,
      selectedAccessories: [],
    });
    render(
      <>
        <ActiveWorkoutPage />
        <Toaster />
      </>
    );
    await screen.findByRole("button", { name: /^LOG/ });
  }

  it("lists every logged working set, and a corrected one updates the list and the workout row", async () => {
    await openWithToaster();
    await logSets(3);
    openOverview();
    expect(within(squatSets()).getAllByRole("listitem")).toHaveLength(3);
    expect(setButton(2)).toHaveAccessibleName(
      "Correct set 2 of Barbell Squat: 3 reps at 190 lbs"
    );

    fireEvent.click(setButton(2));
    expect(await screen.findByRole("heading", { name: "Squat, set 2" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Decrease reps by 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Save change" }));

    await waitFor(() =>
      expect(setButton(2)).toHaveAccessibleName(
        "Correct set 2 of Barbell Squat: 2 reps at 190 lbs, below the target of 3"
      )
    );
    expect(setButton(2)).toHaveTextContent("Set 2" + "2 reps" + "missed");
    expect(await screen.findByText("Squat set 2 corrected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    const stored = (await db.workouts.get(nav.sessionId))!.sets;
    expect(stored.map((s) => [s.setNumber, s.actualReps, s.status])).toEqual([
      [1, 3, "completed"],
      [2, 2, "failed"],
      [3, 3, "completed"],
    ]);
    // Still three sets done: the workout carries on at the fourth.
    expect(screen.getByText("Set 4 of 5")).toBeInTheDocument();
  });

  it("deleting the last set steps the counter back so it can be logged again", async () => {
    await openWithToaster();
    await logSets(3);
    openOverview();
    fireEvent.click(setButton(3));
    fireEvent.click(await screen.findByRole("button", { name: "Delete set" }));

    await waitFor(() => expect(within(squatSets()).getAllByRole("listitem")).toHaveLength(2));
    expect(await screen.findByText("Squat set 3 deleted")).toBeInTheDocument();
    expect(screen.getByText("Set 3 of 5")).toBeInTheDocument();
    expect((await db.workouts.get(nav.sessionId))!.sets).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(async () => expect((await db.workouts.get(nav.sessionId))!.sets).toHaveLength(3));
    expect(await screen.findByText("Set 4 of 5")).toBeInTheDocument();
  });

  it("explains inside the sheet why a set in the middle cannot be deleted", async () => {
    await openWithToaster();
    await logSets(2);
    openOverview();
    fireEvent.click(setButton(1));
    fireEvent.click(await screen.findByRole("button", { name: "Delete set" }));

    expect(
      await screen.findByText(/Only the last set logged for an exercise can be deleted/)
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Squat, set 1" })).toBeInTheDocument();
    expect((await db.workouts.get(nav.sessionId))!.sets).toHaveLength(2);
  });

  it("still offers the overview after ending early, so the last set can be fixed before saving", async () => {
    await openWithToaster();
    await logSets(5);
    openOverview();
    fireEvent.click(await screen.findByRole("button", { name: "End workout" }));
    fireEvent.click(await screen.findByRole("button", { name: /End & Save Progress/ }));
    await screen.findByRole("button", { name: "Finish & View Summary" });

    openOverview();
    expect(screen.queryByRole("button", { name: "End workout" })).toBeNull();
    fireEvent.click(setButton(5));
    fireEvent.click(await screen.findByRole("button", { name: "Decrease reps by 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Decrease reps by 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Save change" }));
    await waitFor(async () =>
      expect((await db.workouts.get(nav.sessionId))!.sets[4]).toMatchObject({ actualReps: 1, status: "failed" })
    );

    fireEvent.click(screen.getByRole("button", { name: "Finish & View Summary", hidden: true }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const squat = (await db.liftStates.get("squat"))!;
    expect(squat.t1Stage).toBe("6x2");
    expect(squat.t1Weight).toBe(190);
  });
});

describe("glass box: forecast, why and rest", () => {
  async function toLastSquatSet() {
    await open();
    await logSets(4);
    expect(screen.getByText("Set 5 of 5")).toBeInTheDocument();
  }

  it("shows the stored rep forecast as bars above the rep buttons on a T1 lift's last set", async () => {
    await toLastSquatSet();
    const panel = await screen.findByTestId("rep-forecast");
    const bars = panel.querySelectorAll("[data-reps]");
    const buttons = within(panel).getAllByRole("button");
    // Column for column: one button per bar, in the same order.
    expect(buttons).toHaveLength(bars.length);
    expect(bars.length).toBe(6);
    expect(panel.querySelectorAll("[data-in-range]").length).toBeGreaterThan(0);
    const note = screen.getByTestId("forecast-note");
    // No finished T1 sets yet: the forecast says it is a starting guess.
    expect(note).toHaveTextContent(/starting guess/);
    expect(within(note).getByRole("link", { name: "How right has this been?" })).toHaveAttribute(
      "href",
      "/progress/forecasts/record"
    );
    // The stepper stays, and a forecast button picks its count.
    expect(screen.getByRole("button", { name: "One more rep" })).toBeInTheDocument();
    fireEvent.click(buttons[buttons.length - 2]);
    expect(logButton()).toHaveTextContent(`LOG ${bars[bars.length - 2].getAttribute("data-reps")} REPS`);
  });

  it("shows nothing made up when no forecast was stored for the lift", async () => {
    nav.sessionId = await startWorkout({
      templateId: "A1",
      location: "gym",
      includeWarmUps: false,
      selectedAccessories: [],
    });
    await db.forecasts.clear();
    render(<ActiveWorkoutPage />);
    await screen.findByRole("button", { name: /^LOG/ });
    await logSets(4);
    expect(screen.getByText("Set 5 of 5")).toBeInTheDocument();
    expect(screen.queryByTestId("rep-forecast")).toBeNull();
    expect(screen.queryByTestId("forecast-note")).toBeNull();
    // The usual chips are back.
    expect(screen.getByRole("button", { name: "3 reps" })).toBeInTheDocument();
  });

  it("opens the saved weight trace from 'why' beside the weight", async () => {
    await open();
    fireEvent.click(await screen.findByRole("button", { name: "Why 190 lbs?" }));
    const sheet = await screen.findByRole("dialog");
    expect(sheet).toHaveTextContent(/why this weight/i);
    expect(sheet.querySelector('[data-slot="why-result"]')).toHaveTextContent("190");
  });

  it("after the last squat set, the rest says why it is this long and how the set compared", async () => {
    await toLastSquatSet();
    fireEvent.click(logButton());
    const timer = await screen.findByRole("timer");
    const banner = await within(timer).findByTestId("last-set-banner");
    expect(banner).toHaveTextContent(/Forecast was \d+ \(\d+ to \d+\)\. You got 3\./);
    expect(within(timer).getByTestId("rest-why")).toHaveTextContent("Why 3:30");
    expect(timer.querySelector('[data-evidence="rest-cut-bonus"]')).not.toBeNull();
    expect(within(timer).getByTestId("up-next")).toHaveTextContent("Barbell Bench Press");
    for (const name of ["+5s", "+15s", "Skip rest"]) {
      expect(within(timer).getByRole("button", { name })).toBeInTheDocument();
    }
  });
});
