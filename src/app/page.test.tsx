import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// A switch that makes the forecast models throw, to show Today still renders.
const broken = vi.hoisted(() => ({ models: false }));
vi.mock("@/lib/forecast", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/forecast")>();
  return {
    ...actual,
    makeSessionForecasts: (...args: Parameters<typeof actual.makeSessionForecasts>) => {
      if (broken.models) throw new Error("model bug");
      return actual.makeSessionForecasts(...args);
    },
  };
});

import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, makeProfile, makeWorkout } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import TodayPage from "./page";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const HOUR = 60 * 60 * 1000;

beforeEach(clearDb);
afterEach(() => {
  broken.models = false;
  vi.restoreAllMocks();
});

describe("Today page", () => {
  it("keeps its Start button when the forecast cannot be worked out", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    broken.models = true;
    await initializeDatabase();
    render(<TodayPage />);
    expect(await screen.findByText("Next up · A1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start workout" })).toHaveAttribute(
      "href",
      "/workout/configure"
    );
    await waitFor(() =>
      expect(error).toHaveBeenCalledWith(expect.stringMatching(/forecast/i), expect.any(Error))
    );
    // No tile is shown for a forecast that could not be made.
    expect(screen.queryByTestId("forecast-tiles")).toBeNull();
    expect(screen.getByRole("link", { name: "Start workout" })).toBeInTheDocument();
  });

  it("renders for an empty database: header, first workout, no attention section", async () => {
    render(<TodayPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
    expect(await screen.findByText("Next up · A1")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start workout" })).toHaveAttribute("href", "/workout/configure");
    await screen.findByText("Log a weigh-in to see your trend");
    expect(screen.queryByRole("heading", { name: "Needs attention" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
  });

  it("renders a seeded new user the same way", async () => {
    await initializeDatabase();
    render(<TodayPage />);
    expect(await screen.findByText("Next up · A1")).toBeInTheDocument();
    // Wait until the estimates have loaded (the lift tiles say there are none), so
    // the new-best tile's absence means "no best to beat", not "still loading".
    await waitFor(() => expect(screen.getAllByText(/Finish a workout to estimate it/)).toHaveLength(2));
    await screen.findByTestId("forecast-session");
    expect(screen.queryByTestId("forecast-new-best")).toBeNull();
  });

  it("with demo data shows the new-best tile, glance tiles and the muscle card", async () => {
    const demo = generateDemoData(new Date());
    await db.workouts.bulkPut(demo.workouts);
    await db.estimated1RMs.bulkPut(demo.estimated1RMs);
    await db.bodyweight.bulkPut(demo.bodyweight);
    await db.liftStates.bulkPut(demo.liftStates);
    await db.userProfile.put(makeProfile());
    render(<TodayPage />);
    expect(await screen.findByTestId("forecast-new-best")).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /Weight/ })).toHaveAttribute("href", "/progress?tab=body");
    expect(screen.getByRole("link", { name: "Open the muscle explorer" })).toHaveAttribute("href", "/muscles");
  });

  it("puts an unfinished workout in Needs attention with a Resume link", async () => {
    await initializeDatabase();
    await db.workouts.add(makeWorkout({ id: "w1", startedAt: new Date(Date.now() - HOUR) }));
    render(<TodayPage />);
    expect(await screen.findByRole("heading", { name: "Needs attention" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("link", { name: "Resume" })).toHaveAttribute("href", "/workout/active?sessionId=w1")
    );
  });
});
