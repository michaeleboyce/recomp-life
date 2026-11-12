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
import { EXERCISES } from "@/lib/exercises";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import type { WorkoutLocation } from "@/types";
import { NextWorkoutHero } from "./NextWorkoutHero";

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

function expectedPlan(location: WorkoutLocation) {
  const settings = DEFAULT_USER_PROFILE.settings;
  return describeNextWorkout({
    completedWorkouts: demo.workouts,
    templates: WORKOUT_TEMPLATES,
    liftStates: demo.liftStates,
    plan: {
      location,
      equipment: settings.equipment,
      includeWarmUps: false,
      selectedAccessories: [],
    },
  });
}

beforeEach(clearDb);

describe("NextWorkoutHero", () => {
  it("lists the next workout's working exercises with their gym weights", async () => {
    await seedDemo();
    render(<NextWorkoutHero />);
    const next = expectedPlan("gym");
    expect(await screen.findByText(new RegExp(`Workout ${next.templateId}`))).toBeInTheDocument();

    const rows = await screen.findAllByTestId("hero-exercise");
    const working = next.plan.filter((e) => !e.isWarmUp);
    expect(rows).toHaveLength(working.length);
    working.forEach((entry, i) => {
      expect(within(rows[i]).getByText(EXERCISES[entry.exerciseId].name)).toBeInTheDocument();
      expect(within(rows[i]).getByText(String(entry.weight))).toBeInTheDocument();
      expect(within(rows[i]).getByText(entry.tier)).toBeInTheDocument();
    });
    expect(within(rows[0]).getByText(`${working[0].targetSets}×${working[0].targetReps}+`)).toBeInTheDocument();
  });

  it("shows home substitutes and their weights after switching to Home", async () => {
    await seedDemo();
    render(<NextWorkoutHero />);
    await screen.findAllByTestId("hero-exercise");
    fireEvent.click(screen.getByRole("button", { name: "Home" }));

    const home = expectedPlan("home").plan.filter((e) => !e.isWarmUp);
    const substituted = home.filter((e) => e.substituteExerciseId);
    expect(substituted.length).toBeGreaterThan(0);
    for (const entry of substituted) {
      expect(await screen.findByText(EXERCISES[entry.substituteExerciseId!].name)).toBeInTheDocument();
    }
    const rows = screen.getAllByTestId("hero-exercise");
    home.forEach((entry, i) => {
      expect(within(rows[i]).getByText(String(entry.weight))).toBeInTheDocument();
    });
  });

  it("states the location with a chip, and switching it saves the default", async () => {
    await seedDemo();
    render(<NextWorkoutHero />);
    await screen.findAllByTestId("hero-exercise");
    const chip = () => document.querySelector("[data-slot=location-chip]");
    expect(chip()).toHaveAttribute("data-location", "gym");

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    await waitFor(async () =>
      expect((await db.userProfile.toCollection().first())!.settings.defaultLocation).toBe("home")
    );
    await waitFor(() => expect(chip()).toHaveAttribute("data-location", "home"));
  });

  it("opens on the saved default location", async () => {
    await seedDemo();
    await db.userProfile.update("profile-1", {
      settings: { ...makeProfile().settings, defaultLocation: "home" },
    });
    render(<NextWorkoutHero />);
    const substitute = expectedPlan("home").plan.find((e) => e.substituteExerciseId)!;
    expect(await screen.findByText(EXERCISES[substitute.substituteExerciseId!].name)).toBeInTheDocument();
  });

  it("links START WORKOUT to the configure screen", async () => {
    await seedDemo();
    render(<NextWorkoutHero />);
    const start = await screen.findByRole("link", { name: "START WORKOUT" });
    expect(start).toHaveAttribute("href", "/workout/configure");
  });

  it("shows a PR-chance line for the T1 lift with demo data, linking to the lift page", async () => {
    await seedDemo();
    render(<NextWorkoutHero />);
    const t1 = expectedPlan("gym").plan.find((e) => e.tier === "T1")!;
    const line = await screen.findByRole("link", { name: /PR chance on/ });
    expect(line).toHaveAttribute("href", `/progress/lift/${t1.exerciseId}`);
    expect(line.textContent).toMatch(/\d+\+ reps on the last set beats \d+/);
  });

  it("shows the first workout from the seeded lift states for a new user, with no PR line", async () => {
    await initializeDatabase();
    render(<NextWorkoutHero />);
    expect(await screen.findByText(/Workout A1/)).toBeInTheDocument();
    const rows = await screen.findAllByTestId("hero-exercise");
    expect(within(rows[0]).getByText(EXERCISES.squat.name)).toBeInTheDocument();
    expect(screen.queryByText(/PR chance/)).not.toBeInTheDocument();
  });
});
