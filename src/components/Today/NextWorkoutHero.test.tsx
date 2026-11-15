import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { describeNextWorkout } from "@/lib/workout/buildPlan";
import { getNextWorkoutId, WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import type { WorkoutLocation } from "@/types";
import { NextWorkoutHero } from "./NextWorkoutHero";
import { dayName, displayLiftName } from "./todayModel";

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
  it("lists the next workout's working lifts with their gym weights under the day's name", async () => {
    await seedDemo();
    render(<NextWorkoutHero />);
    const next = expectedPlan("gym");
    expect(await screen.findByText(`Next up · ${next.templateId}`)).toBeInTheDocument();
    const t1 = next.template.exercises.find((e) => e.tier === "T1")!.exerciseId;
    expect(screen.getByRole("heading", { level: 2, name: dayName(t1, "") })).toBeInTheDocument();

    const rows = await screen.findAllByTestId("hero-exercise");
    const working = next.plan.filter((e) => !e.isWarmUp);
    expect(rows).toHaveLength(working.length);
    working.forEach((entry, i) => {
      expect(within(rows[i]).getByRole("link", { name: displayLiftName(entry.exerciseId) })).toHaveAttribute(
        "href",
        `/progress/lift/${entry.exerciseId}?from=today`
      );
      expect(within(rows[i]).getByText(String(entry.weight))).toBeInTheDocument();
      expect(within(rows[i]).getByText(entry.tier)).toBeInTheDocument();
    });
    expect(within(rows[0]).getByText(`${working[0].targetSets}×${working[0].targetReps}+`)).toBeInTheDocument();
  });

  it("gives each lift a reason line from the last workout that had it", async () => {
    await seedDemo();
    render(<NextWorkoutHero />);
    const reasons = await screen.findAllByTestId("lift-reason");
    // Every lift in the demo has been done before, so none is a first time.
    for (const reason of reasons) {
      expect(reason.textContent).toMatch(/^(▲ \d+ from \d+|▼ \d+ from \d+|Held at \d+)$/);
    }
  });

  it("shows the main lift's photo behind the title and links the muscles to the Muscles tab", async () => {
    await seedDemo();
    render(<NextWorkoutHero />);
    const t1 = expectedPlan("gym").plan.find((e) => e.tier === "T1" && !e.isWarmUp)!;
    const hero = await screen.findByTestId("today-hero");
    expect(hero).toHaveAttribute("data-photo", t1.exerciseId);
    expect(screen.getByRole("link", { name: "Muscles worked. Open the muscle map" })).toHaveAttribute(
      "href",
      "/progress?tab=muscles"
    );
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
      expect(await screen.findByText(displayLiftName(entry.substituteExerciseId!))).toBeInTheDocument();
    }
    const rows = screen.getAllByTestId("hero-exercise");
    home.forEach((entry, i) => {
      expect(within(rows[i]).getByText(String(entry.weight))).toBeInTheDocument();
    });
  });

  it("shows the location on the switch, and switching it saves the default", async () => {
    await seedDemo();
    render(<NextWorkoutHero />);
    await screen.findAllByTestId("hero-exercise");
    expect(screen.getByRole("button", { name: "Gym" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    await waitFor(async () =>
      expect((await db.userProfile.toCollection().first())!.settings.defaultLocation).toBe("home")
    );
    await waitFor(() => expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("opens on the saved default location", async () => {
    await seedDemo();
    await db.userProfile.update("profile-1", {
      settings: { ...makeProfile().settings, defaultLocation: "home" },
    });
    render(<NextWorkoutHero />);
    const substitute = expectedPlan("home").plan.find((e) => e.substituteExerciseId)!;
    expect(await screen.findByText(displayLiftName(substitute.substituteExerciseId!))).toBeInTheDocument();
  });

  it("lists the two workouts after the next one, below START, linking to the upcoming screen", async () => {
    await seedDemo();
    render(<NextWorkoutHero />);
    const next = expectedPlan("gym").templateId;
    const then = getNextWorkoutId(next);
    const after = getNextWorkoutId(then);
    const named = (id: string) => {
      const t1 = WORKOUT_TEMPLATES[id].exercises.find((e) => e.tier === "T1")!.exerciseId;
      return `${id} ${dayName(t1, "")}`;
    };
    const line = await screen.findByRole("link", { name: /^Coming up:/ });
    expect(line).toHaveTextContent(`Coming up: ${named(then)}, then ${named(after)}`);
    expect(line).toHaveAttribute("href", "/progress/upcoming?from=today");
    const start = screen.getByRole("link", { name: "Start workout" });
    expect(start.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("links Start workout to the configure screen", async () => {
    await seedDemo();
    render(<NextWorkoutHero />);
    const start = await screen.findByRole("link", { name: "Start workout" });
    expect(start).toHaveAttribute("href", "/workout/configure");
  });

  it("forecasts the session length and the chance of a new best, which opens the T1 lift", async () => {
    await seedDemo();
    render(<NextWorkoutHero />);
    const t1 = expectedPlan("gym").plan.find((e) => e.tier === "T1" && !e.isWarmUp)!;
    expect(await screen.findByTestId("forecast-session")).toHaveTextContent(/^\d+ min$/);
    const newBest = await screen.findByTestId("forecast-new-best");
    expect(newBest.closest("a")).toHaveAttribute("href", `/progress/lift/${t1.exerciseId}`);
    // "about" when the count leans on the effort the demo lifter usually logs.
    expect(newBest.closest("a")).toHaveTextContent(/needs \d+\+ reps|needs about \d+ reps|beats \d+/);
    // The demo history has check-ins, so the readiness tile shows a score out of 100.
    expect(await screen.findByText("Readiness")).toBeInTheDocument();
  });

  it("explains the first tier label and the first '+', once each", async () => {
    await seedDemo();
    render(<NextWorkoutHero />);
    const rows = await screen.findAllByTestId("hero-exercise");
    expect(within(rows[0]).getByRole("button", { name: "What does T1 mean?" })).toBeInTheDocument();
    const scheme = within(rows[0]).getByRole("button", { name: /^What does \d+×\d+\+ mean\?$/ });
    expect(scheme).toHaveAttribute("data-term", "amrap-plus");
    // Later rows keep plain labels: their only control is the why sheet's.
    expect(within(rows[1]).queryByRole("button", { name: /^What does/ })).toBeNull();
    expect(within(rows[1]).getByRole("button", { name: /^Why this weight for / })).toBeInTheDocument();
    expect(document.querySelectorAll('[data-term="amrap-plus"]')).toHaveLength(1);
  });

  it("shows the first workout for a new user: first-time lifts and no new-best tile", async () => {
    await initializeDatabase();
    render(<NextWorkoutHero />);
    expect(await screen.findByText("Next up · A1")).toBeInTheDocument();
    const rows = await screen.findAllByTestId("hero-exercise");
    expect(within(rows[0]).getByRole("link", { name: "Squat" })).toBeInTheDocument();
    expect(within(rows[0]).getByTestId("lift-reason")).toHaveTextContent("First time");
    await screen.findByTestId("forecast-session");
    expect(screen.queryByTestId("forecast-new-best")).toBeNull();
  });
});
