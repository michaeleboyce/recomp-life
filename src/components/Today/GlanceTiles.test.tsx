import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { describeNextWorkout } from "@/lib/workout/buildPlan";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { GlanceTiles } from "./GlanceTiles";

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

const demo = generateDemoData(new Date());

async function seedDemo() {
  await db.workouts.bulkPut(demo.workouts);
  await db.sets.bulkPut(demo.sets);
  await db.estimated1RMs.bulkPut(demo.estimated1RMs);
  await db.bodyweight.bulkPut(demo.bodyweight);
  await db.liftStates.bulkPut(demo.liftStates);
  await db.userProfile.put(makeProfile());
}

function nextLifts() {
  const next = describeNextWorkout({
    completedWorkouts: demo.workouts,
    templates: WORKOUT_TEMPLATES,
    liftStates: demo.liftStates,
    plan: {
      location: "gym",
      equipment: DEFAULT_USER_PROFILE.settings.equipment,
      includeWarmUps: false,
      selectedAccessories: [],
    },
  });
  return next.template.exercises.filter((e) => e.tier === "T1" || e.tier === "T2").map((e) => e.exerciseId);
}

beforeEach(clearDb);

describe("GlanceTiles", () => {
  it("shows weight, this week and the next two lifts, each linking to its detail", async () => {
    await seedDemo();
    render(<GlanceTiles />);
    const weight = await screen.findByRole("link", { name: /Weight/ });
    expect(weight).toHaveAttribute("href", "/progress?tab=body");
    const latest = [...demo.bodyweight].sort((a, b) => +new Date(a.date) - +new Date(b.date)).at(-1)!;
    expect(within(weight).getByText(latest.weight.toFixed(1))).toBeInTheDocument();
    expect(within(weight).getByText(/lb\/wk/)).toBeInTheDocument();

    const week = screen.getByRole("link", { name: /This week/ });
    expect(week).toHaveAttribute("href", "/log");
    expect(within(week).getByText(/\/ 5/)).toBeInTheDocument();

    for (const id of nextLifts()) {
      const tile = await waitFor(() => {
        const found = screen
          .getAllByRole("link")
          .find((a) => a.getAttribute("href") === `/progress/lift/${id}`);
        expect(found, id).toBeDefined();
        return found;
      });
      const best = demo.estimated1RMs
        .filter((r) => r.exerciseId === id)
        .sort((a, b) => +new Date(a.date) - +new Date(b.date))
        .at(-1)!;
      expect(within(tile!).getByText(String(Math.round(best.estimated1RM)))).toBeInTheDocument();
    }
  });

  it("shows dashes and hints instead of zeros for a new user", async () => {
    await initializeDatabase();
    render(<GlanceTiles />);
    expect(await screen.findByText("Log a weigh-in to see your trend")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/Finish a workout/)).toHaveLength(2));
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });
});
