import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb } from "@/lib/data/testUtils";
import UpcomingWorkoutsPage from "./page";

const nav = vi.hoisted(() => ({ params: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.params),
}));

beforeEach(async () => {
  nav.params = "";
  cleanup();
  await clearDb();
  await initializeDatabase();
});

const cards = () => screen.getAllByTestId("upcoming-workout");
const rowsOf = (card: HTMLElement) =>
  within(card).getAllByTestId("upcoming-exercise").map((r) => r.textContent?.replace(/\s+/g, " "));

describe("upcoming workouts page", () => {
  it("shows the next five workouts in rotation from the seeded data", async () => {
    render(<UpcomingWorkoutsPage />);
    await waitFor(() => expect(cards()).toHaveLength(5));
    expect(cards().map((c) => within(c).getByRole("heading").textContent)).toEqual([
      "A1 · Squat day",
      "B1 · OHP day",
      "A2 · Bench day",
      "B2 · Deadlift day",
      "A1 · Squat day",
    ]);
    expect(within(cards()[0]).getByText("Next")).toBeInTheDocument();
    expect(within(cards()[1]).getByText("Then")).toBeInTheDocument();
    expect(within(cards()[2]).getByText("After that")).toBeInTheDocument();
    expect(within(cards()[0]).getByRole("link", { name: "START" })).toHaveAttribute(
      "href",
      "/workout/configure"
    );
    expect(within(cards()[1]).queryByRole("link", { name: "START" })).toBeNull();
    expect(rowsOf(cards()[0])).toEqual([
      "T1Barbell Squat190 lbs5×3+",
      "T2Barbell Bench Press100 lbs3×10",
      "T3Lat Pulldown90 lbs3×15+",
    ]);
    // The second A1 assumes the first was completed: squat goes up.
    expect(rowsOf(cards()[4])[0]).toBe("T1Barbell Squat200 lbs5×3+");
    expect(screen.getByText(/assume you complete every set/)).toBeInTheDocument();
    expect(document.querySelector('[data-evidence="gzclp-progression"]')).not.toBeNull();
    expect(document.querySelector('[data-evidence="t3-progression"]')).toBeNull();
    expect(screen.getByRole("button", { name: "What does AMRAP mean?" })).toBeInTheDocument();
  });

  it("switches to home substitutes", async () => {
    render(<UpcomingWorkoutsPage />);
    await waitFor(() => expect(cards()).toHaveLength(5));
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    await waitFor(() => expect(rowsOf(cards()[0])[1]).toMatch(/in place of Barbell Bench Press/));
    expect(document.querySelector("[data-slot=location-chip]")).toHaveAttribute("data-location", "home");
    // Previewing does not change the saved default.
    const profile = await db.userProfile.toCollection().first();
    expect(profile?.settings.defaultLocation ?? "gym").toBe("gym");
  });

  it("says when the location shown is only a preview", async () => {
    render(<UpcomingWorkoutsPage />);
    await waitFor(() => expect(cards()).toHaveLength(5));
    expect(screen.queryByTestId("location-preview")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(screen.getByTestId("location-preview")).toHaveTextContent(
      "Previewing Home. Your default is Gym."
    );
    fireEvent.click(screen.getByRole("button", { name: "Gym" }));
    expect(screen.queryByTestId("location-preview")).toBeNull();
  });

  it("goes back to More by default and to Today when opened from Today", async () => {
    const { unmount } = render(<UpcomingWorkoutsPage />);
    expect(await screen.findByRole("link", { name: "Back" })).toHaveAttribute("href", "/more");
    unmount();
    nav.params = "from=today";
    render(<UpcomingWorkoutsPage />);
    expect(await screen.findByRole("link", { name: "Back" })).toHaveAttribute("href", "/");
  });

  it("opens on the saved default location", async () => {
    const profile = await db.userProfile.toCollection().first();
    await db.userProfile.update(profile!.id, {
      settings: { ...profile!.settings, defaultLocation: "home" },
    });
    render(<UpcomingWorkoutsPage />);
    await waitFor(() =>
      expect(document.querySelector("[data-slot=location-chip]")).toHaveAttribute("data-location", "home")
    );
  });

  it("still shows the first workout with an empty database", async () => {
    await clearDb();
    render(<UpcomingWorkoutsPage />);
    await waitFor(() => expect(cards()).toHaveLength(5));
    expect(within(cards()[0]).getByRole("heading").textContent).toBe("A1 · Squat day");
  });
});
