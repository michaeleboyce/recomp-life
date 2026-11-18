import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb } from "@/lib/data/testUtils";
import { makeImportedSession, makeImportedSet } from "@/lib/import/testRecords";
import { MusclesTab } from "./MusclesTab";

vi.mock("@/components/Anatomy/Anatomy3D", () => ({ Anatomy3D: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const HOUR = 60 * 60 * 1000;

beforeEach(async () => {
  await clearDb();
  await initializeDatabase();
});
afterEach(cleanup);

/** The row for one muscle in the list under the figure. */
const row = (name: string) =>
  screen.getAllByRole("button").find((b) => b.textContent?.startsWith(name))!;

describe("MusclesTab with imported history", () => {
  it("counts a made-up imported session in this week's volume and in recovery", async () => {
    // Made up: three working sets and a warm-up of bench press an hour ago, from another app.
    await db.importedSessions.put(
      makeImportedSession(
        [
          makeImportedSet({ mappedExerciseId: "bench", exerciseName: "Made-up Bench", role: "warmup" }),
          ...[1, 2, 3].map(() => makeImportedSet({ mappedExerciseId: "bench", exerciseName: "Made-up Bench" })),
        ],
        { startedAt: new Date(Date.now() - HOUR) }
      )
    );
    render(<MusclesTab />);

    await waitFor(() => expect(row("Chest")).toHaveTextContent("3 sets"));
    expect(row("Triceps")).toHaveTextContent("1.5 sets");
    expect(row("Quads")).toHaveTextContent("0 sets");

    fireEvent.click(screen.getByRole("button", { name: "Recovery" }));
    expect(row("Chest")).toHaveTextContent("Recovering");
    expect(row("Quads")).toHaveTextContent("Long break");
  });

  it("leaves a deleted import out", async () => {
    await db.importedSessions.put(
      makeImportedSession([makeImportedSet({ mappedExerciseId: "bench", exerciseName: "Made-up Bench" })], {
        startedAt: new Date(Date.now() - HOUR),
        deletedAt: Date.now(),
      })
    );
    render(<MusclesTab />);
    await waitFor(() => expect(row("Chest")).toHaveTextContent("0 sets"));
  });
});
