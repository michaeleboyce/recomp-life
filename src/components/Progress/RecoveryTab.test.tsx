import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { dailyRowId, foldDaily, localDateKey } from "@/lib/health/daily";

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

beforeEach(async () => {
  cleanup();
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
    await db.userProfile.put(makeProfile());
    const days = foldDaily(
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
    );
    await db.healthDaily.bulkPut(
      days.map((d) => ({
        ...d,
        id: dailyRowId(d.day),
        clientId: dailyRowId(d.day),
        updatedAt: 1,
        deletedAt: null,
        synced: false,
      }))
    );
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
