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
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id }),
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ push: vi.fn(), replace }),
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
import { ExercisePage } from "@/components/ExercisePage/ExercisePage";

const demo = generateDemoData(new Date());

async function seedDemo() {
  await db.workouts.bulkPut(demo.workouts);
  await db.estimated1RMs.bulkPut(demo.estimated1RMs);
  await db.liftStates.bulkPut(demo.liftStates);
  await db.variantStates.bulkPut(demo.variantStates);
  await db.userProfile.put(makeProfile());
}

/** Workouts with barbell squat working sets (not done as a home version). */
const barbellSquatWorkouts = () =>
  demo.workouts.filter((w) => w.sets.some((s) => s.exerciseId === "squat" && s.tier !== "warmup" && !s.substituteExerciseId && !s.isSubstituted));

beforeEach(async () => {
  id = "squat";
  search = "";
  replace.mockClear();
  await clearDb();
  dismissToast();
});
afterEach(cleanup);

describe("Lift page (the barbell lift's exercise page)", () => {
  it("is the squat's own page: next session, its sessions, its estimated 1RM, its weight changes, then home versions", async () => {
    await seedDemo();
    render(<LiftPage />);
    expect(await screen.findByRole("heading", { level: 1, name: "Barbell Squat" })).toBeInTheDocument();
    expect(screen.getByTestId("exercise-eyebrow")).toHaveTextContent(/T[12] · Squat/);
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/progress");
    expect(screen.getByRole("tab", { name: "Training", selected: true })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Form" })).toBeInTheDocument();

    const latest = demo.estimated1RMs
      .filter((r) => r.exerciseId === "squat")
      .sort((a, b) => +a.date - +b.date)
      .at(-1)!.estimated1RM;
    expect(await screen.findByTestId("e1rm-latest")).toHaveTextContent(String(Math.round(latest)));

    const next = await screen.findByRole("region", { name: "Next session" });
    await waitFor(() => expect(within(next).getByTestId("next-weight")).toBeInTheDocument());
    expect(within(next).getByRole("button", { name: "Adjust weight" })).toBeInTheDocument();
    expect(within(next).getByTestId("set-plan-editor")).toBeInTheDocument();

    const stats = screen.getByRole("region", { name: "Lift stats" });
    for (const label of ["Working", "Last set", "Effort", "Volume"]) {
      expect(stats).toHaveTextContent(label);
    }
    expect(within(stats).getByRole("button", { name: "What does Last set mean?" })).toHaveAttribute("data-term", "amrap");
    const sessions = screen.getByRole("region", { name: "Barbell Squat sessions" });
    expect(within(sessions).getAllByRole("button", { name: "What does T1 mean?" })).toHaveLength(1);
    // Barbell sessions only: no home version's row.
    expect(within(sessions).queryByTestId("session-home")).toBeNull();
    expect(screen.getByRole("link", { name: /Projection/ })).toHaveAttribute("href", "/progress/lift/squat/projection");
    expect(screen.getAllByText("best")).toHaveLength(1);

    const counts = screen.getByRole("region", { name: "Counts toward" });
    const versions = within(counts).getAllByTestId("home-version-row");
    expect(versions.map((v) => v.getAttribute("href"))).toEqual([
      "/exercises/goblet_squat",
      "/exercises/bulgarian_split_squat",
      "/exercises/db_lunge",
    ]);
    expect(versions[0]).toHaveTextContent(/0\.\d\d of squat/);

    const order = [next, sessions, screen.getByRole("region", { name: "Estimated 1RM" }), counts];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("draws the smooth trend line over the lift's sessions, with the plan's estimate marked", async () => {
    await seedDemo();
    render(<LiftPage />);
    const chart = await screen.findByRole("img", { name: /estimated 1RM over time/ });
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    await waitFor(() => expect(Number(chart.getAttribute("data-points"))).toBeGreaterThanOrEqual(1));
    expect(chart).toHaveAttribute("data-line", "smooth");
    expect(screen.getByTestId("today-marker")).toHaveTextContent(screen.getByTestId("e1rm-latest").textContent!);
    expect(within(screen.getByRole("list", { name: "Sources" })).getAllByRole("checkbox", { checked: true }).length).toBeGreaterThanOrEqual(1);
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
    expect(screen.getByRole("img", { name: /estimated 1RM/ }).getAttribute("data-points")).not.toBe(allPoints);
  });

  it("keeps the extra charts behind a disclosure", async () => {
    await seedDemo();
    render(<LiftPage />);
    const toggle = await screen.findByRole("button", { name: "More charts" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    for (const title of ["Working weight", "Last-set reps", "Effort (RPE)", "Weekly volume"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("lists every barbell session and none done as a home version", async () => {
    await seedDemo();
    render(<LiftPage />);
    await screen.findByTestId("e1rm-latest");
    const total = barbellSquatWorkouts().length;
    expect(total).toBeGreaterThan(0);
    // The demo also has home squat sessions, which this page leaves out.
    expect(demo.workouts.some((w) => w.sets.some((s) => s.exerciseId === "squat" && s.substituteExerciseId))).toBe(true);
    const sessions = await screen.findByRole("region", { name: "Barbell Squat sessions" });
    await waitFor(() => expect(within(sessions).getAllByTestId("session-row").length).toBe(Math.min(total, 20)));
    while (within(sessions).queryByRole("button", { name: /^Show \d+ more$/ })) {
      fireEvent.click(within(sessions).getByRole("button", { name: /^Show \d+ more$/ }));
    }
    expect(within(sessions).getAllByTestId("session-row")).toHaveLength(total);
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
    const next = screen.getByRole("region", { name: "Next session" });
    await waitFor(() => expect(within(next).getByTestId("next-weight")).toHaveTextContent("190"));
    expect(within(next).getByTestId("next-session")).toHaveTextContent("T15×3+");
    expect(within(next).getByTestId("next-when")).toHaveTextContent("Your next workout.");
    expect(within(next).queryByTestId("plan-you")).toBeNull();

    // Starting weights are the only entry so far, and carry no date.
    const changes = await screen.findByRole("region", { name: "Weight changes" });
    expect(within(changes).getAllByTestId("weight-change")).toHaveLength(1);
    expect(changes).toHaveTextContent("Starting weights");
    expect(changes).toHaveTextContent("Before the first workout");
    expect(changes).toHaveTextContent("T1 190 lbs 5x3 · T2 135 lbs 3x10");

    fireEvent.click(within(next).getByRole("button", { name: "Adjust weight" }));
    expect(await screen.findByRole("heading", { name: "Adjust Squat" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("spinbutton", { name: /^Weight/ })).toHaveValue(190));
    expect(screen.getByRole("dialog")).not.toHaveTextContent("a hand");
    fireEvent.click(screen.getByRole("button", { name: "Increase weight by 5" }));
    fireEvent.click(screen.getByRole("button", { name: "Save change" }));

    const preview = await screen.findByRole("dialog", { name: "What this changes" });
    expect(preview).toHaveTextContent("Squat T1 next time: 190 lbs 5x3 changes to 195 lbs 5x3");
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(190);
    fireEvent.click(within(preview).getByRole("button", { name: "Save change" }));

    await waitFor(() => expect(screen.getByTestId("pr-line")).toHaveTextContent("Next squat is 195."));
    await waitFor(() => expect(within(next).getByTestId("next-weight")).toHaveTextContent("195"));
    await waitFor(() =>
      expect(within(screen.getByRole("region", { name: "Weight changes" })).getAllByTestId("weight-change")).toHaveLength(2)
    );
    const rows = within(screen.getByRole("region", { name: "Weight changes" })).getAllByTestId("weight-change");
    expect(rows[0]).toHaveTextContent("Manual change");
    expect(rows[0]).toHaveTextContent("T1 195 lbs");
    expect(rows[1]).toHaveTextContent("Starting weights");
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(195);
  });

  it("shows the plan's weight beside one set by hand, with a way back to it", async () => {
    await initializeDatabase();
    await seedFixtureStartingWeights();
    // As the rebuild leaves it after a manual change (E7): the plan's 190 kept beside 200.
    await db.liftStates.update("squat", { t1Weight: 200, t1PlannedWeight: 190 });
    render(
      <>
        <LiftPage />
        <Toaster />
      </>
    );
    const next = await screen.findByRole("region", { name: "Next session" });
    const planYou = await within(next).findByTestId("plan-you");
    expect(within(planYou).getByTestId("plan-weight")).toHaveTextContent("190");
    expect(within(planYou).getByTestId("your-weight")).toHaveTextContent("200");
    fireEvent.click(within(planYou).getByRole("button", { name: "Use 190" }));
    await waitFor(async () => {
      const manual = (await db.liftAdjustments.toArray()).filter((a) => a.source === "manual");
      expect(manual).toEqual([
        expect.objectContaining({ exerciseId: "squat", set: { t1Weight: 190 }, note: expect.any(String) }),
      ]);
      expect(manual[0].variant).toBeUndefined();
    });
  });

  it("shows an empty state with no data", async () => {
    render(<LiftPage />);
    expect(await screen.findByText("No Barbell Squat sessions yet.")).toBeInTheDocument();
  });

  it("an old link with ?as= opens that home version's own page, keeping where it came from", async () => {
    await seedDemo();
    search = "as=bulgarian_split_squat&from=today";
    render(<LiftPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/exercises/bulgarian_split_squat?from=today"));
    expect(screen.queryByRole("heading", { name: "Barbell Squat" })).toBeNull();

    cleanup();
    replace.mockClear();
    search = "as=db_lunge";
    render(<LiftPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/exercises/db_lunge"));
  });

  it.each(["as=db_bench", "as=nonsense&from=today", "as=squat"])(
    "ignores an `as` that is not one of the lift's home versions (%s)",
    async (query) => {
      await seedDemo();
      search = query;
      render(<LiftPage />);
      expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/^Barbell Squat$/);
      expect(replace).not.toHaveBeenCalled();
      expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute(
        "href",
        query.includes("from=today") ? "/" : "/progress"
      );
      expect(await screen.findByRole("region", { name: "Barbell Squat sessions" })).toBeInTheDocument();
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

    it("lists the lift's own imported sessions, labelled, and leaves the GZCLP numbers alone", async () => {
      await seedDemo();
      const first = render(<LiftPage />);
      const nextSession = async () => (await screen.findByRole("region", { name: "Next session" })).textContent;
      await screen.findByRole("region", { name: / sessions$/ });
      const nextBefore = await nextSession();
      const statesBefore = await db.liftStates.toArray();
      first.unmount();

      await db.importedSessions.add(legDay());
      render(<LiftPage />);
      const sessions = await screen.findByRole("region", { name: / sessions$/ });
      await waitFor(() => expect(within(sessions).getByTestId("imported-control")).toBeInTheDocument());
      const rows = within(sessions).getAllByTestId("session-row");
      expect(within(rows[0]).getByTestId("session-imported")).toHaveTextContent(/^ImportedFitbod$/);
      expect(rows[0]).toHaveTextContent("225 ×5");
      // The goblet squat (a home version, with a page of its own) and the bench sets of
      // the same session are not on the squat's list.
      expect(within(sessions).getAllByText("Imported")).toHaveLength(1);

      expect(await nextSession()).toBe(nextBefore);
      expect(await db.liftStates.toArray()).toEqual(statesBefore);

      fireEvent.click(within(sessions).getByRole("button", { name: "Hide imported" }));
      expect(within(sessions).queryAllByText("Imported")).toHaveLength(0);
      expect(sessions.querySelector("[data-imported]")).toBeNull();
    });

    it("shows imported sessions before the first logged one", async () => {
      id = "bench";
      await db.importedSessions.add(legDay());
      render(<LiftPage />);
      // Imported history fills the page, so it is not "empty" before the first logged session.
      const sessions = await screen.findByRole("region", { name: / sessions$/ });
      expect(screen.queryByText("No bench sessions yet")).not.toBeInTheDocument();
      const row = await within(sessions).findByTestId("session-row");
      expect(row).toHaveTextContent("135 ×5");
      fireEvent.click(within(row).getByRole("button", { name: /Open imported session/ }));
      expect(await screen.findByRole("dialog", { name: "Leg Day" })).toHaveTextContent("Counts as Barbell Bench Press");
    });

    it("on a home version's page, lists that exercise's imported sessions", async () => {
      await seedDemo();
      await db.importedSessions.add(legDay());
      // `?as=goblet_squat` sends to the goblet squat's own page (tested above); render it.
      render(<ExercisePage exerciseId="goblet_squat" backHref="/" />);
      const list = await screen.findByRole("region", { name: "Goblet squat sessions" });
      const row = await within(list).findByText("Imported");
      // One dumbbell held at the chest: the weight is the load, not per hand.
      expect(row.closest("[data-testid=session-row]")).toHaveTextContent("60 ×12");
      expect(within(list).getAllByText("Imported")).toHaveLength(1);
      expect(within(list).getByTestId("session-imported")).toHaveTextContent(/^ImportedFitbod$/);
    });
  });
});
