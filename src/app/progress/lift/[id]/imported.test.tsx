// The lift page with history imported from another app: the imported sessions are in
// the charts and stats (marked), can be hidden, and their best is labelled as history;
// the next session's new-best line stays the app's own. Made-up sessions only.
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, makeProfile, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import type { ImportedSessionRecord } from "@/types";

let id = "bench";
vi.mock("next/navigation", () => ({
  useParams: () => ({ id }),
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/chart-kit/LazyTrendChart", () => ({
  LazyTrendChart: (props: { ariaLabel: string; series?: { points: Array<{ imported?: boolean }> } }) => (
    <div
      role="img"
      aria-label={props.ariaLabel}
      data-points={props.series?.points.length ?? 0}
      data-imported={props.series?.points.filter((p) => p.imported).length ?? 0}
    />
  ),
  TrendChartSkeleton: () => null,
}));

import LiftPage from "./page";

const DAY = 86_400_000;
const demo = generateDemoData(new Date());

/** Barbell bench sessions imported from another app, a week apart, ending `endDaysAgo` ago. */
function benchHistory(weights: number[], endDaysAgo: number): ImportedSessionRecord[] {
  return weights.map((weight, i) =>
    importedSession(
      [
        importedSet({ exerciseName: "Bench Press", mappedExerciseId: "bench", weightPerImplementLb: 95, reps: 8, role: "warmup" }),
        importedSet({ exerciseName: "Bench Press", mappedExerciseId: "bench", weightPerImplementLb: weight, reps: 5 }),
        importedSet({ exerciseName: "Bench Press", mappedExerciseId: "bench", weightPerImplementLb: weight, reps: 5 }),
      ],
      { startedAt: new Date(Date.now() - (endDaysAgo + (weights.length - 1 - i) * 7) * DAY) }
    )
  );
}

const e1rmChart = () => screen.getByRole("img", { name: "Barbell Bench Press estimated 1RM over time" });

beforeEach(async () => {
  id = "bench";
  await clearDb();
});
afterEach(cleanup);

describe("Lift page with imported history", () => {
  it("shows the imported sessions instead of an empty page, marked, with their best as history", async () => {
    await initializeDatabase();
    await seedFixtureStartingWeights();
    await db.importedSessions.bulkPut(benchHistory([135, 145, 155], 10));
    render(<LiftPage />);

    expect(await screen.findByTestId("e1rm-latest")).toHaveTextContent(String(Math.round(155 * (1 + 5 / 30))));
    expect(screen.queryByText("No bench sessions yet")).toBeNull();
    expect(screen.getByTestId("e1rm-latest-imported")).toHaveTextContent("Imported");
    expect(e1rmChart()).toHaveAttribute("data-points", "3");
    expect(e1rmChart()).toHaveAttribute("data-imported", "3");
    expect(screen.getByRole("region", { name: "Imported history" })).toHaveTextContent("3 sessions");
    expect(screen.getByTestId("imported-best")).toHaveTextContent(
      `Best before ReComp: ${Math.round(155 * (1 + 5 / 30))} lbs est. 1RM`
    );
    // The working weight is the imported sessions' heaviest set.
    expect(screen.getByRole("region", { name: "Lift stats" })).toHaveTextContent("155");
    // No app workout: nothing to beat, so no new-best claim from imported history.
    expect(screen.getByTestId("pr-line")).toHaveTextContent("Next bench is");
    expect(screen.getByTestId("pr-line")).not.toHaveTextContent("new best");
  });

  it("hides the imported sessions with the switch", async () => {
    await db.userProfile.put(makeProfile());
    await db.importedSessions.bulkPut(benchHistory([135, 145], 10));
    render(<LiftPage />);
    await screen.findByTestId("e1rm-latest");

    fireEvent.click(screen.getByRole("switch", { name: "Show imported history" }));
    expect(screen.getByTestId("e1rm-latest")).toHaveTextContent("–");
    expect(e1rmChart()).toHaveAttribute("data-points", "0");
    expect(screen.queryByTestId("imported-best")).toBeNull();
    // The switch stays, so the history can be shown again.
    fireEvent.click(screen.getByRole("switch", { name: "Show imported history" }));
    expect(e1rmChart()).toHaveAttribute("data-imported", "2");
  });

  it("keeps the new-best line the app's own when imported history is heavier", async () => {
    await db.workouts.bulkPut(demo.workouts);
    await db.estimated1RMs.bulkPut(demo.estimated1RMs);
    await db.liftStates.bulkPut(demo.liftStates);
    await db.variantStates.bulkPut(demo.variantStates);
    await db.userProfile.put(makeProfile());
    const first = Math.min(...demo.workouts.map((w) => +new Date(w.startedAt)));
    // Older than a year, so the default range (3 months) shows the app's sessions only.
    const daysBefore = Math.max(Math.ceil((Date.now() - first) / DAY) + 30, 400);
    render(<LiftPage />);
    const withoutImport = (await screen.findByTestId("pr-line")).textContent;
    cleanup();

    await db.importedSessions.bulkPut(benchHistory([400, 405], daysBefore));
    render(<LiftPage />);
    expect(await screen.findByTestId("pr-line")).toHaveTextContent(withoutImport!);
    expect(screen.getByTestId("imported-best")).toHaveTextContent("Best before ReComp");
    const appPoints = demo.estimated1RMs.filter((r) => r.exerciseId === "bench").length;
    expect(e1rmChart()).toHaveAttribute("data-imported", "0");
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(e1rmChart()).toHaveAttribute("data-points", String(appPoints + 2));
    expect(e1rmChart()).toHaveAttribute("data-imported", "2");
  });
});
