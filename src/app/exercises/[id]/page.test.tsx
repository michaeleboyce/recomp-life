import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, makeProfile, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { describeNextWorkout } from "@/lib/workout/buildPlan";
import { strengthSetsOf } from "@/lib/workout/strength";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { Toaster, dismissToast } from "@/components/ui/toast";
import type { PlannedSet } from "@/types";

let search = "";
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/chart-kit/LazyTrendChart", () => ({
  LazyTrendChart: (props: { ariaLabel: string; series: { points: unknown[] } }) => (
    <div role="img" aria-label={props.ariaLabel} data-points={props.series.points.length} />
  ),
  TrendChartSkeleton: () => null,
}));
vi.mock("@/components/ExerciseDemo/ExerciseViewer", () => ({
  ExerciseViewer: () => <div data-testid="viewer" />,
}));
// The set editor has tests of its own; here it shows the sets it is given and changes the first.
vi.mock("@/components/SetPlan/SetPlanEditor", () => ({
  SetPlanEditor: (props: { sets: PlannedSet[]; planSets: PlannedSet[]; unit: string; onChange: (s: PlannedSet[] | null) => void }) => (
    <div data-testid="set-plan-editor" data-unit={props.unit}>
      <span data-testid="editor-sets">{props.sets.map((s) => `${s.weight}x${s.reps}`).join(",")}</span>
      <button onClick={() => props.onChange([{ ...props.sets[0], weight: props.sets[0].weight + 5 }, ...props.sets.slice(1)])}>
        Heavier first set
      </button>
      <button onClick={() => props.onChange(null)}>Back to plan</button>
    </div>
  ),
}));

import { ExercisePageClient } from "./ExercisePageClient";

const demo = generateDemoData(new Date());

async function seedDemo() {
  await db.workouts.bulkPut(demo.workouts);
  await db.estimated1RMs.bulkPut(demo.estimated1RMs);
  await db.liftStates.bulkPut(demo.liftStates);
  await db.variantStates.bulkPut(demo.variantStates);
  await db.liftAdjustments.bulkPut(demo.liftAdjustments ?? []);
  await db.userProfile.put(makeProfile());
}

const equipment = makeProfile().settings.equipment;
/** The next workout at home, as Today plans it. */
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
const sessionsAs = (substituteId: string) =>
  demo.workouts
    .filter((w) => w.sets.some((s) => s.substituteExerciseId === substituteId && s.tier !== "warmup"))
    .sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt));

beforeEach(async () => {
  search = "";
  await clearDb();
  dismissToast();
});
afterEach(cleanup);

