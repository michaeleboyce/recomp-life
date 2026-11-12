import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import type { ActivityLog } from "@/types";

vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      isValidElement(children)
        ? cloneElement(children as ReactElement<{ width: number; height: number }>, { width: 350, height: 170 })
        : null,
  };
});
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/progress" }));

import { RunsTab } from "./RunsTab";

const NOW = new Date();
const demo = generateDemoData(NOW);
const DAY = 86_400_000;

const activity = (id: string, kind: ActivityLog["kind"], daysAgo: number, minutes: number): ActivityLog => ({
  id,
  clientId: id,
  date: new Date(NOW.getTime() - daysAgo * DAY),
  kind,
  durationMinutes: minutes,
  style: null,
  distanceMiles: null,
  notes: "",
  perceivedEffort: 2,
  synced: false,
});

async function seedRuns() {
  await db.runs.bulkPut(demo.runs);
  await db.userProfile.put(makeProfile());
}

async function seedReadiness(sleepHours: "<5" | "7+" | "mixed") {
  await db.workouts.bulkPut(demo.workouts);
  await db.sets.bulkPut(demo.sets);
  const logs = demo.readinessLogs.map((l, i) => ({
    ...l,
    sleepHours: sleepHours === "mixed" ? (i % 2 ? ("<5" as const) : ("7+" as const)) : (sleepHours as "<5" | "7+"),
  }));
  await db.readinessLogs.bulkPut(logs);
}

beforeEach(async () => {
  cleanup();
  await clearDb();
});

describe("RunsTab", () => {
  it("shows distance, run count and the tiles from demo runs", async () => {
    await seedRuns();
    render(<RunsTab />);
    const total = demo.runs
      .filter((r) => r.date.getTime() >= NOW.getTime() - 91 * DAY)
      .reduce((s, r) => s + (r.distanceMiles ?? 0), 0);
    await screen.findByText("Distance run");
    expect(screen.getByText(total.toFixed(1))).toBeInTheDocument();
    expect(screen.getByText(/in \d+ runs?/)).toBeInTheDocument();
    expect(screen.getByText("Average pace")).toBeInTheDocument();
    expect(screen.getByText("Average effort")).toBeInTheDocument();
    expect(screen.getByText("Total time")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Run distance per week/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Log a run or activity/ })).toHaveAttribute("href", "/run");
  });

  it("lists other activity per kind, and hides the section when there is none", async () => {
    await seedRuns();
    await db.activities.bulkPut([
      activity("a", "yoga", 3, 30),
      activity("b", "yoga", 10, 45),
      activity("c", "cycling", 5, 60),
    ]);
    const first = render(<RunsTab />);
    expect(await screen.findByRole("region", { name: "Other activity" })).toBeInTheDocument();
    expect(screen.getByText("Yoga")).toBeInTheDocument();
    expect(screen.getByText("2 sessions")).toBeInTheDocument();
    expect(screen.getByText("1 h 15 min")).toBeInTheDocument();
    first.unmount();

    await db.activities.clear();
    render(<RunsTab />);
    await screen.findByText("Distance run");
    expect(screen.queryByRole("region", { name: "Other activity" })).toBeNull();
  });

  it("shows the sleep sentence only with at least three days of each kind", async () => {
    await seedRuns();
    await seedReadiness("mixed");
    const first = render(<RunsTab />);
    expect(await screen.findByRole("region", { name: "Sleep and energy before workouts" })).toBeInTheDocument();
    expect(screen.getByText("Stress / energy")).toBeInTheDocument();
    expect(await screen.findByText(/slept under 7 hours/)).toBeInTheDocument();
    first.unmount();

    await db.readinessLogs.clear();
    await seedReadiness("7+");
    render(<RunsTab />);
    await screen.findByRole("region", { name: "Sleep and energy before workouts" });
    expect(screen.queryByText(/slept under 7 hours/)).toBeNull();
  });

  it("shows an empty state with the log action when nothing is logged", async () => {
    await db.userProfile.put(makeProfile());
    render(<RunsTab />);
    await waitFor(() => expect(screen.getByText("No runs or activities yet")).toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Log a run or activity" })).toHaveAttribute("href", "/run");
  });
});
