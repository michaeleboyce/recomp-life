import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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

describe("Today page", () => {
  it("renders for an empty database: header, first workout, no attention section", async () => {
    render(<TodayPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Today" })).toBeInTheDocument();
    expect(await screen.findByText(/Workout A1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "START WORKOUT" })).toHaveAttribute("href", "/workout/configure");
    await screen.findByText("Log a weigh-in to see your trend");
    expect(screen.queryByRole("heading", { name: "Needs attention" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /settings/i })).not.toBeInTheDocument();
  });

  it("renders a seeded new user the same way", async () => {
    await initializeDatabase();
    render(<TodayPage />);
    expect(await screen.findByText(/Workout A1/)).toBeInTheDocument();
    expect(screen.queryByText(/PR chance/)).not.toBeInTheDocument();
  });

  it("with demo data shows the PR line, tiles and the muscle card", async () => {
    const demo = generateDemoData(new Date());
    await db.workouts.bulkPut(demo.workouts);
    await db.sets.bulkPut(demo.sets);
    await db.estimated1RMs.bulkPut(demo.estimated1RMs);
    await db.bodyweight.bulkPut(demo.bodyweight);
    await db.liftStates.bulkPut(demo.liftStates);
    await db.userProfile.put(makeProfile());
    render(<TodayPage />);
    expect(await screen.findByRole("link", { name: /PR chance on/ })).toBeInTheDocument();
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
