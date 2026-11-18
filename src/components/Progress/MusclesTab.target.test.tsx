import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb } from "@/lib/data/testUtils";
import { makeImportedSession, makeImportedSet } from "@/lib/import/testRecords";
import { MusclesTab } from "./MusclesTab";

vi.mock("@/components/Anatomy/Anatomy3D", () => ({ Anatomy3D: () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// A target other than the old hard-coded 10, so the bar can only be right if it reads the constant.
vi.mock("@/lib/accessories/select", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/accessories/select")>()),
  WEEKLY_SET_TARGET: 6,
}));

const HOUR = 60 * 60 * 1000;

beforeEach(async () => {
  await clearDb();
  await initializeDatabase();
});
afterEach(cleanup);

const row = (name: string) => screen.getAllByRole("button").find((b) => b.textContent?.startsWith(name))!;

describe("MusclesTab weekly target", () => {
  it("fills a muscle's bar against WEEKLY_SET_TARGET", async () => {
    // Made up: three working sets of bench press an hour ago.
    await db.importedSessions.put(
      makeImportedSession(
        [1, 2, 3].map(() => makeImportedSet({ mappedExerciseId: "bench", exerciseName: "Made-up Bench" })),
        { startedAt: new Date(Date.now() - HOUR) }
      )
    );
    render(<MusclesTab />);
    await waitFor(() => expect(row("Chest")).toHaveTextContent("3 sets"));
    const bar = row("Chest").querySelector("span.block") as HTMLElement;
    expect(bar.style.width).toBe("50%");
  });
});