describe("an exercise's page", () => {
  it("the Bulgarian split squat page is about the split squat, not the barbell squat", async () => {
    await seedDemo();
    search = "from=today";
    const { container } = render(<ExercisePageClient exerciseId="bulgarian_split_squat" />);

    const title = await screen.findByRole("heading", { level: 1 });
    expect(title).toHaveTextContent(/^Bulgarian split squat$/);
    expect(screen.getByTestId("exercise-eyebrow")).toHaveTextContent("Home version of Squat");
    expect(screen.getByTestId("exercise-header").querySelector("img")).toHaveAttribute(
      "src",
      expect.stringContaining("bulgarian")
    );
    const back = screen.getByRole("link", { name: "Back" });
    expect(back).toHaveAttribute("href", "/");
    expect(back).toHaveAttribute("data-slot", "back-button");

    const next = await screen.findByRole("region", { name: "Next session" });
    const planned = nextAtHome().plan.find((e) => !e.isWarmUp && e.exerciseId === "squat")!;
    expect(planned.substituteExerciseId).toBe("bulgarian_split_squat");
    await waitFor(() => expect(within(next).getByTestId("next-weight")).toHaveTextContent(String(planned.weight)));
    expect(within(next).getByTestId("next-session")).toHaveTextContent("lbs a hand");
    expect(within(next).getByTestId("next-session")).toHaveTextContent("T15×3+");
    expect(next).toHaveTextContent("Set the Bulgarian split squat weight; the barbell squat stays as it is");
    expect(within(next).getByTestId("home-weight-line")).not.toHaveTextContent("80% of");
    expect(within(next).getByRole("button", { name: "Adjust weight" })).toBeInTheDocument();
    expect(within(next).getByTestId("set-plan-editor")).toHaveAttribute("data-unit", "lbs a hand");

    // Its own sessions only.
    const sessions = await screen.findByRole("region", { name: "Bulgarian split squat sessions" });
    const own = sessionsAs("bulgarian_split_squat");
    await waitFor(() => expect(within(sessions).getAllByTestId("session-row")).toHaveLength(Math.min(own.length, 10)));
    expect(within(sessions).getAllByTestId("session-row")[0].querySelector("a")).toHaveAttribute(
      "href",
      `/log/workout?id=${own[0].id}`
    );

    // Its own strength, never the barbell squat's 1RM chart.
    const strength = screen.getByRole("region", { name: "Strength" });
    expect(within(strength).queryByRole("img", { name: /Barbell squat/i })).toBeNull();
    expect(screen.queryByRole("region", { name: "Estimated 1RM" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Lift stats" })).toBeNull();
    expect(screen.queryByText(/comes from barbell squat sets/)).toBeNull();
    expect(container.querySelector('[data-testid="pr-line"]')).toBeNull();

    // Its weight changes exclude the squat's starting weights.
    const changes = screen.queryByRole("region", { name: "Weight changes" });
    if (changes) expect(changes).not.toHaveTextContent("Starting weights");

    // Counts toward: the squat's estimate, what this exercise says, the ratio, the squat's page.
    const counts = screen.getByRole("region", { name: "Counts toward" });
    expect(within(counts).getByTestId("pooled-estimate")).toHaveTextContent(/\d+ lbs/);
    expect(within(counts).getByTestId("counts-says")).toHaveTextContent(/≈ squat \d+/);
    expect(within(counts).getByTestId("counts-ratio")).toHaveTextContent(/about 0\.\d\d of your squat/);
    expect(within(counts).getByRole("link", { name: /Open Squat/ })).toHaveAttribute("href", "/progress/lift/squat");

    const order = [title, next, sessions, strength, counts];
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("keeps the form, muscles and alternatives on the Form tab", async () => {
    await seedDemo();
    render(<ExercisePageClient exerciseId="bulgarian_split_squat" />);
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/exercises");
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Form" }));
    expect(await screen.findByTestId("viewer")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Muscles" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Next session" })).toBeNull();
  });

  it("the dumbbell row page shows its next weight, Adjust weight, its sessions and its last sets", async () => {
    await seedDemo();
    render(<ExercisePageClient exerciseId="db_row" />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/^DB row$|^Dumbbell row$/i);
    expect(screen.getByTestId("exercise-eyebrow")).toHaveTextContent("T3 · Pull");
    const next = await screen.findByRole("region", { name: "Next session" });
    await waitFor(() => expect(within(next).getByTestId("next-weight")).toHaveTextContent(/^\d+$/));
    expect(within(next).getByTestId("next-session")).toHaveTextContent("T3");
    expect(within(next).getByTestId("weight-line")).toHaveTextContent("last set reaches 25 reps");
    expect(within(next).getByRole("button", { name: "Adjust weight" })).toBeInTheDocument();
    expect(within(next).getByTestId("set-plan-editor")).toBeInTheDocument();

    const sessions = await screen.findByRole("region", { name: /sessions$/ });
    await waitFor(() => expect(within(sessions).getAllByTestId("session-row").length).toBeGreaterThan(0));
    const strength = screen.getByRole("region", { name: "Strength" });
    expect(within(strength).getAllByTestId("t3-last-set").length).toBeGreaterThan(0);
    expect(within(strength).getAllByTestId("t3-last-set")[0]).toHaveTextContent(/\d+\/25/);
    expect(within(screen.getByRole("region", { name: "Counts toward" })).getByTestId("muscles-trained")).toBeInTheDocument();
  });

  it("an exercise never planned says so", async () => {
    await seedDemo();
    render(<ExercisePageClient exerciseId="incline_db_row" />);
    expect(await screen.findByTestId("exercise-eyebrow")).toHaveTextContent("Exercise");
    const next = await screen.findByRole("region", { name: "Next session" });
    await waitFor(() => expect(within(next).getByTestId("not-planned")).toHaveTextContent("Not in your coming workouts."));
    expect(within(next).queryByRole("button", { name: "Adjust weight" })).toBeNull();
    expect(await screen.findByText("No Incline DB row sessions yet.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Strength" })).toHaveTextContent("gives its estimate");
  });

  it("a home version without a photo shows its muscle figure", async () => {
    await seedDemo();
    render(<ExercisePageClient exerciseId="single_leg_db_rdl" />);
    const header = await screen.findByTestId("exercise-header");
    expect(within(header).getByRole("heading", { level: 1 })).toHaveTextContent(/^Single-Leg DB RDL$/);
    expect(screen.getByTestId("exercise-eyebrow")).toHaveTextContent("Home version of Deadlift");
    expect(header.querySelector('[data-slot="exercise-image"]')).toBeNull();
    expect(within(header).getByRole("group", { name: "Muscles worked by Single-Leg DB RDL" })).toBeInTheDocument();
  });

  it("says honestly when there are no sessions of a home version yet", async () => {
    await seedDemo();
    render(<ExercisePageClient exerciseId="db_lunge" />);
    expect(sessionsAs("db_lunge")).toHaveLength(0);
    const list = await screen.findByRole("region", { name: "DB lunge sessions" });
    expect(list).toHaveTextContent("No DB lunge sessions yet. They will appear here and count toward your squat.");
  });

  it("adjusts a home exercise's own weight: the page follows, the barbell does not", async () => {
    await initializeDatabase();
    await seedFixtureStartingWeights();
    const barbellBefore = (await db.liftStates.get("squat"))!.t1Weight;
    // The home exercise the next home workout does squat as, below the heaviest dumbbell.
    const substitute = describeNextWorkout({
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
    }).plan.find((e) => !e.isWarmUp && e.exerciseId === "squat")!.substituteExerciseId!;
    render(
      <>
        <ExercisePageClient exerciseId={substitute} />
        <Toaster />
      </>
    );
    const next = await screen.findByRole("region", { name: "Next session" });
    const weight = await within(next).findByTestId("next-weight");
    const before = Number(weight.textContent);
    fireEvent.click(within(next).getByRole("button", { name: "Adjust weight" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(within(dialog).getByRole("spinbutton", { name: /^Weight/ })).toHaveValue(before));
    const step = equipment.dumbbellIncrementLbs;
    fireEvent.click(within(dialog).getByRole("button", { name: `Increase weight by ${step}` }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save change" }));
    await waitFor(() => expect(within(next).getByTestId("next-weight")).toHaveTextContent(String(before + step)));
    expect((await db.liftStates.get("squat"))!.t1Weight).toBe(barbellBefore);
    // Set by hand: the plan's own weight stays beside it, one tap from coming back.
    await waitFor(() => expect(within(next).getByTestId("plan-weight")).toHaveTextContent(String(before)));
    expect(within(next).getByRole("button", { name: `Use ${before}` })).toBeInTheDocument();
    // The change shows under its own weight changes.
    const changes = await screen.findByRole("region", { name: "Weight changes" });
    expect(within(changes).getAllByTestId("weight-change")).toHaveLength(1);
    expect(changes).toHaveTextContent("Manual change at home");
  });

  it("keeps per-set weights for the next session in the settings, and back to plan removes them", async () => {
    await initializeDatabase();
    await seedFixtureStartingWeights();
    render(<ExercisePageClient exerciseId="db_row" />);
    const next = await screen.findByRole("region", { name: "Next session" });
    const editor = await within(next).findByTestId("set-plan-editor");
    const planned = within(editor).getByTestId("editor-sets").textContent!;
    fireEvent.click(within(editor).getByRole("button", { name: "Heavier first set" }));
    await waitFor(async () => {
      const plans = (await db.userProfile.toCollection().first())!.settings.nextSetPlans ?? {};
      expect(plans["db_row|T3"]).toMatchObject({ exerciseId: "db_row", liftId: "db_row", tier: "T3" });
    });
    await waitFor(() => expect(within(editor).getByTestId("editor-sets").textContent).not.toBe(planned));
    fireEvent.click(within(editor).getByRole("button", { name: "Back to plan" }));
    await waitFor(async () => {
      const plans = (await db.userProfile.toCollection().first())!.settings.nextSetPlans ?? {};
      expect(plans["db_row|T3"]).toBeUndefined();
    });
  });
});
