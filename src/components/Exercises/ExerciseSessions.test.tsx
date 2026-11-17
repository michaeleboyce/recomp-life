// Made-up workouts and imported sessions only: the repository is public.
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeSet, makeWorkout } from "@/lib/data/testUtils";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import { saveMappingOverrides } from "@/lib/import/remembered";
import { ExerciseSessions } from "./ExerciseSessions";

const pushDay = () =>
  importedSession(
    [
      importedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 30, reps: 12, role: "warmup" }),
      importedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 50, reps: 10, setOrder: 2 }),
      importedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 40, reps: 8, setOrder: 3, role: "drop" }),
      importedSet({ exerciseName: "Made-up Bench", mappedExerciseId: "bench", weightPerImplementLb: 135, reps: 5 }),
      importedSet({ exerciseName: "Made-up Pulldown", mappedExerciseId: null, weightPerImplementLb: 100, reps: 12 }),
    ],
    { id: "imp-push", sourceApp: "gravl", title: "Push Day", startedAt: new Date("2026-11-08T17:00:00") }
  );

beforeEach(async () => {
  await clearDb();
});
afterEach(() => {
  cleanup();
  saveMappingOverrides({});
});

describe("ExerciseSessions", () => {
  it("lists the exercise's own imported sets, weight per hand, labelled, with a control to hide them", async () => {
    await db.importedSessions.add(pushDay());
    render(<ExerciseSessions exerciseId="db_bench" />);
    const list = await screen.findByRole("region", { name: "Sessions" });
    const row = await within(list).findByTestId("session-row");
    expect(row).toHaveTextContent("50/hand ×10, 8");
    expect(within(row).getByTestId("session-imported")).toHaveTextContent(/^ImportedGravl$/);
    fireEvent.click(within(list).getByRole("button", { name: "Hide imported" }));
    expect(within(list).queryByTestId("session-row")).toBeNull();
  });

  it("for a barbell lift, the exercise itself only, beside its logged sessions", async () => {
    await db.importedSessions.add(pushDay());
    await db.workouts.add(
      makeWorkout({
        id: "w1",
        startedAt: new Date("2026-11-10T09:00:00"),
        completedAt: new Date("2026-11-10T10:00:00"),
        sets: [makeSet({ id: "s1", exerciseId: "bench", tier: "T1", weight: 145, actualReps: 5 })],
      })
    );
    render(<ExerciseSessions exerciseId="bench" />);
    const list = await screen.findByRole("region", { name: "Sessions" });
    await within(list).findByText("Imported");
    const rows = within(list).getAllByTestId("session-row");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("145 ×5");
    expect(rows[1]).toHaveTextContent("135 ×5");
  });

  it("follows a name remapped since the import", async () => {
    saveMappingOverrides({ "Made-up Pulldown": { kind: "exercise", exerciseId: "lat_pulldown" } });
    await db.importedSessions.add(pushDay());
    render(<ExerciseSessions exerciseId="lat_pulldown" />);
    const list = await screen.findByRole("region", { name: "Sessions" });
    expect(await within(list).findByTestId("session-row")).toHaveTextContent("100 ×12");
  });

  it("shows nothing for an exercise with no history", async () => {
    await db.importedSessions.add(pushDay());
    const { container } = render(<ExerciseSessions exerciseId="db_row" />);
    // Give the live queries a moment to settle.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(container).toBeEmptyDOMElement();
  });
});
