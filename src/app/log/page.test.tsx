import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeE1RM, makeSet, makeWorkout } from "@/lib/data/testUtils";
import { makeImportedSession, makeImportedSet } from "@/lib/import/testRecords";
import { LOG_PAGE_SIZE } from "@/components/Log/logEntries";
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
    expect(within(days()[1]).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/log/workout?id=w-new"]);
    expect(within(days()[1]).getByText(/Outdoor run, easy/)).toBeInTheDocument();
    expect(screen.queryByText("Workout B1")).toBeNull();
    expect(screen.queryByText("Workout B2")).toBeNull();
    expect(screen.getAllByText(/Outdoor run/)).toHaveLength(1);
  });

  it("describes a workout's result and marks a PR against earlier sessions only", async () => {
    await seed();
    render(<LogPage />);
    const latest = (await screen.findByRole("link", { name: /A1 · Squat day.*Squat 195 lbs/ })) as HTMLElement;
    expect(latest).toHaveTextContent("Gym · Squat 195 lbs · all targets hit");
    expect(within(latest).getByText("PR")).toBeInTheDocument();
    const older = screen.getByRole("link", { name: /Squat 185 lbs/ });
    expect(within(older).queryByText("PR")).toBeNull();
  });

  it("stars a finished workout from its row without opening it, outside the link", async () => {
    await seed();
    render(<LogPage />);
    const row = (await screen.findByRole("link", { name: /Squat 195 lbs/ })) as HTMLElement;
    const stars = await screen.findAllByRole("button", { name: "Save as favourite" });
    // Two finished workouts, two stars; none of them is inside an anchor.
    expect(stars).toHaveLength(2);
    expect(stars.every((s) => s.closest("a") === null)).toBe(true);
    expect(row.querySelector("button")).toBeNull();

    fireEvent.click(stars[0]);
    await waitFor(async () => expect(await db.favoriteWorkouts.count()).toBe(1));
    expect((await db.favoriteWorkouts.toArray())[0].sourceSessionId).toBe("w-new");
    expect(await screen.findByRole("button", { name: "Remove from favourites" })).toBeInTheDocument();
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

// Made-up imported history only: the repository is public.
describe("/log with imported history", () => {
  const pushDay = () =>
    makeImportedSession(
      [
        makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 30, role: "warmup" }),
        makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 50, reps: 10, setOrder: 2, effort: "Hard" }),
        makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 40, reps: 8, setOrder: 3, role: "drop" }),
        makeImportedSet({ exerciseName: "Made-up Cable Row", mappedExerciseId: "lat_pulldown", weightPerImplementLb: 120, reps: 12 }),
      ],
      {
        id: "imp-push",
        sourceApp: "gravl",
        title: "Push Day",
        startedAt: new Date("2026-11-08T17:00:00"),
        endedAt: new Date("2026-11-08T17:45:00"),
      }
    );
  const untitled = () =>
    makeImportedSession(
      [
        makeImportedSet({ exerciseName: "Zorbing Curl", mappedExerciseId: null, muscles: ["biceps"] }),
        makeImportedSet({ exerciseName: "Zorbing Curl", mappedExerciseId: null, muscles: ["biceps"], setOrder: 2 }),
      ],
      { id: "imp-untitled", sourceApp: "fitbod", startedAt: new Date("2026-11-07T08:00:00"), endedAt: null }
    );
  const importedRun = (): RunLog => ({
    ...run("r-imp", "2026-11-06T07:00:00"),
    category: "other",
    perceivedEffort: null,
    source: "import",
    sourceName: "Gravl",
    importBatchId: "batch-1",
  });

  async function seedImported() {
    await seed();
    await db.importedSessions.bulkAdd([pushDay(), untitled()]);
    await db.runs.add(importedRun());
  }

  const rows = (container: HTMLElement) => container.querySelectorAll("[data-slot=list-row]");

  it("lists imported sessions among the entries by date, labelled with their app, sets and duration", async () => {
    await seedImported();
    render(<LogPage />);
    const push = await screen.findByRole("button", { name: /^Push Day/ });
    expect(push).toHaveTextContent("Gravl · 2 working sets · 45 min");
    expect(within(push).getByText("Imported")).toBeInTheDocument();
    // No title: the top exercise names, as written for a name the library does not know.
    const curl = screen.getByRole("button", { name: /^Zorbing Curl/ });
    expect(curl).toHaveTextContent("Fitbod · 2 working sets");
    expect(within(curl).getByText("Imported")).toBeInTheDocument();
    expect(days().map((d) => d.getAttribute("aria-label"))).toEqual([
      "Yesterday",
      "Tue, Nov 10",
      "Sun, Nov 8",
      "Sat, Nov 7",
      "Fri, Nov 6",
      "Tue, Nov 3",
    ]);
  });

  it("labels an imported run, which still opens its edit sheet", async () => {
    await seedImported();
    render(<LogPage />);
    const runRow = await screen.findByRole("button", { name: /Outdoor run, other/ });
    expect(runRow).toHaveTextContent("Gravl · 3.1 mi · 30 min");
    expect(within(runRow).getByText("Imported")).toBeInTheDocument();
    // A run entered by hand carries no label.
    expect(within(screen.getByRole("button", { name: /Outdoor run, easy/ })).queryByText("Imported")).toBeNull();
    fireEvent.click(runRow);
    expect(await screen.findByRole("heading", { name: "Edit run" })).toBeInTheDocument();
  });

  it("the Imported filter shows imported entries only; All and the others as before", async () => {
    await seedImported();
    const { container } = render(<LogPage />);
    await screen.findByRole("button", { name: /^Push Day/ });
    expect(rows(container)).toHaveLength(7);
    fireEvent.click(screen.getByRole("radio", { name: "Imported" }));
    expect(days().map((d) => d.getAttribute("aria-label"))).toEqual(["Sun, Nov 8", "Sat, Nov 7", "Fri, Nov 6"]);
    expect(screen.queryByText("Weigh-in")).toBeNull();
    expect(screen.queryByRole("link", { name: /Squat/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Workouts" }));
    expect(screen.queryByRole("button", { name: /^Push Day/ })).toBeNull();
    expect(screen.getAllByRole("link", { name: /Squat/ })).toHaveLength(2);
  });

  it("tapping an imported session opens its read-only detail", async () => {
    await seedImported();
    render(<LogPage />);
    fireEvent.click(await screen.findByRole("button", { name: /^Push Day/ }));
    const sheet = await screen.findByRole("dialog", { name: "Push Day" });
    expect(within(sheet).getByRole("region", { name: "Made-up DB Press" })).toHaveTextContent("Counts as DB Bench Press");
    expect(sheet).toHaveTextContent("50 lb × 2");
    expect(sheet).toHaveTextContent("never move the workout rotation or GZCLP progression");
    expect(within(sheet).queryByRole("button", { name: /save/i })).toBeNull();
  });

  it("renders a long history in pages, not all at once", async () => {
    const DAY = 86_400_000;
    const latest = new Date("2026-11-11T17:00:00").getTime();
    const many = Array.from({ length: 900 }, (_, i) =>
      makeImportedSession(
        [
          makeImportedSet({ exerciseName: "Made-up Squat", mappedExerciseId: "squat", weightPerImplementLb: 185 }),
          makeImportedSet({ exerciseName: "Made-up Squat", mappedExerciseId: "squat", weightPerImplementLb: 185, setOrder: 2 }),
          makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 50 }),
        ],
        { id: `imp-${String(i).padStart(4, "0")}`, startedAt: new Date(latest - i * DAY) }
      )
    );
    await db.importedSessions.bulkAdd(many);
    const { container } = render(<LogPage />);
    await screen.findAllByRole("button", { name: /^Squat, DB Bench Press/ });
    expect(rows(container)).toHaveLength(LOG_PAGE_SIZE);
    const more = screen.getByRole("button", { name: /Show more/ });
    expect(more).toHaveTextContent(`${900 - LOG_PAGE_SIZE} older`);
    fireEvent.click(more);
    expect(rows(container)).toHaveLength(2 * LOG_PAGE_SIZE);
    // A filter starts again from the first page.
    fireEvent.click(screen.getByRole("radio", { name: "Imported" }));
    expect(rows(container)).toHaveLength(LOG_PAGE_SIZE);
  });
});
