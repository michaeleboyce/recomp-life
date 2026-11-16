import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { initializeDatabase } from "@/db/init";
import { Toaster, dismissToast } from "@/components/ui/toast";

let id = "squat";
let search = "";
vi.mock("next/navigation", () => ({
  useParams: () => ({ id }),
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/chart-kit/LazyTrendChart", () => ({
  LazyTrendChart: (props: {
    ariaLabel: string;
    series: { points: unknown[] };
    overlays?: Array<{ label: string }>;
  }) => (
    <div
      role="img"
      aria-label={props.ariaLabel}
      data-points={props.series.points.length}
      data-overlays={(props.overlays ?? []).map((o) => o.label).join(",")}
    />
  ),
  TrendChartSkeleton: () => null,
}));

import LiftPage from "./page";
import { homeVersionWeight } from "@/components/Lift/homeVersion";
import { describeNextWorkout } from "@/lib/workout/buildPlan";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";

const demo = generateDemoData(new Date());

async function seedDemo() {
  await db.workouts.bulkPut(demo.workouts);
  await db.estimated1RMs.bulkPut(demo.estimated1RMs);
  await db.liftStates.bulkPut(demo.liftStates);
  await db.userProfile.put(makeProfile());
}

beforeEach(async () => {
  id = "squat";
  search = "";
  await clearDb();
  dismissToast();
});
afterEach(cleanup);

