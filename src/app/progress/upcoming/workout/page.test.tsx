import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { initializeDatabase } from "@/db/init";
import { clearDb, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { NextWorkoutHero } from "@/components/Today/NextWorkoutHero";
import UpcomingWorkoutPage from "./page";

const nav = vi.hoisted(() => ({ params: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.params),
}));

beforeEach(async () => {
  nav.params = "";
  cleanup();
  window.history.replaceState(null, "", "/progress/upcoming/workout");
  await clearDb();
  await initializeDatabase();
  await seedFixtureStartingWeights();
});

async function open(params: string) {
  nav.params = params;
  window.history.replaceState(null, "", `/progress/upcoming/workout?${params}`);
  render(<UpcomingWorkoutPage />);
  return screen.findByRole("heading", { level: 1 });
}

const reasons = () => screen.getAllByTestId("lift-reason").map((r) => r.textContent);
const blocks = () => screen.getAllByTestId("set-block");

describe("one coming workout in full", () => {
  it("shows the next workout as Today plans it, with START", async () => {
    expect((await open("n=0&location=gym")).textContent).toBe("Squat day");
    expect(screen.getByText("Next · A1")).toBeInTheDocument();
    expect(screen.getByTestId("upcoming-length").textContent).toMatch(/^About \d+( of \d+)? min$/);
    expect(screen.getByRole("link", { name: "Start" })).toHaveAttribute("href", "/workout/configure?location=gym");
    expect(screen.queryByTestId("start-note")).toBeNull();
    expect(screen.queryByTestId("accessories-likely")).toBeNull();
    // The muscle figure.
    expect(document.querySelector('[aria-label^="Muscles worked by"]')).not.toBeNull();

    // The reasons are Today's, word for word.
    const mine = reasons();
    cleanup();
    render(<NextWorkoutHero />);
    await waitFor(() => expect(screen.getAllByTestId("lift-reason")).toHaveLength(3));
    expect(reasons()).toEqual(mine);
  });

  it("opens Today's why sheet for the next workout", async () => {
    await open("n=0&location=gym");
    fireEvent.click(screen.getByRole("button", { name: "Why this weight for Squat" }));
    expect(window.location.search).toContain("why=squat:T1");
  });

  it("explains the next workout at the other location with the live trace for that location", async () => {
    await open("n=0&location=home");
    // Today's why sheet reads the saved location (the gym), so this page explains it itself.
    expect(screen.queryByRole("button", { name: /^Why this weight for / })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /^How the weight for .+ was worked out$/ })[0]);
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(/why this weight/)).toBeInTheDocument();
    expect(within(sheet).queryByTestId("projection-note")).toBeNull();
  });

  it("lists every entry in order: warm-ups, each set, the accessories", async () => {
    await open("n=0&location=gym");
    const [squat, bench, pulldown] = blocks();
    expect(within(squat).getByText("Squat")).toBeInTheDocument();
    expect(within(squat).getByTestId("warm-up-sets").children.length).toBeGreaterThan(0);
    expect(within(squat).getByTestId("working-sets").textContent).toBe("190×3190×3190×3190×3190×3+");
    expect(within(bench).getByTestId("working-sets").textContent).toBe("100×10100×10100×10");
    expect(within(pulldown).getByTestId("working-sets").textContent).toBe("90×1590×1590×15+");
    // The next workout assumes nothing.
    expect(screen.queryByTestId("assumption")).toBeNull();
  });

  it("names the day a later lift depends on, and its why sheet is marked a projection", async () => {
    expect((await open("n=4&location=gym")).textContent).toBe("Squat day");
    expect(screen.getByText("5th up · A1")).toBeInTheDocument();
    const [squat] = blocks();
    expect(within(squat).getByTestId("working-sets").textContent).toMatch(/^200×3/);
    expect(within(squat).getByTestId("assumption")).toHaveTextContent(
      "Assumes you complete every set on Squat day (A1) before this."
    );
    // The reason line is the step from that day's weight.
    expect(reasons()[0]).toBe("▲ 10 from 190");
    // The due day: starting it is starting the next workout.
    expect(screen.getByRole("link", { name: "Start" })).toHaveAttribute("href", "/workout/configure?location=gym");
    expect(screen.getByTestId("start-note")).toHaveTextContent("This day is due now.");
    fireEvent.click(screen.getByRole("button", { name: "How the weight for Squat was worked out" }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByText(/how this was projected/)).toBeInTheDocument();
    expect(within(sheet).getByTestId("projection-note")).toHaveTextContent("A projection.");
    expect(within(sheet).getByText("If A1 · Squat day goes to plan")).toBeInTheDocument();
  });

  it("offers a later day for today without moving the rotation", async () => {
    expect((await open("n=2&location=home")).textContent).toBe("Bench day");
    expect(screen.getByRole("link", { name: "Do this one today" })).toHaveAttribute(
      "href",
      "/workout/configure?templateId=A2&location=home"
    );
    expect(screen.getByTestId("start-note")).toHaveTextContent("Squat day stays next.");
    expect(screen.getByTestId("start-note")).not.toHaveTextContent("where your lifts are now");
    // A lift no earlier day trains says so.
    expect(within(blocks()[0]).getByTestId("assumption")).toHaveTextContent("No day before this one changes it.");
    if (screen.queryAllByTestId("accessory-row").length > 0) {
      expect(screen.getByTestId("accessories-likely")).toHaveTextContent(
        "Chosen on the day from what you have trained by then."
      );
    }
  });

  it("says what would change it, with the other location one tap away", async () => {
    await open("n=1&location=gym");
    expect(screen.getByText(/A missed set before this/)).toBeInTheDocument();
    expect(screen.getByText(/A skipped day/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Home instead/ })).toHaveAttribute(
      "href",
      "/progress/upcoming/workout?n=1&location=home"
    );
    expect(document.querySelector('[data-evidence="gzclp-progression"]')).not.toBeNull();
  });

  it("goes back to the list at the same location, or to Today when opened from Today", async () => {
    await open("n=1&location=home");
    expect(screen.getByRole("link", { name: "Back to Coming up" })).toHaveAttribute(
      "href",
      "/progress/upcoming?location=home"
    );
    cleanup();
    await open("n=1&location=home&from=today");
    expect(screen.getByRole("link", { name: "Back to Today" })).toHaveAttribute("href", "/");
  });

  it("says so for a position that is not planned", async () => {
    nav.params = "n=99&location=gym";
    render(<UpcomingWorkoutPage />);
    expect(await screen.findByText("This workout is not in the plan.")).toBeInTheDocument();
  });
});
