import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { importedSession, importedSet } from "@/lib/import/testRecords";
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
import { describeNextWorkout } from "@/lib/workout/buildPlan";
import { strengthSetsOf } from "@/lib/workout/strength";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";

const demo = generateDemoData(new Date());

async function seedDemo() {
  await db.workouts.bulkPut(demo.workouts);
  await db.estimated1RMs.bulkPut(demo.estimated1RMs);
  await db.liftStates.bulkPut(demo.liftStates);
  await db.variantStates.bulkPut(demo.variantStates);
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
    await seedFixtureStartingWeights();
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
    /** The next workout at home, as Today plans it (home exercises at their own weights, re-entry applied). */
    const nextAtHome = () =>
      describeNextWorkout({
        completedWorkouts: demo.workouts.filter((w) => w.completedAt),
        templates: WORKOUT_TEMPLATES,
        liftStates: demo.liftStates,
        plan: {
          location: "home",
          equipment,
          includeWarmUps: true,
          selectedAccessories: [],
          variantStates: demo.variantStates,
          strengthSets: strengthSetsOf(demo.workouts),
        },
        reentry: true,
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

      // The demo's next home workout does squat as a Bulgarian split squat, the home
      // exercise of its home block (the cap policy never swaps it for a lighter goblet
      // squat, H2), so this is that plan entry: its own weight, as Today shows it.
      const planned = nextAtHome().plan.find((e) => !e.isWarmUp && e.exerciseId === "squat")!;
      expect(planned.substituteExerciseId).toBe("bulgarian_split_squat");
      expect(within(next).getByTestId("home-next-weight")).toHaveTextContent(String(planned.weight));
      expect(within(next).getByTestId("home-next")).toHaveTextContent("lbs a hand");
      expect(within(next).getByTestId("home-next")).toHaveTextContent("T15×3+");
      expect(within(next).queryByTestId("home-planned-as")).toBeNull();
      expect(next).not.toHaveTextContent("new best");
      expect(next).toHaveTextContent("Set the Bulgarian split squat weight; the barbell squat stays as it is.");
      // How the weight was reached comes from the plan entry, never the flat 80% conversion.
      expect(within(next).getByTestId("home-weight-line")).not.toHaveTextContent("80% of");
      // With its rule (home progression, its seed's ratio, re-entry or the cap policy).
      const homeRule = within(next).getByTestId("home-weight-line").parentElement!.querySelector("[data-evidence]");
      expect(["home-progression", "cap-progression", "transfer-ratio", "strength-pooling", "dumbbell-conversion"]).toContain(
        homeRule?.getAttribute("data-evidence")
      );

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
      // Since the strength model the demo's next home squat is the split squat (H1, H2).
      search = "as=bulgarian_split_squat&from=today";
      render(<LiftPage />);
      expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/^Bulgarian split squat$/);
      const entry = nextAtHome().plan.find((e) => !e.isWarmUp && e.exerciseId === "squat")!;
      expect(entry.substituteExerciseId).toBe("bulgarian_split_squat");
      const next = await screen.findByTestId("home-next");
      expect(within(next).getByTestId("home-next-weight")).toHaveTextContent(String(entry.weight));
      expect(next).toHaveTextContent("a hand");
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

    it("adjusts the home exercise's own weight: the next home plan follows, the barbell does not", async () => {
      await initializeDatabase();
      await seedFixtureStartingWeights();
      const profile = await db.userProfile.toCollection().first();
      const equipment = profile!.settings.equipment;
      /** The next home plan, from what is stored now. */
      const homePlanNow = async () =>
        describeNextWorkout({
          completedWorkouts: [],
          templates: WORKOUT_TEMPLATES,
          liftStates: await db.liftStates.toArray(),
          plan: {
            location: "home",
            equipment,
            includeWarmUps: false,
            selectedAccessories: [],
            variantStates: await db.variantStates.toArray(),
            strengthSets: [],
          },
          reentry: true,
        }).plan.find((e) => !e.isWarmUp && e.exerciseId === "squat")!;
      const planned = await homePlanNow();
      const substitute = planned.substituteExerciseId!;
      const perHand = planned.perHand!;
      const barbellBefore = (await db.liftStates.get("squat"))!.t1Weight;

      search = `as=${substitute}`;
      render(
        <>
          <LiftPage />
          <Toaster />
        </>
      );
      const next = await screen.findByRole("region", { name: "Next session" });
      await waitFor(() => expect(within(next).getByTestId("home-next-weight")).toHaveTextContent(String(planned.weight)));
      expect(next).toHaveTextContent("Wrong weight for next time? Set the");
      fireEvent.click(within(next).getByRole("button", { name: "Adjust weight" }));

      const dialog = await screen.findByRole("dialog");
      // The same number as the page, in the home exercise's own terms and dumbbell steps.
      await waitFor(() => expect(within(dialog).getByRole("spinbutton", { name: /^Weight/ })).toHaveValue(planned.weight));
      expect(within(dialog).getByText(perHand ? "(lbs a hand)" : "(lbs)")).toBeInTheDocument();
      expect(dialog).toHaveTextContent(`The barbell squat stays at ${barbellBefore} lbs.`);
      const step = equipment.dumbbellIncrementLbs;
      fireEvent.click(within(dialog).getByRole("button", { name: `Increase weight by ${step}` }));
      // The preview is the next home session with the change in place.
      expect(within(dialog).getByTestId("home-adjust-preview")).toHaveTextContent(
        `Next home session: ${planned.weight + step} lbs${perHand ? " a hand" : ""}`
      );
      fireEvent.click(within(dialog).getByRole("button", { name: "Save change" }));

      await waitFor(() =>
        expect(within(next).getByTestId("home-next-weight")).toHaveTextContent(String(planned.weight + step))
      );
      expect((await homePlanNow()).weight).toBe(planned.weight + step);
      expect((await db.liftStates.get("squat"))!.t1Weight).toBe(barbellBefore);
      const manual = (await db.liftAdjustments.toArray()).filter((a) => a.source === "manual");
      expect(manual).toEqual([
        expect.objectContaining({
          exerciseId: "squat",
          set: { t1Weight: planned.weight + step },
          variant: { exerciseId: substitute, tier: "T1" },
        }),
      ]);
    });

    it("opened from the barbell page, the sheet still edits the barbell", async () => {
      await initializeDatabase();
      await seedFixtureStartingWeights();
      render(<LiftPage />);
      const next = await screen.findByRole("region", { name: "Next session" });
      fireEvent.click(within(next).getByRole("button", { name: "Adjust weight" }));
      expect(await screen.findByRole("heading", { name: "Adjust Squat" })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByRole("spinbutton", { name: /^Weight/ })).toHaveValue(190));
      expect(screen.getByRole("dialog")).not.toHaveTextContent("a hand");
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

  // Made-up imported history only: the repository is public.
  describe("with imported history", () => {
    const legDay = () =>
      importedSession(
        [
          importedSet({ exerciseName: "Made-up Goblet", mappedExerciseId: "goblet_squat", weightPerImplementLb: 60, reps: 12 }),
          importedSet({ exerciseName: "Made-up Squat", mappedExerciseId: "squat", weightPerImplementLb: 185, reps: 5, role: "warmup" }),
          importedSet({ exerciseName: "Made-up Squat", mappedExerciseId: "squat", weightPerImplementLb: 225, reps: 5, setOrder: 2 }),
          importedSet({ exerciseName: "Made-up Bench", mappedExerciseId: "bench", weightPerImplementLb: 135, reps: 5 }),
        ],
        // Newer than every demo workout, so it heads the list.
        { id: "imp-legs", sourceApp: "fitbod", title: "Leg Day", startedAt: new Date(Date.now() + 60_000) }
      );

    it("lists the lift's and its home versions' imported sessions, labelled, and leaves the GZCLP numbers alone", async () => {
      await seedDemo();
      const first = render(<LiftPage />);
      const nextBefore = (await screen.findByTestId("pr-line")).textContent;
      const statesBefore = await db.liftStates.toArray();
      first.unmount();

      await db.importedSessions.add(legDay());
      render(<LiftPage />);
      const sessions = await screen.findByRole("region", { name: "Sessions" });
      await waitFor(() => expect(within(sessions).getByTestId("imported-control")).toBeInTheDocument());
      const rows = within(sessions).getAllByTestId("session-row");
      expect(within(rows[0]).getByTestId("session-imported")).toHaveTextContent("Fitbod · Goblet squat");
      expect(rows[0]).toHaveTextContent("60 ×12");
      expect(within(rows[1]).getByTestId("session-imported")).toHaveTextContent(/^ImportedFitbod$/);
      expect(rows[1]).toHaveTextContent("225 ×5");
      // The bench sets of the same session are not squat history.
      expect(within(sessions).getAllByText("Imported")).toHaveLength(2);

      expect(screen.getByTestId("pr-line").textContent).toBe(nextBefore);
      expect(await db.liftStates.toArray()).toEqual(statesBefore);

      fireEvent.click(within(sessions).getByRole("button", { name: "Hide imported" }));
      expect(within(sessions).queryAllByText("Imported")).toHaveLength(0);
      expect(sessions.querySelector("[data-imported]")).toBeNull();
    });

    it("shows imported sessions before the first logged one", async () => {
      id = "bench";
      await db.importedSessions.add(legDay());
      render(<LiftPage />);
      expect(await screen.findByText("No bench sessions yet")).toBeInTheDocument();
      const sessions = await screen.findByRole("region", { name: "Sessions" });
      const row = await within(sessions).findByTestId("session-row");
      expect(row).toHaveTextContent("135 ×5");
      fireEvent.click(within(row).getByRole("button", { name: /Open imported session/ }));
      expect(await screen.findByRole("dialog", { name: "Leg Day" })).toHaveTextContent("Counts as Barbell Bench Press");
    });

    it("on a home version's page, lists that exercise's imported sessions", async () => {
      await seedDemo();
      await db.importedSessions.add(legDay());
      search = "as=goblet_squat";
      render(<LiftPage />);
      const list = await screen.findByRole("region", { name: "Goblet squat sessions" });
      const row = await within(list).findByText("Imported");
      // One dumbbell held at the chest: the weight is the load, not per hand.
      expect(row.closest("[data-testid=session-row]")).toHaveTextContent("60 ×12");
      expect(within(list).getAllByText("Imported")).toHaveLength(1);
      expect(within(list).getByTestId("session-imported")).toHaveTextContent(/^ImportedFitbod$/);
    });
  });
});
