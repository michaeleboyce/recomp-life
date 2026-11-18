// Imported history in an exercise page's session list (I10, carried over from the
// exercise reference page). Made-up workouts and imported sessions only: the
// repository is public.
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile, makeSet, makeWorkout } from "@/lib/data/testUtils";
import { makeImportedSession, makeImportedSet } from "@/lib/import/testRecords";
import { saveMappingOverrides } from "@/lib/import/remembered";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/chart-kit/LazyTrendChart", () => ({
  LazyTrendChart: () => null,
  TrendChartSkeleton: () => null,
}));
vi.mock("@/components/ExerciseDemo/ExerciseViewer", () => ({ ExerciseViewer: () => null }));

import { ExercisePage } from "./ExercisePage";

const pushDay = () =>
  makeImportedSession(
    [
      makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 30, reps: 12, role: "warmup" }),
      makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 50, reps: 10, setOrder: 2 }),
      makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 40, reps: 8, setOrder: 3, role: "drop" }),
      makeImportedSet({ exerciseName: "Made-up Bench", mappedExerciseId: "bench", weightPerImplementLb: 135, reps: 5 }),
      makeImportedSet({ exerciseName: "Made-up Pulldown", mappedExerciseId: null, weightPerImplementLb: 100, reps: 12 }),
    ],
    { id: "imp-push", sourceApp: "gravl", title: "Push Day", startedAt: new Date("2026-11-08T17:00:00") }
  );

/** The page's own session list ("<name> sessions"). */
const sessions = () => screen.findByRole("region", { name: / sessions$/ });

beforeEach(async () => {
  await clearDb();
  await db.userProfile.put(makeProfile());
  await db.importedSessions.add(pushDay());
});
afterEach(() => {
  cleanup();
  saveMappingOverrides({});
});

describe("imported history on an exercise page", () => {
  it("lists the exercise's own imported sets, weight per hand, labelled, with a control to hide them", async () => {
    render(<ExercisePage exerciseId="db_bench" backHref="/" />);
    const list = await sessions();
    const row = await within(list).findByTestId("session-row");
    expect(row).toHaveTextContent("50/hand ×10, 8");
    expect(within(row).getByTestId("session-imported")).toHaveTextContent(/^ImportedGravl$/);
    fireEvent.click(within(list).getByRole("button", { name: "Hide imported" }));
    expect(within(list).queryByTestId("session-row")).toBeNull();
  });

  it("for a barbell lift, its own imported sessions beside its logged ones, not its home versions'", async () => {
    await db.workouts.add(
      makeWorkout({
        id: "w1",
        startedAt: new Date("2026-11-10T09:00:00"),
        completedAt: new Date("2026-11-10T10:00:00"),
        sets: [makeSet({ id: "s1", exerciseId: "bench", tier: "T1", weight: 145, actualReps: 5 })],
      })
    );
    render(<ExercisePage exerciseId="bench" backHref="/" />);
    const list = await sessions();
    await within(list).findByText("Imported");
    const rows = within(list).getAllByTestId("session-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("145 ×5");
    expect(rows[1]).toHaveTextContent("135 ×5");
  });

  it("follows a name remapped since the import", async () => {
    saveMappingOverrides({ "Made-up Pulldown": { kind: "exercise", exerciseId: "lat_pulldown" } });
    render(<ExercisePage exerciseId="lat_pulldown" backHref="/" />);
    const list = await sessions();
    expect(await within(list).findByTestId("session-row")).toHaveTextContent("100 ×12");
  });
});
