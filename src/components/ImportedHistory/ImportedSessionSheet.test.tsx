// Made-up imported sessions only: the repository is public.
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { makeImportedSession, makeImportedSet } from "@/lib/import/testRecords";
import { saveMappingOverrides } from "@/lib/import/remembered";
import { ImportedSessionSheet } from "./ImportedSessionSheet";

const start = new Date("2025-04-02T17:00:00");

const session = makeImportedSession(
  [
    makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 30, reps: 12, role: "warmup" }),
    makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 50, reps: 10, setOrder: 2, effort: "Hard" }),
    makeImportedSet({ exerciseName: "Made-up DB Press", mappedExerciseId: "db_bench", weightPerImplementLb: 40, reps: 8, setOrder: 3, role: "drop" }),
    makeImportedSet({ exerciseName: "Made-up Cable Row", mappedExerciseId: "lat_pulldown", weightPerImplementLb: 120, reps: 12 }),
    makeImportedSet({ exerciseName: "Zorbing Twist", mappedExerciseId: null, weightPerImplementLb: null, reps: 15 }),
  ],
  { startedAt: start, endedAt: new Date(start.getTime() + 45 * 60_000), sourceApp: "gravl", title: "Push Day" }
);

afterEach(() => {
  cleanup();
  saveMappingOverrides({});
});

describe("ImportedSessionSheet", () => {
  it("is read-only and says what an imported session counts toward", () => {
    render(<ImportedSessionSheet session={session} open onOpenChange={() => {}} />);
    const sheet = screen.getByRole("dialog", { name: "Push Day" });
    expect(sheet).toHaveTextContent("Imported");
    expect(sheet).toHaveTextContent("Gravl · 3 working sets · 45 min");
    expect(within(sheet).getByTestId("imported-counts")).toHaveTextContent(
      "Imported sessions count toward your strength estimates and muscle work. They never move the workout rotation or GZCLP progression."
    );
    expect(within(sheet).queryByRole("button", { name: /save/i })).toBeNull();
    expect(within(sheet).queryByRole("textbox")).toBeNull();
  });

  it("lists each exercise in file order with its sets, roles, effort and what it counts as", () => {
    render(<ImportedSessionSheet session={session} open onOpenChange={() => {}} />);
    const sections = screen.getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual(["Made-up DB Press", "Made-up Cable Row", "Zorbing Twist"]);

    const press = sections[0];
    expect(press).toHaveTextContent("Counts as DB Bench Press");
    const sets = within(press).getAllByTestId("imported-set");
    expect(sets).toHaveLength(3);
    expect(sets[0]).toHaveTextContent(/30 lb × 2.*12 reps.*Warm-up/);
    expect(sets[1]).toHaveTextContent(/50 lb × 2.*10 reps.*Hard, about 1-2 reps left/);
    expect(sets[2]).toHaveTextContent(/40 lb × 2.*8 reps.*Drop/);

    expect(sections[1]).toHaveTextContent("Counts as Lat Pulldown");
    expect(within(sections[1]).getByTestId("imported-set")).toHaveTextContent(/120 lb(?! ×).*12 reps/);
    expect(sections[2]).toHaveTextContent("Kept as its own name");
    expect(within(sections[2]).getByTestId("imported-set")).toHaveTextContent(/bodyweight.*15 reps/);
    // The effort words are explained where they are read.
    expect(screen.getByRole("button", { name: /Why\? .*effort word/i })).toBeInTheDocument();
  });

  it("reads a name as remapped since the import", () => {
    saveMappingOverrides({ "Made-up Cable Row": { kind: "exercise", exerciseId: "db_row" } });
    render(<ImportedSessionSheet session={session} open onOpenChange={() => {}} />);
    const row = screen.getByRole("region", { name: "Made-up Cable Row" });
    expect(row).toHaveTextContent("Counts as Dumbbell Row");
    expect(within(row).getByTestId("imported-set")).toHaveTextContent("120 lb × 2");
  });

  it("says so for a session with no names the library knows", () => {
    const unmapped = makeImportedSession(
      [
        makeImportedSet({ exerciseName: "Zorbing Curl", mappedExerciseId: null, muscles: ["biceps"], weightPerImplementLb: 20 }),
        makeImportedSet({ exerciseName: "Zorbing Twist", mappedExerciseId: null, weightPerImplementLb: null }),
      ],
      { startedAt: start, sourceApp: "fitbod" }
    );
    render(<ImportedSessionSheet session={unmapped} open onOpenChange={() => {}} />);
    const sheet = screen.getByRole("dialog", { name: "Zorbing Curl, Zorbing Twist" });
    expect(sheet).toHaveTextContent("Fitbod · 2 working sets");
    expect(screen.getByRole("region", { name: "Zorbing Curl" })).toHaveTextContent("Kept as its own name · Biceps");
    expect(screen.getByRole("region", { name: "Zorbing Twist" })).toHaveTextContent("Kept as its own name");
    expect(screen.queryByRole("button", { name: /Why\? .*effort word/i })).toBeNull();
  });
});
