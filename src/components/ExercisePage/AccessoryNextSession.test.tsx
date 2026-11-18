// An accessory's page: its prescribed weight, a weight set by hand with the plan's
// beside it, and the way back to the plan. Made-up workouts only.
import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile, makeSet, makeWorkout } from "@/lib/data/testUtils";
import { Toaster, dismissToast } from "@/components/ui/toast";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/chart-kit/LazyTrendChart", () => ({ LazyTrendChart: () => null, TrendChartSkeleton: () => null }));
vi.mock("@/components/ExerciseDemo/ExerciseViewer", () => ({ ExerciseViewer: () => null }));

import { ExercisePage } from "./ExercisePage";
import { accessoryScheme } from "./AccessoryNextSession";

/** A finished workout with three sets of face pulls as an accessory at `weight`. */
function facePulls(weight: number, reps: number) {
  const completedAt = new Date(Date.now() - 3 * 86_400_000);
  return makeWorkout({
    id: "w-fp",
    startedAt: new Date(completedAt.getTime() - 3_600_000),
    completedAt,
    sets: [1, 2, 3].map((n) =>
      makeSet({
        id: `fp-${n}`,
        exerciseId: "face_pulls",
        tier: "accessory",
        setNumber: n,
        targetReps: 15,
        actualReps: reps,
        weight,
        completedAt,
      })
    ),
  });
}

const card = () => screen.findByTestId("next-session");

beforeEach(async () => {
  await clearDb();
  await db.userProfile.put(makeProfile());
});
afterEach(() => {
  dismissToast();
  cleanup();
});

describe("an accessory's next session", () => {
  it("shows the weight its prescription gives, with its rep range", async () => {
    await db.workouts.add(facePulls(30, 15));
    render(<ExercisePage exerciseId="face_pulls" backHref="/" />);
    const next = await card();
    await waitFor(() => expect(within(next).getByTestId("next-weight")).toHaveTextContent(/\d/));
    expect(next).toHaveTextContent("3×15–20");
    expect(within(next).queryByTestId("plan-you")).toBeNull();
  });

  it("keeps the plan's weight beside one set by hand, and goes back to it", async () => {
    await db.workouts.add(facePulls(30, 15));
    render(
      <>
        <ExercisePage exerciseId="face_pulls" backHref="/" />
        <Toaster />
      </>
    );
    const next = await card();
    await waitFor(() => expect(within(next).getByTestId("next-weight")).toHaveTextContent(/\d/));
    const plan = within(next).getByTestId("next-weight").textContent;

    fireEvent.click(screen.getByRole("button", { name: "Adjust weight" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: /^Weight/ }), { target: { value: "50" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save change" }));

    const planYou = await screen.findByTestId("plan-you");
    expect(within(await card()).getByTestId("next-weight")).toHaveTextContent("50");
    expect(planYou).toHaveTextContent(`Plan ${plan}`);
    expect((await db.userProfile.toArray())[0].settings.accessoryWeights?.face_pulls?.weight).toBe(50);

    fireEvent.click(within(planYou).getByRole("button", { name: `Use ${plan}` }));
    await waitFor(() => expect(screen.queryByTestId("plan-you")).toBeNull());
    expect((await db.userProfile.toArray())[0].settings.accessoryWeights?.face_pulls).toBeUndefined();
  });

  it("refuses a weight that is not one", async () => {
    render(<ExercisePage exerciseId="face_pulls" backHref="/" />);
    await card();
    fireEvent.click(screen.getByRole("button", { name: "Adjust weight" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("spinbutton", { name: /^Weight/ }), { target: { value: "-5" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save change" }));
    expect(await within(dialog).findByText("Enter a weight of 0 or more.")).toBeInTheDocument();
    expect((await db.userProfile.toArray())[0].settings.accessoryWeights?.face_pulls).toBeUndefined();
  });
});

describe("accessoryScheme", () => {
  it("is sets × the rep range", () => {
    expect(accessoryScheme({ sets: 3, reps: { min: 12, max: 15 } })).toBe("3×12–15");
  });
});
