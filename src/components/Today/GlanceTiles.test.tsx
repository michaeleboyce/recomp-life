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
import { getMonday } from "@/lib/dates";
import { rangeSuffix } from "@/components/Progress/rangeText";
import { GlanceTiles, STALE_WEIGH_IN_DAYS } from "./GlanceTiles";

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
    // The demo lifter is cutting and losing: the rate reads as a loss.
    const rate = within(weight).getByText(/lb\/wk/);
    expect(rate.textContent).toMatch(/^−\d+\.\d lb\/wk$/);
    expect(rate).toHaveAttribute("aria-label", expect.stringMatching(/^down /));
    // Coloured by the Body tab's pace zones, not "any loss is good".
    const pace = rate.getAttribute("data-pace");
    expect(["on pace", "slow", "fast", "gaining"]).toContain(pace);
    expect(rate).toHaveClass(pace === "on pace" ? "text-success" : "text-warning");

    const week = screen.getByRole("link", { name: /This week/ });
    expect(week).toHaveAttribute("href", "/log");
    const monday = getMonday(new Date()).getTime();
    const thisWeek = demo.workouts.filter(
      (w) => w.completedAt && new Date(w.startedAt).getTime() >= monday
    ).length;
    expect(within(week).getByText(`${thisWeek} / 5`)).toBeInTheDocument();

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
      // "in N wk" is the real span of the points shown, not a nominal "3 mo".
      const shown = demo.estimated1RMs
        .filter((r) => r.exerciseId === id && Date.now() - new Date(r.date).getTime() <= 91 * 86_400_000)
        .map((r) => ({ t: new Date(r.date).getTime(), v: r.estimated1RM }))
        .sort((a, b) => a.t - b.t);
      expect(tile).toHaveTextContent(rangeSuffix(shown));
      expect(tile).not.toHaveTextContent("3 mo");
    }
  });

  it("hides the rate when the latest weigh-in is over two weeks old", async () => {
    await seedDemo();
    const old = demo.bodyweight.map((b) => ({
      ...b,
      date: new Date(new Date(b.date).getTime() - (STALE_WEIGH_IN_DAYS + 3) * 86_400_000),
    }));
    await db.bodyweight.clear();
    await db.bodyweight.bulkPut(old);
    render(<GlanceTiles />);
    const weight = await screen.findByRole("link", { name: /Weight/ });
    await waitFor(() => expect(within(weight).getByText(/\d+\.\d/)).toBeInTheDocument());
    expect(within(weight).queryByText(/lb\/wk/)).toBeNull();
  });

  it("shows dashes and hints instead of zeros for a new user", async () => {
    await initializeDatabase();
    render(<GlanceTiles />);
    expect(await screen.findByText("Log a weigh-in to see your trend")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/Finish a workout/)).toHaveLength(2));
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });
});
