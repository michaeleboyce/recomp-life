import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { updateSettings } from "@/lib/data/records";
import { getExercise } from "@/lib/exercises";
import { clearDb } from "@/lib/data/testUtils";
import ExercisesPage from "./page";

beforeEach(async () => {
  cleanup();
  await clearDb();
  await initializeDatabase();
});

const scopeBlock = () => screen.getByTestId("preference-scope");

describe("exercises page", () => {
  it("says where you train, separately from which preferences you edit, and marks that option", async () => {
    await updateSettings({ defaultLocation: "home" });
    render(<ExercisesPage />);
    await waitFor(() =>
      expect(within(scopeBlock()).getByText(/Training at/)).toBeInTheDocument()
    );
    await waitFor(() =>
      expect(scopeBlock().querySelector("[data-slot=location-chip]")).toHaveAttribute(
        "data-location",
        "home"
      )
    );
    expect(scopeBlock()).toHaveTextContent(
      "Preferences set for ‘All’ apply everywhere; Gym or Home ones apply only there."
    );
    const marked = scopeBlock().querySelectorAll("[data-current-location]");
    expect(marked).toHaveLength(1);
    // Third column: All, Gym, Home.
    expect(marked[0].parentElement!.children[2]).toBe(marked[0]);
    expect(marked[0]).toHaveTextContent("current");
    // The scope still starts on All.
    expect(within(scopeBlock()).queryByText(/apply to Home workouts only/)).toBeNull();
  });

  it("saves a row's preference through the data layer, stamped so it reaches other devices", async () => {
    const before = (await db.userProfile.toCollection().first())!;
    await db.userProfile.update(before.id, { synced: true });
    render(<ExercisesPage />);
    const name = await screen.findByText(getExercise("incline_db_press").name, {}, { timeout: 10000 });
    const row = name.closest(".rounded-2xl") as HTMLElement;

    fireEvent.click(within(row).getByRole("button", { name: "Preferred" }));

    await waitFor(async () =>
      expect(
        (await db.userProfile.toCollection().first())!.settings.exercisePreferences?.incline_db_press
      ).toBe("preferred")
    );
    const after = (await db.userProfile.toCollection().first())!;
    expect(after.updatedAt!).toBeGreaterThan(before.updatedAt!);
    expect(after.synced).toBe(false);
  });
});
