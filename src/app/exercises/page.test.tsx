import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { initializeDatabase } from "@/db/init";
import { updateSettings } from "@/lib/data/records";
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
});
