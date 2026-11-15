import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import { writeForecasts } from "@/lib/data/forecasts";
import { replayForecasts } from "@/lib/forecast";
import { demoReplayInput, forecastRow, t1Session } from "@/lib/forecast/testHelpers";
import { initializeDatabase } from "@/db/init";
import type { Forecast } from "@/types";
import { ForecastsEntry } from "./ForecastsEntry";
import { ForecastsScreen } from "./ForecastsScreen";
import { TrackRecordScreen } from "./TrackRecordScreen";
import { TOO_FEW_TO_JUDGE } from "./forecastText";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/progress/forecasts",
  useSearchParams: () => new URLSearchParams(),
}));

const DAY = 24 * 60 * 60 * 1000;

beforeEach(async () => {
  await clearDb();
});
afterEach(cleanup);

/** A horizon forecast still waiting for its date. */
function openAhead(overrides: Partial<Forecast> = {}): Forecast {
  const now = Date.now();
  return forecastRow({
    id: "h1",
    clientId: "h1",
    slot: "e1rm4w|deadlift|2026-W46",
    kind: "e1rm4w",
    workoutId: undefined,
    exerciseId: "deadlift",
    madeAt: new Date(now - DAY),
    dueAt: new Date(now + 27 * DAY),
    event: { type: "e1rmLevel", windowDays: 7 },
    prediction: { point: 271, low: 260, high: 283, unit: "lb" },
    basis: "trend",
    inputs: { sampleSize: 9, ratePerWeek: 1.2, level: 262 },
    modelVersion: "e1rm-1",
    ...overrides,
  });
}

async function seedReplay() {
  const input = demoReplayInput(new Date());
  const replay = replayForecasts(input);
  await db.workouts.bulkPut(input.workouts);
  await db.bodyweight.bulkPut(input.bodyweight);
  await writeForecasts(replay.forecasts);
  return replay;
}

