import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { updateSettings } from "@/lib/data/records";
import { startWorkout } from "@/lib/data/workouts";
import { formatRestDuration, getRestSeconds } from "@/lib/restTimes";
import { overridesFromSession } from "@/lib/workout";
import type { ActivityLog, RunLog } from "@/types";
import { testFavorite } from "@/components/Favorites/testFavorites";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import ConfigureWorkoutPage from "./page";

const toasts = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/components/ui/toast", () => toasts);

const nav = vi.hoisted(() => ({ params: "", push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.params),
}));

const HOUR = 60 * 60 * 1000;

beforeEach(async () => {
  cleanup();
  await clearDb();
  await initializeDatabase();
  await seedFixtureStartingWeights();
  nav.params = "";
  nav.push.mockReset();
  nav.replace.mockReset();
});

async function open(params = "") {
  nav.params = params;
  render(<ConfigureWorkoutPage />);
  return screen.findByRole("button", { name: "START WORKOUT" });
}

const rows = () =>
  screen.getAllByTestId("planned-exercise").map((row) => row.textContent?.replace(/\s+/g, " "));

describe("configure page", () => {
  it("is one 'ready?' screen: workout, the list as performed, location, warm-ups, time, start", async () => {
    await open();
    expect(screen.getByText("Ready?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A1 · Squat day" })).toBeInTheDocument();
    // Each row ends with the rest that follows its sets (cutting: +30s on T1 and T2).
    expect(rows()).toEqual([
      "T1Barbell Squatwarm-up: 45×10 · 95×5 · 135×3 · 160×1190 lbs5×3+ · rest 3:30",
      "T2Barbell Bench Press100 lbs3×10 · rest 2:30",
      "T3Lat Pulldown90 lbs3×15+ · rest 1:30",
    ]);
    expect(screen.getByRole("button", { name: "Gym" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Warm-up sets" })).toBeChecked();
    // The accessories chosen for the day, in their own rows under the lifts (A8).
    const accessories = screen.getAllByTestId("accessory-row");
    expect(accessories.length).toBeGreaterThan(0);
    for (const row of accessories) expect(within(row).getByTestId("accessory-scheme")).toHaveTextContent(/^3×\d+–\d+$/);
    expect(screen.getByRole("button", { name: "Change accessories" })).toBeInTheDocument();
    // Every set plus its rest, warm-ups and accessories included: the same figure Today shows.
    // The session-length forecast for this plan with its range; with no history yet it is
    // the length on paper (every set and rest, warm-ups included), as Today shows it.
    await waitFor(() =>
      expect(screen.getByTestId("ready-length")).toHaveTextContent(/^About \d+ of 60 min \(\d+ to \d+\), rests included$/)
    );
  });

  it("changes the session length for this workout from the length line, and saves it as the usual on request", async () => {
    await open();
    const accessoryCount = () => screen.queryAllByTestId("accessory-row").length;
    fireEvent.click(screen.getByRole("button", { name: /Change the session length$/ }));
    const chooser = await screen.findByRole("dialog", { name: "Session length" });
    expect(within(chooser).getAllByRole("radio").map((r) => r.textContent)).toEqual([
      "30 min",
      "45 min",
      "60 min",
      "75 min",
      "90 min",
      "No limit",
    ]);
    expect(within(chooser).getByRole("radio", { name: "60 min" })).toHaveAttribute("aria-checked", "true");
    expect(within(chooser).getByTestId("usual-length")).toBeInTheDocument();
    expect(within(chooser).getByRole("button", { name: /^Why\? / })).toHaveAttribute("data-evidence", "session-length-budget");

    // No limit: every pick is planned.
    fireEvent.click(within(chooser).getByRole("radio", { name: "No limit" }));
    await waitFor(() => expect(screen.getByTestId("ready-length")).toHaveTextContent(/^About \d+ min/));
    const all = accessoryCount();

    // 30 minutes: the accessories are planned again at once, the lifts stay.
    fireEvent.click(screen.getByRole("button", { name: /Change the session length$/ }));
    fireEvent.click(within(await screen.findByRole("dialog", { name: "Session length" })).getByRole("radio", { name: "30 min" }));
    await waitFor(() => expect(screen.getByTestId("ready-length")).toHaveTextContent(/^About \d+ of 30 min/));
    expect(accessoryCount()).toBeLessThan(all);
    expect(rows()).toHaveLength(3);
    expect((await db.userProfile.toCollection().first())!.settings.sessionMinutes).toBeUndefined();

    // The sheet says why, and one can be added anyway.
    fireEvent.click(screen.getByRole("button", { name: "Change accessories" }));
    const sheet = await screen.findByRole("dialog", { name: /^Accessories/ });
    expect(within(sheet).getByTestId("accessory-budget-line")).toHaveTextContent(/^The main lifts alone take about \d+ of 30 min: no accessories added$/);
    const leftOut = within(sheet).getAllByTestId("accessory-left-out");
    expect(leftOut).toHaveLength(all);
    const addAnyway = within(leftOut[0]).getByRole("button", { name: /anyway$/ });
    fireEvent.click(addAnyway);
    await waitFor(() => expect(within(sheet).getAllByTestId("accessory-card")).toHaveLength(1));
    expect(within(sheet).getAllByTestId("accessory-left-out")).toHaveLength(all - 1);
    fireEvent.click(within(sheet).getByRole("button", { name: "Done" }));

    // Saved as the usual length.
    fireEvent.click(screen.getByRole("button", { name: /Change the session length$/ }));
    fireEvent.click(
      within(await screen.findByRole("dialog", { name: "Session length" })).getByRole("button", { name: "Make 30 min my usual length" })
    );
    await waitFor(async () =>
      expect((await db.userProfile.toCollection().first())!.settings.sessionMinutes).toBe(30)
    );
  });

  it("takes the session length for this workout from ?minutes=, without saving it", async () => {
    await open("minutes=45");
    await waitFor(() => expect(screen.getByTestId("ready-length")).toHaveTextContent(/^About \d+ of 45 min/));
    expect((await db.userProfile.toCollection().first())!.settings.sessionMinutes).toBeUndefined();
  });

  it("states the rest after each exercise from getRestSeconds, and explains the rest timer once", async () => {
    await open();
    const phase = (await db.userProfile.toCollection().first())!.settings.trainingPhase;
    const rests = screen.getAllByTestId("planned-rest").map((el) => el.textContent);
    expect(rests).toEqual(
      (["T1", "T2", "T3"] as const).map((t) => ` · rest ${formatRestDuration(getRestSeconds(t, phase))}`)
    );
    const key = screen.getByTestId("tier-key");
    expect(within(key).getAllByRole("button", { name: "What does rest mean?" })).toHaveLength(1);
    expect(document.querySelectorAll('[data-term="rest-timer"]')).toHaveLength(1);
  });

  it("opens on the training location saved elsewhere (e.g. Today) and states it with a chip", async () => {
    await updateSettings({ defaultLocation: "home" });
    await open();
    await waitFor(() =>
      expect(document.querySelector("[data-slot=location-chip]")).toHaveAttribute("data-location", "home")
    );
    expect(rows()[1]).toMatch(/^T2DB Bench Press/);

    fireEvent.click(screen.getByRole("button", { name: "Gym" }));
    await waitFor(() =>
      expect(document.querySelector("[data-slot=location-chip]")).toHaveAttribute("data-location", "gym")
    );
    await waitFor(async () =>
      expect((await db.userProfile.toCollection().first())!.settings.defaultLocation).toBe("gym")
    );
  });

  it("has a key above the list explaining the tiers, the '+' and warm-ups", async () => {
    await open();
    const key = screen.getByTestId("tier-key");
    const list = screen.getByRole("list", { name: "Exercises" });
    expect(key.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    for (const word of ["T1", "T2", "T3", "+", "AMRAP", "warm-up"]) {
      expect(within(key).getByRole("button", { name: `What does ${word} mean?` })).toBeInTheDocument();
    }
    fireEvent.click(within(key).getByRole("button", { name: "What does warm-up mean?" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Warm-up sets");
  });

  it("keeps the optional parts in collapsed expanders", async () => {
    await open();
    for (const title of [
      "How are you feeling?",
      "Any pain or soreness?",
      "Technique review (Squat)",
    ]) {
      const details = screen.getByText(title).closest("details")!;
      expect(details).not.toHaveAttribute("open");
    }
    // Nothing to substitute at the gym.
    expect(screen.queryByText("Alternatives for home")).toBeNull();
    // Their evidence lines are still there.
    expect(document.querySelector('[data-evidence="readiness"]')).not.toBeNull();
  });

  it("switching off warm-ups and going home changes the list to what will be performed", async () => {
    await open();
    fireEvent.click(screen.getByRole("switch", { name: "Warm-up sets" }));
    expect(rows()[0]).toBe("T1Barbell Squat190 lbs5×3+ · rest 3:30");

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    await waitFor(() => expect(rows()[1]).toMatch(/^T2DB Bench Pressin place of Barbell Bench Press at 100 lbs/));
    expect(screen.getByText("Alternatives for home")).toBeInTheDocument();
    expect(document.querySelector('[data-evidence="dumbbell-conversion"]')).not.toBeNull();
  });

  it("starts the workout with a chosen home substitute and opens the active screen", async () => {
    await open("templateId=B2");
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    const alternatives = await screen.findByRole("group", { name: "Alternatives" });
    fireEvent.click(within(alternatives).getByRole("button", { name: /Single-Leg DB RDL/ }));
    await waitFor(() => expect(rows()[0]).toMatch(/^T1Single-Leg DB RDLin place of Barbell Deadlift/));

    fireEvent.click(screen.getByRole("button", { name: "START WORKOUT" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    const [session] = await db.workouts.toArray();
    expect(nav.replace).toHaveBeenCalledWith(`/workout/active?sessionId=${session.id}`);
    expect(session).toMatchObject({ templateId: "B2", location: "home" });
    expect(overridesFromSession(session)).toEqual({ deadlift: "single_leg_db_rdl" });
  });

  describe("with a workout already open", () => {
    const openWorkout = () =>
      startWorkout({ templateId: "A2", location: "gym", includeWarmUps: false, selectedAccessories: [] });

    it("offers Resume it or Start a new one instead, and never shows START while it loads", async () => {
      const oldId = await openWorkout();
      nav.params = "";
      render(<ConfigureWorkoutPage />);
      // The first frame with the plan already knows about the open workout.
      await screen.findByRole("heading", { name: "A1 · Squat day" });
      expect(screen.queryByRole("button", { name: "START WORKOUT" })).toBeNull();
      expect(screen.getByRole("link", { name: "Resume it" })).toHaveAttribute(
        "href",
        `/workout/active?sessionId=${oldId}`
      );
      expect(screen.getByTestId("open-workout-note")).toHaveTextContent(
        "Bench day is still open. Starting a new one discards it once the new one has started."
      );
    });

    it("Start a new one instead starts the new workout, then discards the open one", async () => {
      const oldId = await openWorkout();
      render(<ConfigureWorkoutPage />);
      fireEvent.click(await screen.findByRole("button", { name: "Start a new one instead" }));
      await waitFor(() => expect(nav.replace).toHaveBeenCalled());
      const fresh = (await db.workouts.toArray()).find((w) => w.id !== oldId)!;
      expect(nav.replace).toHaveBeenCalledWith(`/workout/active?sessionId=${fresh.id}`);
      await waitFor(async () => expect((await db.workouts.get(oldId))!.deletedAt).toBeTruthy());
      expect(fresh.deletedAt).toBeFalsy();
    });

    it("works the same from any way in: a favourite, Coming up's day or a stale ?replaces=", async () => {
      const oldId = await openWorkout();
      nav.params = "templateId=B2&location=home&replaces=nonsense";
      render(<ConfigureWorkoutPage />);
      expect(await screen.findByRole("link", { name: "Resume it" })).toHaveAttribute(
        "href",
        `/workout/active?sessionId=${oldId}`
      );
      expect(screen.queryByRole("button", { name: "START WORKOUT" })).toBeNull();
    });
  });

  it("starts normally when nothing is open, whatever ?replaces= says", async () => {
    const oldId = await startWorkout({ templateId: "A1", location: "gym", includeWarmUps: false, selectedAccessories: [] });
    await db.workouts.update(oldId, { completedAt: new Date() });
    await open(`replaces=${oldId}`);
    fireEvent.click(screen.getByRole("button", { name: "START WORKOUT" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalled());
    expect((await db.workouts.get(oldId))!.deletedAt).toBeFalsy();
  });

  it("shows advisories above the list as callouts with their evidence lines", async () => {
    await db.runs.put({
      id: "run-1",
      clientId: "run-1",
      date: new Date(Date.now() - 2 * HOUR),
      durationMinutes: 50,
      distanceMiles: 6,
      type: "outdoor",
      category: "tempo",
      notes: "",
      perceivedEffort: 5,
      synced: false,
    } as RunLog);
    await db.activities.put({
      id: "act-1",
      clientId: "act-1",
      date: new Date(Date.now() - 3 * HOUR),
      kind: "yoga",
      style: "power",
      durationMinutes: 60,
      perceivedEffort: 4,
      notes: "",
      synced: false,
    } as ActivityLog);
    await db.liftStates.update("squat", { t1LastWorkoutDate: new Date(Date.now() - 20 * HOUR) });
    await db.liftStates.update("bench", {
      t2LastWorkoutDate: new Date(Date.now() - 40 * 24 * HOUR),
    });
    await open();

    const list = screen.getByRole("list", { name: "Exercises" });
    const callouts = await waitFor(() => {
      const found = Array.from(document.querySelectorAll('[data-slot="callout"]'));
      expect(found).toHaveLength(4);
      return found;
    });
    for (const callout of callouts) {
      expect(callout.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(callout.querySelector("[data-evidence]")).not.toBeNull();
    }
    expect(screen.getByText("Legs may still be fatigued")).toBeInTheDocument();
    expect(screen.getByText(/Hard yoga session 3h ago/)).toBeInTheDocument();
    expect(screen.getByText(/You trained Barbell Squat/)).toBeInTheDocument();
    const decayTitle = screen.getByText((_, el) => el?.getAttribute("data-slot") === "callout-title" && el.textContent === "Barbell Bench Press (T2)");
    expect(decayTitle.querySelector('[data-term="t2"]')).not.toBeNull();
    // Trained recently: the reduce button says what it does, and does it.
    const lower = screen.getByRole("button", { name: "Lower Barbell Squat to 170 lbs" });
    // No glossary button inside it: a button may not contain another.
    expect(lower.querySelector("button")).toBeNull();
    expect(
      ["run-interference", "activity-fatigue", "recovery-windows"].every((id) =>
        document.querySelector(`[data-evidence="${id}"]`)
      )
    ).toBe(true);
    fireEvent.click(lower);
    await waitFor(() => expect(rows()[0]).toMatch(/170 lbs5×3\+/));
    expect(screen.queryByText(/You trained Barbell Squat/)).toBeNull();
    // Nothing is written to the log until the workout starts.
    expect(await db.coachEvents.count()).toBe(0);

    // Accepting the time-off suggestion lowers the weight shown in the list.
    fireEvent.click(screen.getByRole("button", { name: /^Accept \(\d+ lbs\)$/ }));
    await waitFor(async () => expect((await db.liftStates.get("bench"))!.t2Weight).toBeLessThan(100));
    await waitFor(() => expect(screen.queryByText(/Barbell Bench Press \(/)).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText(/Hard yoga session/)).toBeNull();
  });

  it("suggests no lighter weight after a break for a lift trained since in another app", async () => {
    await db.liftStates.update("bench", { t2LastWorkoutDate: new Date(Date.now() - 40 * 24 * HOUR) });
    await db.importedSessions.put(
      importedSession([importedSet({ exerciseName: "Test Floor Press", mappedExerciseId: "db_floor_press", weightPerImplementLb: 40 })], {
        startedAt: new Date(Date.now() - 4 * 24 * HOUR),
      })
    );
    await open();
    await waitFor(() => expect(screen.getAllByTestId("accessory-row").length).toBeGreaterThan(0));
    expect(screen.queryByText(/Barbell Bench Press \(/)).toBeNull();
    expect(screen.queryByRole("button", { name: /^Accept \(\d+ lbs\)$/ })).toBeNull();
  });

  it("changes the accessories in one sheet: remove, swap, add with search, none today, the mode (A8)", async () => {
    await open();
    const before = screen.getAllByTestId("accessory-row").map((row) => row.textContent);
    fireEvent.click(screen.getByRole("button", { name: "Change accessories" }));
    const sheet = await screen.findByRole("dialog", { name: /^Accessories · Squat day$/ });
    const cards = within(sheet).getAllByTestId("accessory-card");
    expect(cards).toHaveLength(before.length);
    for (const card of cards) expect(within(card).getByTestId("accessory-minutes")).toHaveTextContent(/^\+\d+ min$/);

    // Remove the first.
    const first = within(cards[0]).getByRole("button", { name: /^Remove / });
    const removed = first.getAttribute("aria-label")!.replace(/^Remove /, "");
    fireEvent.click(first);
    await waitFor(() => expect(within(sheet).getAllByTestId("accessory-card")).toHaveLength(before.length - 1));
    expect(screen.getAllByTestId("accessory-row").map((r) => r.textContent).join()).not.toContain(removed);

    // Swap the next for an alternative for the same muscle.
    const card = within(sheet).getAllByTestId("accessory-card")[0];
    fireEvent.click(within(card).getByRole("button", { name: "Swap" }));
    const swapTo = within(card).getAllByRole("button", { name: /^Swap / })[0];
    const swappedIn = swapTo.getAttribute("aria-label")!.replace(/^Swap /, "");
    fireEvent.click(swapTo);
    await waitFor(() => expect(within(sheet).getAllByTestId("accessory-card")[0]).toHaveTextContent(swappedIn));

    // Add from search.
    fireEvent.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(within(sheet).getByRole("region", { name: "For today" })).toBeInTheDocument();
    expect(within(sheet).getByRole("region", { name: "By muscle" })).toBeInTheDocument();
    fireEvent.change(within(sheet).getByRole("searchbox"), { target: { value: "face" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "Add Face pulls" }));
    await waitFor(() => expect(within(sheet).getAllByTestId("accessory-card").at(-1)).toHaveTextContent("Face pulls"));

    // None today, in one tap.
    fireEvent.click(within(sheet).getByRole("button", { name: "No accessories today" }));
    await waitFor(() => expect(within(sheet).queryAllByTestId("accessory-card")).toHaveLength(0));
    expect(screen.getByText("No accessories today", { selector: "span" })).toBeInTheDocument();

    // The mode, saved with the profile.
    expect(within(sheet).getByTestId("accessory-mode-line")).toHaveTextContent(/chosen for you/);
    fireEvent.click(within(sheet).getByRole("button", { name: "Ask me" }));
    await waitFor(async () =>
      expect((await db.userProfile.toCollection().first())!.settings.accessories).toBe("ask")
    );
  });

  it("sets an accessory's weight in place, with the plan's beside it until it is put back", async () => {
    // Curls pinned to the day, with made-up imported sessions to give them a plan weight.
    await updateSettings({ accessoryPins: { A1: ["bicep_curls"] } });
    await db.importedSessions.put(
      importedSession(
        [0, 1, 2].map(() => importedSet({ exerciseName: "Bicep Curl", mappedExerciseId: "bicep_curls", weightPerImplementLb: 30, reps: 12 })),
        { startedAt: new Date(Date.now() - 5 * 24 * HOUR) }
      )
    );
    // Today's "Change" lands here with the sheet open.
    nav.params = "accessories=open";
    render(<ConfigureWorkoutPage />);
    const sheet = await screen.findByRole("dialog", { name: /^Accessories/ });
    const card = (await within(sheet).findAllByTestId("accessory-card")).find((c) => /Bicep curls/i.test(c.textContent ?? ""))!;
    expect(within(card).getByRole("textbox", { name: "Bicep curls weight in pounds" })).toHaveValue("30");
    const heavier = within(card).getByRole("button", { name: / lb heavier$/ });
    fireEvent.click(heavier);
    fireEvent.click(heavier);
    const planYou = await within(sheet).findByTestId("plan-you");
    expect(planYou).toHaveTextContent(/^Plan \d+ · You \d+/);
    fireEvent.click(within(planYou).getByRole("button", { name: /^Use plan's weight/ }));
    await waitFor(() => expect(within(sheet).queryByTestId("plan-you")).toBeNull());
  });
});

describe("configure page: favourites", () => {
  async function addFavorite(weight: number) {
    const favorite = testFavorite("fav-1", "Heavy bench");
    await db.favoriteWorkouts.add({
      ...favorite,
      snapshot: favorite.snapshot.map((e) => (e.tier === "T2" ? { ...e, weight } : e)),
    });
  }

  it("starts a favourite with today's weights by default and says so", async () => {
    await addFavorite(80);
    await open("favorite=fav-1");
    expect(screen.getByText("From favourite: Heavy bench · Today's weights")).toBeInTheDocument();
    expect(rows()[1]).toMatch(/^T2Barbell Bench Press100 lbs/);
  });

  it("starts a favourite exactly as saved", async () => {
    await addFavorite(80);
    await open("favorite=fav-1&mode=as-saved");
    expect(screen.getByText("From favourite: Heavy bench · Exactly as saved")).toBeInTheDocument();
    expect(rows()[1]).toMatch(/^T2Barbell Bench PressLogged only, progression paused80 lbs/);
  });

  it("says so when a favourite's weights from the other location are not used", async () => {
    await addFavorite(80);
    await open("favorite=fav-1&mode=as-saved");
    expect(screen.queryByTestId("favorite-pin-note")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(await screen.findByTestId("favorite-pin-note")).toHaveTextContent(
      /^Saved at the gym: at home each lift uses its home exercise's own weight for Squat, Bench Press/
    );
    expect(rows()[1]).not.toMatch(/80 lbs/);
  });

  it("falls back to the normal screen with one line when the favourite is gone", async () => {
    await open("favorite=nope");
    expect(screen.getByText("That favourite no longer exists.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A1 · Squat day" })).toBeInTheDocument();
    expect(screen.queryByText(/From favourite/)).toBeNull();
  });

  it("opens the picker and navigates to the chosen favourite and mode", async () => {
    await addFavorite(80);
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Favourites" }));
    fireEvent.click(await screen.findByRole("button", { name: /Exactly as saved/ }));
    expect(nav.replace).toHaveBeenCalledWith("/workout/configure?favorite=fav-1&mode=as-saved");
  });

  it("saves the set-up under a name and confirms with a toast", async () => {
    await open();
    fireEvent.click(screen.getByRole("button", { name: "Save as favourite" }));
    const name = await screen.findByRole("textbox");
    expect(name).toHaveValue("A1 · Squat day");
    fireEvent.change(name, { target: { value: "My squat day" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(async () => expect(await db.favoriteWorkouts.count()).toBe(1));
    const saved = (await db.favoriteWorkouts.toArray())[0];
    expect(saved).toMatchObject({ name: "My squat day", templateId: "A1", location: "gym" });
    // The accessories chosen for the day are kept with it.
    expect(saved.snapshot.map((e) => e.tier).slice(0, 3)).toEqual(["T1", "T2", "T3"]);
    expect(saved.selectedAccessories.length).toBeGreaterThan(0);
    expect(saved.snapshot.filter((e) => e.tier === "accessory").map((e) => e.exerciseId)).toEqual(saved.selectedAccessories);
    await waitFor(() => expect(toasts.toast).toHaveBeenCalledWith({ message: "Saved to favourites" }));
  });

  it("offers the applied favourite's name when saving again", async () => {
    await addFavorite(80);
    await open("favorite=fav-1");
    fireEvent.click(screen.getByRole("button", { name: "Save as favourite" }));
    expect(await screen.findByRole("textbox")).toHaveValue("Heavy bench");
  });
});
