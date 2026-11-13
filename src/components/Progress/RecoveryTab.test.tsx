import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { foldDaily, localDateKey } from "@/lib/health/daily";
import type { MetricSource } from "@/lib/metrics/types";

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

// Apple Health rows are not stored yet, so tests that need them hand the tab a
// source directly; every other test reads the real hooks and database.
let healthSource: MetricSource | null = null;
vi.mock("@/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks")>();
  return { ...actual, useMetricSource: () => healthSource ?? actual.useMetricSource() };
});

import { RecoveryTab } from "./RecoveryTab";

const NOW = new Date();
const DAY = 86_400_000;
const demo = generateDemoData(NOW);
const daysAgo = (n: number) => localDateKey(new Date(NOW.getTime() - n * DAY));

async function seedReadiness(sleepHours: "7+" | "mixed") {
  await db.userProfile.put(makeProfile());
  await db.workouts.bulkPut(demo.workouts);
  await db.readinessLogs.bulkPut(
    demo.readinessLogs.map((l, i) => ({
      ...l,
      sleepHours: sleepHours === "mixed" && i % 2 ? ("<5" as const) : ("7+" as const),
    }))
  );
}

const emptySource: MetricSource = {
  workouts: [],
  e1rms: [],
  bodyweight: [],
  runs: [],
  readiness: [],
  pain: [],
  liftStates: [],
  settings: null,
};

beforeEach(async () => {
  cleanup();
  healthSource = null;
  await clearDb();
});

describe("RecoveryTab", () => {
  it("explains itself when there is nothing to show", async () => {
    await db.userProfile.put(makeProfile());
    render(<RecoveryTab />);
    await waitFor(() => expect(screen.getByText("No recovery data yet")).toBeInTheDocument());
    expect(screen.getByText(/connecting Apple Health/)).toBeInTheDocument();
  });

  it("shows sleep and energy before workouts, with the comparison when there is enough of each", async () => {
    await seedReadiness("mixed");
    const first = render(<RecoveryTab />);
    expect(
      await screen.findByRole("region", { name: "Sleep and energy before workouts" })
    ).toBeInTheDocument();
    expect(screen.getByText("Stress / energy")).toBeInTheDocument();
    expect(await screen.findByText(/slept under 7 hours/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "From Apple Health" })).toBeNull();
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    first.unmount();

    await db.readinessLogs.clear();
    await seedReadiness("7+");
    render(<RecoveryTab />);
    await screen.findByRole("region", { name: "Sleep and energy before workouts" });
    expect(screen.queryByText(/slept under 7 hours/)).toBeNull();
  });

  it("shows the Apple Health trends that have data, with the latest value", async () => {
    healthSource = {
      ...emptySource,
      healthDaily: foldDaily(
        [
          { quantity: "restingHr", day: daysAgo(2), value: 54 },
          { quantity: "restingHr", day: daysAgo(1), value: 51 },
        ],
        [
          {
            day: daysAgo(1),
            asleepMinutes: 432,
            deepMinutes: null,
            remMinutes: null,
            start: new Date(NOW.getTime() - DAY - 8 * 3_600_000),
            end: new Date(NOW.getTime() - DAY),
          },
        ]
      ),
    };
    render(<RecoveryTab />);
    const health = await screen.findByRole("region", { name: "From Apple Health" });
    expect(within(health).getByText("Sleep")).toBeInTheDocument();
    expect(within(health).getByText("7h 12m")).toBeInTheDocument();
    expect(within(health).getByText("Resting heart rate")).toBeInTheDocument();
    expect(within(health).getByText("51")).toBeInTheDocument();
    // No HRV values were imported, so there is no empty HRV chart.
    expect(within(health).queryByText("Heart rate variability")).toBeNull();
    expect(within(health).getByText(/does not change weights or\s+suggestions/)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Sleep and energy before workouts" })).toBeNull();
  });
});
