import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { db } from "@/db/local";
import { getMonday } from "@/lib/dates";
import { clearDb } from "@/lib/data/testUtils";
import { makeImportedSession, makeImportedSet } from "@/lib/import/testRecords";
import MuscleHeatCard from "./MuscleHeatCard";

vi.mock("@/components/Anatomy/MuscleMap", () => ({ MuscleMap: () => null }));
vi.mock("@/components/Anatomy/MuscleLegend", () => ({ MuscleLegend: () => null }));

beforeEach(clearDb);

describe("MuscleHeatCard", () => {
  it("asks for a workout when nothing was trained this week", async () => {
    render(<MuscleHeatCard />);
    expect(await screen.findByText(/Log a workout to see/)).toBeInTheDocument();
  });

  it("counts this week's imported sessions, as the Muscles tab does (made-up sessions)", async () => {
    const monday = getMonday(new Date());
    const startedAt = new Date(Math.min(Date.now() - 60_000, monday.getTime() + 12 * 3_600_000));
    await db.importedSessions.bulkPut([
      makeImportedSession(
        [
          makeImportedSet({ exerciseName: "Bench Press", mappedExerciseId: "bench" }),
          makeImportedSet({ exerciseName: "Bench Press", mappedExerciseId: "bench" }),
          makeImportedSet({ exerciseName: "Bench Press", mappedExerciseId: "bench" }),
        ],
        { startedAt }
      ),
      // Last week and an undone import count for nothing.
      makeImportedSession([makeImportedSet()], { startedAt: new Date(monday.getTime() - 3 * 86_400_000) }),
      makeImportedSession([makeImportedSet()], { startedAt, deletedAt: 5 }),
    ]);
    render(<MuscleHeatCard />);
    expect(await screen.findByText("3 sets")).toBeInTheDocument();
    expect(screen.getByText("Chest")).toBeInTheDocument();
    expect(screen.queryByText("Quads")).toBeNull();
  });
});