describe("Forecasts", () => {
  it("explains that forecasts start with the next workout when none are stored", async () => {
    render(<ForecastsScreen />);
    expect(await screen.findByText("No forecasts yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Today" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Track record" })).toHaveAttribute(
      "href",
      "/progress/forecasts/record"
    );
  });

  it("shows each stored open forecast and opens its working", async () => {
    await db.forecasts.bulkAdd([openAhead()]);
    render(<ForecastsScreen />);
    const row = await screen.findByRole("button", { name: /Deadlift estimated max/ });
    expect(within(row).getByText("271")).toBeInTheDocument();
    expect(within(row).getByText("260 to 283")).toBeInTheDocument();
    expect(within(row).getByText(/Trend of 9 results/)).toBeInTheDocument();
    expect(within(row).getByRole("img", { name: /Likely between 260 and 283/ })).toBeInTheDocument();

    fireEvent.click(row);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText("Results used")).toBeInTheDocument();
    expect(within(sheet).getByRole("link", { name: /Deadlift page/ })).toHaveAttribute(
      "href",
      "/progress/lift/deadlift"
    );
    expect(within(sheet).getByRole("button", { name: /^Why\?/ })).toBeInTheDocument();
  });

  it("puts the workout in progress above the weeks ahead", async () => {
    const now = Date.now();
    await db.workouts.add({
      id: "w-live",
      clientId: "w-live",
      templateId: "A1",
      startedAt: new Date(now - 10 * 60 * 1000),
      completedAt: null,
      location: "gym",
      sets: [],
      synced: false,
    } as never);
    await db.forecasts.bulkAdd([
      openAhead(),
      forecastRow({ id: "fc:w-live:amrapReps:squat:T1", workoutId: "w-live", madeAt: new Date(now - 600000) }),
    ]);
    render(<ForecastsScreen />);
    const today = await screen.findByRole("region", { name: "Today's workout" });
    expect(within(today).getByRole("button", { name: /Reps on today's last squat set/ })).toBeInTheDocument();
    const ahead = screen.getByRole("region", { name: "Weeks ahead" });
    expect(today.compareDocumentPosition(ahead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("Forecasts: the second set", () => {
  const now = Date.now();
  const stall = openAhead({
    id: "h-stall",
    clientId: "h-stall",
    slot: "stallRisk|squat|2026-W46",
    kind: "stallRisk",
    exerciseId: "squat",
    dueAt: new Date(now + 12 * DAY),
    event: { type: "missAtStage", weight: 250, reps: 3, windowDays: 14, minResults: 2 },
    prediction: { point: 0.42, probability: 0.42, unit: "chance" },
    inputs: { sampleSize: 6, stage: "5x3", passFirst: 0.8, gapDays: 9, weight: 250, increment: 10 },
    modelVersion: "stall-1",
  });
  const milestone = openAhead({
    id: "h-mile",
    clientId: "h-mile",
    slot: "milestone|squat|2026-W46",
    kind: "milestone",
    exerciseId: "squat",
    dueAt: new Date(now + 30 * DAY),
    event: { type: "weightReached", weight: 275 },
    prediction: {
      point: (now + 18 * DAY) / DAY,
      low: (now + 9 * DAY) / DAY,
      high: (now + 30 * DAY) / DAY,
      unit: "day",
    },
    inputs: { sampleSize: 6, gapDays: 9, target: 275 },
    modelVersion: "milestone-1",
  });

  it("shows the stall chance and the round-number date in plain words, each with its bar and grade", async () => {
    await db.forecasts.bulkAdd([stall, milestone]);
    render(<ForecastsScreen />);
    const stallRow = await screen.findByRole("button", { name: /Squat misses at 5×3 in the next two sessions/ });
    expect(within(stallRow).getByText("42%")).toBeInTheDocument();
    expect(within(stallRow).getByRole("img", { name: /20% at the next session, 42% within two/ })).toBeInTheDocument();
    expect(within(stallRow).getByText(/Heuristic/i)).toBeInTheDocument();

    const dateRow = screen.getByRole("button", { name: /Squat reaches 275 lb/ });
    expect(within(dateRow).getByRole("img", { name: /Likely between/ })).toBeInTheDocument();
    expect(within(dateRow).getByText("Checked when the bar first has 275 lb on it")).toBeInTheDocument();

    const rules = screen.getByRole("region", { name: "How the weeks ahead are worked out" });
    const shown = [...rules.querySelectorAll("[data-evidence]")].map((el) => el.getAttribute("data-evidence"));
    expect(shown).toEqual(["forecast-stall", "forecast-milestone"]);
  });

  it("explains when the last workout's muscles are ready again, and says it is not scored", async () => {
    await initializeDatabase();
    const at = new Date(now - 10 * 60 * 60 * 1000);
    await db.workouts.add(t1Session({ id: "w-done", at, weight: 200, lastReps: 5 }));
    render(<ForecastsScreen />);
    const section = await screen.findByRole("region", { name: "Muscles ready again" });
    expect(within(section).getByText("Quads")).toBeInTheDocument();
    expect(within(section).getByText(/Not scored like the forecasts above/)).toBeInTheDocument();
    expect(section.querySelector('[data-evidence="forecast-muscle-ready"]')).not.toBeNull();
  });
});

describe("Track record", () => {
  it("explains how the record builds up before anything is checked", async () => {
    await db.forecasts.bulkAdd([openAhead()]);
    render(<TrackRecordScreen />);
    expect(await screen.findByText("How the record builds up")).toBeInTheDocument();
    expect(screen.getByText("1 forecast is waiting for a result.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Forecasts" })).toHaveAttribute("href", "/progress/forecasts");
  });

  it("shows counts in place of a share with only a few results", async () => {
    const input = demoReplayInput(new Date());
    const replay = replayForecasts(input, { horizon: false });
    const few = replay.scored
      .filter((s) => s.status.state === "resolved" && s.forecast.kind === "amrapReps")
      .slice(0, 3)
      .map((s) => s.forecast);
    expect(few).toHaveLength(3);
    await db.workouts.bulkPut(input.workouts);
    await writeForecasts(few);
    render(<TrackRecordScreen />);
    const headline = await screen.findByText(/landed inside the forecast range/);
    expect(headline).toHaveTextContent(TOO_FEW_TO_JUDGE);
    expect(headline).toHaveTextContent(/of 3 results/);
    expect(screen.getAllByText(TOO_FEW_TO_JUDGE).length).toBeGreaterThan(0);
    expect(screen.queryByText(/% on target/)).not.toBeInTheDocument();
  });

  it("scores the replayed demo history with a chart, its text and the void line", async () => {
    const replay = await seedReplay();
    render(<TrackRecordScreen />);
    expect(await screen.findByText("How right has it been?")).toBeInTheDocument();
    const { ranges } = replay.record.overall;
    expect(
      screen.getByText(new RegExp(`${ranges.inside} of ${ranges.n} results so far landed inside`))
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /When it said/ })).toBeInTheDocument();
    expect(document.querySelector("[data-slot=calibration-summary]")?.textContent).toMatch(/When it said/);
    expect(screen.getByText("Reps on the last set")).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Period" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "4 weeks" }));
    expect(screen.getByRole("radio", { name: "4 weeks" })).toHaveAttribute("aria-checked", "true");
  });
});

describe("Progress entry", () => {
  it("links to Forecasts with the open count", async () => {
    await db.forecasts.bulkAdd([openAhead()]);
    render(<ForecastsEntry />);
    const link = await screen.findByRole("link", { name: /Forecasts/ });
    expect(link).toHaveAttribute("href", "/progress/forecasts");
    expect(await within(link).findByText(/1 open/)).toBeInTheDocument();
  });
});
