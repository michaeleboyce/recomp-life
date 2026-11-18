import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { describeNextWorkout } from "@/lib/workout/buildPlan";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { getMonday } from "@/lib/dates";
import { useLiftTimeline } from "@/hooks";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import { STALE_WEIGH_IN_DAYS } from "@/lib/weighIn";
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

/** What the lift page headline shows as the big number (LiftHeadline reads useLiftTimeline). */
function Headline({ liftId }: { liftId: string }) {
  const timeline = useLiftTimeline(liftId, true);
  return <span data-testid={`headline-${liftId}`}>{timeline?.anchor?.value ?? ""}</span>;
}

describe("GlanceTiles", () => {
  it("shows weight, this week and the next two lifts, each linking to its detail", async () => {
    await seedDemo();
    render(
      <>
        <GlanceTiles />
        {nextLifts().map((id) => (
          <Headline key={id} liftId={id} />
        ))}
      </>
    );
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
    expect(within(week).getByText(`${thisWeek} / 4`)).toBeInTheDocument();

    for (const id of nextLifts()) {
      const tile = await waitFor(() => {
        const found = screen
          .getAllByRole("link")
          .find((a) => a.getAttribute("href") === `/progress/lift/${id}`);
        expect(found, id).toBeDefined();
        return found;
      });
      // The lift page headline's number: the planner's pooled estimate from the same timeline.
      const probe = await screen.findByTestId(`headline-${id}`);
      await waitFor(() => expect(probe.textContent).not.toBe(""));
      const anchor = Number(probe.textContent);
      expect(within(tile!).getByText(String(Math.round(anchor)))).toBeInTheDocument();
      // "in N wk" is the real span of the line shown, not a nominal "3 mo".
      expect(tile).toHaveTextContent(/in \d+ wk/);
      expect(tile).not.toHaveTextContent("3 mo");
    }
  });

  it("keeps the estimated-max term out of the lift tile's link, so its sheet never opens the lift page", async () => {
    await seedDemo();
    render(<GlanceTiles />);
    const [id] = nextLifts();
    const tile = await waitFor(() => {
      const found = screen.getAllByRole("link").find((a) => a.getAttribute("href") === `/progress/lift/${id}`);
      expect(found).toBeDefined();
      return found!;
    });
    expect(within(tile).queryByRole("button")).toBeNull();
    expect(tile).toHaveTextContent(/est\. 1RM/);
    // The second lift's tile loads on its own; wait for both terms rather than count at once.
    const terms = await waitFor(() => {
      const found = screen.getAllByRole("button", { name: /^What does .* mean\?$/ });
      expect(found.length).toBeGreaterThanOrEqual(2);
      return found;
    });
    for (const term of terms) expect(term.closest("a")).toBeNull();
    fireEvent.click(terms[0]);
    const sheet = await screen.findByRole("dialog");
    expect(sheet.closest("a")).toBeNull();
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

  it("counts imported history: a lift's estimate from it (labelled) and this week's imported sessions", async () => {
    await initializeDatabase();
    const squat = (daysAgo: number, weight: number) =>
      importedSession([importedSet({ weightPerImplementLb: weight, reps: 5 })], {
        startedAt: new Date(Date.now() - daysAgo * 86_400_000),
      });
    const monday = getMonday(new Date());
    // One imported session this week (Monday noon, never in the future), two older ones.
    const thisWeek = importedSession([importedSet({ weightPerImplementLb: 200, reps: 5 })], {
      startedAt: new Date(Math.min(Date.now() - 60_000, monday.getTime() + 12 * 3_600_000)),
    });
    await db.importedSessions.bulkPut([squat(20, 180), squat(10, 190), thisWeek]);
    render(<GlanceTiles />);

    const week = await screen.findByRole("link", { name: /This week/ });
    await waitFor(() => expect(within(week).getByText("1 / 4")).toBeInTheDocument());
    expect(week).toHaveTextContent("1 imported");

    const tile = await waitFor(() => {
      const found = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "/progress/lift/squat");
      expect(found).toBeDefined();
      return found!;
    });
    await waitFor(() => expect(within(tile).getByText(String(Math.round(200 * (1 + 5 / 30))))).toBeInTheDocument());
    expect(tile).toHaveTextContent("Imported,");
    expect(tile).not.toHaveTextContent("Finish a workout");
  });

  it("notes the lift's newest evidence as the Strength card does, a newer home version named", async () => {
    await initializeDatabase();
    const day = (daysAgo: number) => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      d.setHours(12, 0, 0, 0);
      return d;
    };
    // Made-up history: the squat itself 20 days ago, the split squat 4 days ago.
    await db.importedSessions.bulkPut([
      importedSession([importedSet({ weightPerImplementLb: 200, reps: 5 })], { startedAt: day(20) }),
      importedSession(
        [importedSet({ exerciseName: "Test Split Squat", mappedExerciseId: "bulgarian_split_squat", weightPerImplementLb: 40, implementCount: 2, reps: 8 })],
        { startedAt: day(4) }
      ),
    ]);
    render(<GlanceTiles />);
    const tile = await waitFor(() => {
      const found = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "/progress/lift/squat");
      expect(found).toBeDefined();
      return found!;
    });
    const shortDay = day(4).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(day(4).getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) });
    await waitFor(() => expect(tile).toHaveTextContent(`Imported, ${shortDay} · Bulgarian Split Squat`));
  });

  it("shows dashes and hints instead of zeros for a new user", async () => {
    await initializeDatabase();
    render(<GlanceTiles />);
    expect(await screen.findByText("Log a weigh-in to see your trend")).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/Finish a workout/)).toHaveLength(2));
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(3);
  });
});
