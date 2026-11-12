import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb } from "@/lib/data/testUtils";
import { updateSettings } from "@/lib/data/records";
import { overridesFromSession } from "@/lib/workout";
import type { ActivityLog, RunLog } from "@/types";
import ConfigureWorkoutPage from "./page";

const nav = vi.hoisted(() => ({ params: "", push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push }),
  useSearchParams: () => new URLSearchParams(nav.params),
}));

const HOUR = 60 * 60 * 1000;

beforeEach(async () => {
  cleanup();
  await clearDb();
  await initializeDatabase();
  nav.params = "";
  nav.push.mockReset();
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
    expect(rows()).toEqual([
      "T1Barbell Squatwarm-up: 45×10 · 95×5 · 135×3 · 160×1190 lbs5×3+",
      "T2Barbell Bench Press100 lbs3×10",
      "T3Lat Pulldown90 lbs3×15+",
    ]);
    expect(screen.getByRole("button", { name: "Gym" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Warm-up sets" })).toBeChecked();
    expect(screen.getByText(/Est\. time: ~40 min/)).toBeInTheDocument();
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

  it("keeps the optional parts in collapsed expanders", async () => {
    await open();
    for (const title of [
      "How are you feeling?",
      "Any pain or soreness?",
      "Technique review (Squat)",
      "Add accessories",
    ]) {
      const details = screen.getByText(title).closest("details")!;
      expect(details).not.toHaveAttribute("open");
    }
    // Nothing to substitute at the gym.
    expect(screen.queryByText("Alternatives for home")).toBeNull();
    // Their evidence lines are still there.
    expect(document.querySelector('[data-evidence="readiness"]')).not.toBeNull();
    expect(document.querySelector('[data-evidence="accessories-in-cut"]')).not.toBeNull();
  });

  it("switching off warm-ups and going home changes the list to what will be performed", async () => {
    await open();
    fireEvent.click(screen.getByRole("switch", { name: "Warm-up sets" }));
    expect(rows()[0]).toBe("T1Barbell Squat190 lbs5×3+");

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
    await waitFor(() => expect(nav.push).toHaveBeenCalled());
    const [session] = await db.workouts.toArray();
    expect(nav.push).toHaveBeenCalledWith(`/workout/active?sessionId=${session.id}`);
    expect(session).toMatchObject({ templateId: "B2", location: "home" });
    expect(overridesFromSession(session)).toEqual({ deadlift: "single_leg_db_rdl" });
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
    expect(screen.getByText("Barbell Bench Press (T2)")).toBeInTheDocument();
    expect(
      ["run-interference", "activity-fatigue", "recovery-windows"].every((id) =>
        document.querySelector(`[data-evidence="${id}"]`)
      )
    ).toBe(true);

    // Accepting the time-off suggestion lowers the weight shown in the list.
    fireEvent.click(screen.getByRole("button", { name: /^Accept \(\d+ lbs\)$/ }));
    await waitFor(async () => expect((await db.liftStates.get("bench"))!.t2Weight).toBeLessThan(100));
    await waitFor(() => expect(screen.queryByText("Barbell Bench Press (T2)")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText(/Hard yoga session/)).toBeNull();
  });

  it("limits accessories by phase and adds the chosen ones to the list and the estimate", async () => {
    await open();
    const picker = screen.getByText("Add accessories").closest("details")!;
    const boxes = within(picker).getAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    expect(rows()).toHaveLength(4);
    expect(screen.getByText(/Est\. time: ~46 min/)).toBeInTheDocument();
  });
});