describe("Lift detail page", () => {
  it("shows the headline, PR line, stats and sessions", async () => {
    await seedDemo();
    render(<LiftPage />);
    expect(await screen.findByRole("heading", { name: "Barbell Squat" })).toBeInTheDocument();
    expect(screen.queryByTestId("home-version")).toBeNull();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/progress");
    expect(screen.getByRole("link", { name: "Form and muscles" })).toHaveAttribute(
      "href",
      "/exercises/squat"
    );

    const latest = demo.estimated1RMs
      .filter((r) => r.exerciseId === "squat")
      .sort((a, b) => +a.date - +b.date)
      .at(-1)!.estimated1RM;
    expect(await screen.findByTestId("e1rm-latest")).toHaveTextContent(String(Math.round(latest)));

    const squat = demo.liftStates.find((s) => s.exerciseId === "squat")!;
    expect(screen.getByTestId("pr-line")).toHaveTextContent(`Next squat is ${squat.t1Weight}.`);

    const stats = screen.getByRole("region", { name: "Lift stats" });
    for (const label of ["Working", "Last set", "Effort", "Volume"]) {
      expect(stats).toHaveTextContent(label);
    }
    expect(within(stats).getByRole("button", { name: "What does Last set mean?" })).toHaveAttribute("data-term", "amrap");
    expect(within(stats).getByRole("button", { name: "What does Effort mean?" })).toHaveAttribute("data-term", "rpe");
    // Each tier in the session list is explained once.
    const sessions = screen.getByRole("region", { name: "Sessions" });
    expect(within(sessions).getAllByRole("button", { name: "What does T1 mean?" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Projection/ })).toHaveAttribute(
      "href",
      "/progress/lift/squat/projection"
    );
    expect(screen.getAllByTestId("session-row").length).toBeGreaterThan(0);
    expect(screen.getAllByText("best")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "What does Estimated 1RM mean?" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Estimated 1RM");
  });

  it("draws the trend overlay with enough points", async () => {
    await seedDemo();
    render(<LiftPage />);
    const chart = await screen.findByRole("img", { name: /estimated 1RM over time/ });
    expect(Number(chart.getAttribute("data-points"))).toBeGreaterThanOrEqual(4);
    expect(chart).toHaveAttribute("data-overlays", "Trend");
  });

  it("a range change alters the summarised numbers", async () => {
    await seedDemo();
    render(<LiftPage />);
    await screen.findByTestId("e1rm-latest");
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    const allStats = screen.getByRole("region", { name: "Lift stats" }).textContent;
    const allPoints = screen.getByRole("img", { name: /estimated 1RM/ }).getAttribute("data-points");
    fireEvent.click(screen.getByRole("radio", { name: "4w" }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Lift stats" }).textContent).not.toBe(allStats)
    );
    expect(screen.getByRole("img", { name: /estimated 1RM/ }).getAttribute("data-points")).not.toBe(
      allPoints
    );
  });

  it("keeps the extra charts behind a disclosure", async () => {
    await seedDemo();
    render(<LiftPage />);
    const toggle = await screen.findByRole("button", { name: "More charts" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Weekly volume")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const title of ["Working weight", "Last-set reps", "Effort (RPE)", "Weekly volume"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("shows ten sessions, then all of them", async () => {
    await seedDemo();
    render(<LiftPage />);
    await screen.findByTestId("e1rm-latest");
    const total = demo.workouts.filter((w) =>
      w.sets.some((s) => s.exerciseId === "squat" && s.tier !== "warmup")
    ).length;
    expect(total).toBeGreaterThan(10);
    expect(screen.getAllByTestId("session-row")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: /Show all/ }));
    expect(screen.getAllByTestId("session-row").length).toBeGreaterThanOrEqual(total);
  });

  it("adjusts the next weight from the screen and lists the change under Weight changes", async () => {
    await initializeDatabase();
    render(
      <>
        <LiftPage />
        <Toaster />
      </>
    );
    expect(await screen.findByTestId("pr-line")).toHaveTextContent("Next squat is 190.");

    // Starting weights are the only entry so far, and carry no date.
    const changes = await screen.findByRole("region", { name: "Weight changes" });
    expect(within(changes).getAllByTestId("weight-change")).toHaveLength(1);
    expect(changes).toHaveTextContent("Starting weights");
    expect(changes).toHaveTextContent("Before the first workout");
    expect(changes).toHaveTextContent("T1 190 lbs 5x3 · T2 135 lbs 3x10");

    const next = screen.getByRole("region", { name: "Next session" });
    fireEvent.click(within(next).getByRole("button", { name: "Adjust weight" }));
    expect(await screen.findByRole("heading", { name: "Adjust Squat" })).toBeInTheDocument();
    // The sheet reads the lift's current weight; wait for it before stepping.
    await waitFor(() => expect(screen.getByRole("spinbutton", { name: /^Weight/ })).toHaveValue(190));
    fireEvent.click(screen.getByRole("button", { name: "Increase weight by 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Save change" }));

    // The next workout changes, so the preview comes first.
    const preview = await screen.findByRole("dialog", { name: "What this changes" });
    expect(preview).toHaveTextContent("Squat T1 next time: 190 lbs 5x3 changes to 195 lbs 5x3");
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(190);
    fireEvent.click(within(preview).getByRole("button", { name: "Save change" }));

    await waitFor(() => expect(screen.getByTestId("pr-line")).toHaveTextContent("Next squat is 195."));
    await waitFor(() =>
      expect(within(screen.getByRole("region", { name: "Weight changes" })).getAllByTestId("weight-change")).toHaveLength(2)
    );
    const rows = within(screen.getByRole("region", { name: "Weight changes" })).getAllByTestId("weight-change");
    // Newest first.
    expect(rows[0]).toHaveTextContent("Manual change");
    expect(rows[0]).toHaveTextContent("T1 195 lbs");
    expect(rows[1]).toHaveTextContent("Starting weights");
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(195);
    const stored = (await db.liftAdjustments.toArray()).filter((a) => a.exerciseId === "squat");
    expect(stored.map((a) => a.source).sort()).toEqual(["manual", "start"]);
  });

  it("shows an empty state with no data", async () => {
    render(<LiftPage />);
    expect(await screen.findByText("No squat sessions yet")).toBeInTheDocument();
  });

  describe("opened as a home version", () => {
    const equipment = makeProfile().settings.equipment;
    const squat = demo.liftStates.find((s) => s.exerciseId === "squat")!;
    /** The next workout at home, as Today plans it. */
    const nextAtHome = () =>
      describeNextWorkout({
        completedWorkouts: demo.workouts.filter((w) => w.completedAt),
        templates: WORKOUT_TEMPLATES,
        liftStates: demo.liftStates,
        plan: { location: "home", equipment, includeWarmUps: true, selectedAccessories: [] },
      })!;
    /** Workouts with working sets done as the substitute, newest first. */
    const sessionsAs = (substituteId: string) =>
      demo.workouts
        .filter((w) => w.sets.some((s) => s.substituteExerciseId === substituteId && s.tier !== "warmup"))
        .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));

    it("is headed by the home exercise, then its next session, its sessions and the squat's progress", async () => {
      await seedDemo();
      search = "as=bulgarian_split_squat&from=today";
      const { container } = render(<LiftPage />);

      // The heading is the exercise the user tapped, not the barbell lift.
      const title = await screen.findByRole("heading", { level: 1 });
      expect(title).toHaveTextContent(/^Bulgarian split squat$/);
      expect(screen.queryByRole("heading", { name: "Barbell Squat" })).toBeNull();
      expect(screen.getByTestId("home-eyebrow")).toHaveTextContent("Home version of Squat");
      expect(screen.getByTestId("home-version").querySelector("img")).toHaveAttribute(
        "src",
        expect.stringContaining("bulgarian")
      );
      // The same back arrow as every other page: history first, then this fallback.
      const back = screen.getByRole("link", { name: "Back" });
      expect(back).toHaveAttribute("href", "/");
      expect(back).toHaveAttribute("data-slot", "back-button");
      expect(screen.getByRole("link", { name: "Form and muscles" })).toHaveAttribute(
        "href",
        "/exercises/bulgarian_split_squat"
      );

      const next = await screen.findByRole("region", { name: "Next session" });
      const homeSessions = screen.getByRole("region", { name: "Bulgarian split squat sessions" });
      const progress = screen.getByRole("region", { name: "Squat progress" });
      const order = [title, next, homeSessions, progress];
      for (let i = 1; i < order.length; i++) {
        expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      }

      // The demo's next home workout does squat as a goblet squat, so this is the
      // weight of the next T1 done as a Bulgarian split squat, and the page says so.
      expect(nextAtHome().plan.find((e) => e.exerciseId === "squat")?.substituteExerciseId).toBe("goblet_squat");
      const weight = homeVersionWeight("squat", "bulgarian_split_squat", squat.t1Weight, equipment);
      expect(within(next).getByTestId("home-next-weight")).toHaveTextContent(String(weight));
      expect(within(next).getByTestId("home-next")).toHaveTextContent("lbs a hand");
      expect(within(next).getByTestId("home-next")).toHaveTextContent("T15×3+");
      expect(within(next).getByTestId("home-planned-as")).toHaveTextContent("has goblet squat for squat");
      expect(within(next).getByTestId("home-conversion")).toHaveTextContent(
        `80% of the ${squat.t1Weight} lbs barbell squat`
      );
      expect(next).not.toHaveTextContent("new best");
      expect(next).toHaveTextContent("Set the barbell weight; the Bulgarian split squat weight follows from it.");

      // Its own sessions, newest first, with no "At home" line on each.
      const own = sessionsAs("bulgarian_split_squat");
      expect(own.length).toBeGreaterThan(0);
      const rows = within(homeSessions).getAllByTestId("session-row");
      expect(rows).toHaveLength(own.length);
      expect(within(rows[0]).getByRole("link")).toHaveAttribute("href", `/log/workout?id=${own[0].id}`);
      expect(within(homeSessions).queryByTestId("session-home")).toBeNull();

      // The squat's progress: the barbell estimate and the whole history, and a way to the lift's page.
      expect(progress).toHaveTextContent(
        "Home sessions keep squat progression going, while the estimated 1RM comes from barbell squat sets."
      );
      expect(within(progress).getByRole("link", { name: /Open Squat/ })).toHaveAttribute("href", "/progress/lift/squat");
      expect(within(progress).getByRole("region", { name: "Estimated 1RM" })).toHaveTextContent("Barbell squat ·");
      expect(within(progress).getByRole("img", { name: /Barbell squat estimated 1RM over time/ })).toBeInTheDocument();
      expect(within(progress).getByTestId("e1rm-latest")).toBeInTheDocument();
      expect(within(progress).getByRole("region", { name: "Lift stats" })).toBeInTheDocument();
      expect(within(progress).getAllByTestId("session-row")).toHaveLength(10);
      expect(container.querySelector('[data-testid="pr-line"]')).toBeNull();
    });

    it("gives the weight Today shows when the next home workout has this substitute", async () => {
      await seedDemo();
      search = "as=goblet_squat&from=today";
      render(<LiftPage />);
      expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/^Goblet squat$/);
      const entry = nextAtHome().plan.find((e) => !e.isWarmUp && e.exerciseId === "squat")!;
      expect(entry.substituteExerciseId).toBe("goblet_squat");
      const next = await screen.findByTestId("home-next");
      expect(within(next).getByTestId("home-next-weight")).toHaveTextContent(String(entry.weight));
      expect(next).not.toHaveTextContent("a hand");
      expect(screen.queryByTestId("home-planned-as")).toBeNull();
    });

    it("says honestly when there are no sessions of it yet", async () => {
      await seedDemo();
      search = "as=db_lunge";
      render(<LiftPage />);
      expect(sessionsAs("db_lunge")).toHaveLength(0);
      const list = await screen.findByRole("region", { name: "DB lunge sessions" });
      expect(list).toHaveTextContent("No DB lunge sessions yet. They will appear here and count toward your squat.");
      expect(within(list).queryAllByTestId("session-row")).toHaveLength(0);
      expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/progress");
    });

    it("shows the muscle figure for a home version without a photo", async () => {
      await seedDemo();
      id = "deadlift";
      search = "as=single_leg_db_rdl";
      render(<LiftPage />);
      const header = await screen.findByTestId("home-version");
      expect(within(header).getByRole("heading", { level: 1 })).toHaveTextContent(/^Single-Leg DB RDL$/);
      expect(screen.getByTestId("home-eyebrow")).toHaveTextContent("Home version of Deadlift");
      expect(header.querySelector('[data-slot="exercise-image"]')).toBeNull();
      expect(within(header).getByRole("group", { name: "Muscles worked by Single-Leg DB RDL" })).toBeInTheDocument();
    });

    it("says the weight control changes the barbell weight", async () => {
      await initializeDatabase();
      search = "as=bulgarian_split_squat";
      render(<LiftPage />);
      const next = await screen.findByRole("region", { name: "Next session" });
      fireEvent.click(within(next).getByRole("button", { name: "Adjust weight" }));
      expect(await screen.findByRole("heading", { name: "Adjust Squat" })).toBeInTheDocument();
      // The sheet reads the lift's current weight before it shows the field and its hint.
      await waitFor(() =>
        expect(screen.getByRole("dialog")).toHaveTextContent(
          "The barbell weight. At home the Bulgarian split squat weight follows from it."
        )
      );
    });
  });

  it.each(["as=db_bench", "as=nonsense&from=today", "as=squat"])(
    "ignores an `as` that is not one of the lift's home substitutes (%s)",
    async (query) => {
      await seedDemo();
      search = query;
      render(<LiftPage />);
      expect(await screen.findByTestId("pr-line")).toHaveTextContent(/^Next squat is/);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Barbell Squat$/);
      expect(screen.queryByTestId("home-version")).toBeNull();
      expect(screen.queryByTestId("home-next")).toBeNull();
      expect(screen.queryByRole("region", { name: "Squat progress" })).toBeNull();
      expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
        "href",
        query.includes("from=today") ? "/" : "/progress"
      );
      expect(screen.getByRole("link", { name: "Form and muscles" })).toHaveAttribute("href", "/exercises/squat");
      expect(screen.getByRole("region", { name: "Sessions" })).toBeInTheDocument();
    }
  );

  it("an unknown id links back to Progress", async () => {
    id = "lat_pulldown";
    render(<LiftPage />);
    expect(screen.getByText("No such lift")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Progress" })).toHaveAttribute("href", "/progress");
  });
});
