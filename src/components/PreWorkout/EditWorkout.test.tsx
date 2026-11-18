import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { initializeDatabase } from "@/db/init";
import { clearDb, seedFixtureStartingWeights } from "@/lib/data/testUtils";
import { updateSettings } from "@/lib/data/records";
import { DaySelector } from "./DaySelector";
import { EditWorkoutButton } from "./EditWorkoutButton";
import { PlannedExerciseList } from "./PlannedExerciseList";
import { useWorkoutSetup, type WorkoutSetup } from "./useWorkoutSetup";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

/** The pieces of the Configure page that edit and show the workout. */
function Harness({ templateId }: { templateId: string }) {
  const setup = useWorkoutSetup(templateId);
  if (setup.isLoading || !setup.templateId) return null;
  return (
    <>
      <DaySelector
        value={setup.templateId}
        dueTemplateId={setup.dueTemplateId}
        onChange={setup.setTemplateId}
      />
      <PlannedExerciseList plan={setup.plan} trainingPhase={setup.trainingPhase} impact={setup.impact} />
      <EditWorkoutButton setup={setup} />
    </>
  );
}

beforeEach(async () => {
  await clearDb();
  await initializeDatabase();
  await seedFixtureStartingWeights();
  // These tests are about editing the program's lifts: no accessories chosen for them.
  await updateSettings({ accessories: "ask" });
});
afterEach(cleanup);

async function openSheet(templateId = "A1") {
  render(<Harness templateId={templateId} />);
  fireEvent.click(await screen.findByRole("button", { name: /Edit workout/ }));
  return screen.findByRole("dialog", { name: "Edit workout" });
}

const plannedNames = () =>
  screen.getAllByTestId("planned-exercise").map((li) => within(li).getAllByText(/./)[1].textContent);

describe("impact states", () => {
  it("says a lift edited back to its prescription counts toward progression", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Increase Barbell Bench Press weight" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Decrease Barbell Bench Press weight" }));
    expect(within(sheet).getByText("Counts toward progression")).toBeInTheDocument();
    // The planned list on the page says the same.
    expect(screen.getAllByText("Counts toward progression").length).toBeGreaterThan(1);
  });

  it("says a lighter lift is logged only with progression paused", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Decrease Barbell Bench Press weight" }));
    expect(within(sheet).getByText("Logged only, progression paused")).toBeInTheDocument();
    expect(screen.getAllByText("Logged only, progression paused").length).toBeGreaterThan(1);
  });

  it("says a changed scheme is logged only", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Decrease Barbell Bench Press sets" }));
    expect(within(sheet).getByText("Logged only, progression paused")).toBeInTheDocument();
  });

  it("says a removed lift is not done today and its weight is unchanged", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove Barbell Bench Press" }));
    expect(within(sheet).getByText("Not done today, weight unchanged")).toBeInTheDocument();
    expect(screen.getAllByText("Not done today, weight unchanged").length).toBeGreaterThan(1);
    expect(plannedNames()).not.toContain("Barbell Bench Press");
  });

  it("shows nothing about progression for an unedited workout, and no citation", async () => {
    const sheet = await openSheet();
    expect(within(sheet).queryByText(/progression/i)).toBeNull();
    expect(sheet.querySelector("[data-evidence='off-program-credit']")).toBeNull();
  });

  it("shows the evidence line once there is an edit", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove Barbell Bench Press" }));
    expect(sheet.querySelectorAll("[data-evidence='off-program-credit']")).toHaveLength(1);
  });
});

describe("the edit sheet", () => {
  it("swaps a lift for the top recommendation at its prescription and marks the replacement logged only", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Swap Lat Pulldown" }));
    const panel = await within(sheet).findByTestId("swap-panel");
    const recommended = await within(panel).findByRole("region", { name: "Recommended" });
    const top = within(recommended).getAllByTestId("swap-candidate")[0];
    const pick = within(top).getByRole("button", { name: /^Pick / });
    const chosen = pick.getAttribute("aria-label")!.replace(/^Pick /, "");
    const prescription = within(top).getByTestId("swap-prescription").textContent!;
    expect(chosen).not.toBe("Lat Pulldown");
    // What it does to the lift is said before confirming.
    expect(within(panel).getByTestId("swap-effect")).toHaveTextContent(/Lat Pulldown stays at its T3 weight/);
    fireEvent.click(pick);
    fireEvent.click(within(panel).getByRole("button", { name: `Swap in ${chosen}` }));

    await waitFor(() => expect(within(sheet).queryByTestId("swap-panel")).toBeNull());
    expect(within(sheet).getByText(chosen)).toBeInTheDocument();
    // The entry takes the candidate's weight (a T3 keeps its sets and reps).
    const weight = Number.parseFloat(prescription);
    if (Number.isFinite(weight)) {
      expect(sheet.querySelector(`[data-stepper-value='${chosen} weight']`)!.textContent).toContain(String(weight));
    }
    expect(within(sheet).queryByRole("button", { name: "Swap Lat Pulldown" })).toBeNull();
    expect(within(sheet).getByText("Logged only, progression paused")).toBeInTheDocument();
    expect(within(sheet).getByText("Not done today, weight unchanged")).toBeInTheDocument();
  });

  it("does not offer exercises already in the workout as swaps", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Swap Lat Pulldown" }));
    const panel = await within(sheet).findByTestId("swap-panel");
    await within(panel).findByRole("region", { name: "Recommended" });
    fireEvent.click(within(panel).getByRole("button", { name: /All exercises/ }));
    const names = within(panel)
      .getAllByTestId("swap-candidate")
      .map((row) => within(row).getByRole("button", { name: /^Pick / }).getAttribute("aria-label")!.replace(/^Pick /, ""));
    expect(names.length).toBeGreaterThan(3);
    expect(names).not.toContain("Barbell Squat");
    expect(names).not.toContain("Barbell Bench Press");
    expect(names).not.toContain("Lat Pulldown");
  });

  it("at home, a home version of the lift is done as the lift: tagged, no swap, its own weight", async () => {
    await updateSettings({ defaultLocation: "home" });
    const seen: { current: WorkoutSetup | null } = { current: null };
    function Spy() {
      const setup = useWorkoutSetup("A1");
      useEffect(() => {
        seen.current = setup;
      });
      if (setup.isLoading || !setup.templateId) return null;
      return <EditWorkoutButton setup={setup} />;
    }
    render(<Spy />);
    fireEvent.click(await screen.findByRole("button", { name: /Edit workout/ }));
    const sheet = await screen.findByRole("dialog", { name: "Edit workout" });
    fireEvent.click(within(sheet).getByRole("button", { name: "Swap DB Bench Press" }));
    const panel = await within(sheet).findByTestId("swap-panel");
    await within(panel).findByRole("region", { name: "Recommended" });
    const row = within(panel)
      .getAllByTestId("swap-candidate")
      .find((r) => within(r).queryByRole("button", { name: "Pick DB Floor Press" }))!;
    expect(within(row).getByTestId("swap-counts")).toHaveTextContent("Counts as bench press");
    const shownWeight = Number.parseFloat(within(row).getByTestId("swap-prescription").textContent!);
    fireEvent.click(within(row).getByRole("button", { name: "Pick DB Floor Press" }));
    expect(within(panel).getByTestId("swap-effect")).toHaveTextContent(
      "Counts as Bench press: DB Floor Press has its own weight and moves up on its own."
    );
    fireEvent.click(within(panel).getByRole("button", { name: "Swap in DB Floor Press" }));
    await waitFor(() => expect(within(sheet).queryByTestId("swap-panel")).toBeNull());

    // No swap edit: the plan does the bench as floor press, at the weight the row showed.
    const current = seen.current!;
    expect(current.edits).toEqual([]);
    const entry = current.plan.find((e) => !e.isWarmUp && e.exerciseId === "bench")!;
    expect(entry.substituteExerciseId).toBe("db_floor_press");
    expect(entry.weight).toBe(shownWeight);
    expect(current.prescribed.find((p) => p.exerciseId === "bench")!.home?.exerciseId).toBe("db_floor_press");
    expect(within(sheet).queryByText("Logged only, progression paused")).toBeNull();
  });

  it("swaps one lift for two: the first takes its place, the second is added", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Swap Lat Pulldown" }));
    const panel = await within(sheet).findByTestId("swap-panel");
    const recommended = await within(panel).findByRole("region", { name: "Recommended" });
    fireEvent.click(within(panel).getByRole("button", { name: "Pick more than one" }));
    const [a, b] = within(recommended)
      .getAllByTestId("swap-candidate")
      .map((row) => within(row).getByRole("button", { name: /^Pick / }).getAttribute("aria-label")!.replace(/^Pick /, ""));
    fireEvent.click(within(panel).getByRole("button", { name: `Pick ${a}` }));
    fireEvent.click(within(panel).getByRole("button", { name: `Pick ${b}` }));
    fireEvent.click(within(panel).getByRole("button", { name: "Swap in 2 exercises" }));

    await waitFor(() => expect(within(sheet).queryByTestId("swap-panel")).toBeNull());
    const rows = within(sheet).getAllByTestId("edit-entry");
    expect(rows).toHaveLength(4);
    expect(within(rows[2]).getByText(a)).toBeInTheDocument();
    expect(within(rows[3]).getByText(b)).toBeInTheDocument();
  });

  it("adds an exercise at its prescription, shown on the row, and resets to the program", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Add exercise" }));
    const choices = within(sheet).getByRole("list", { name: "Choices" });
    const first = within(choices).getAllByRole("button")[0];
    const added = first.getAttribute("aria-label")!;
    const shown = within(first).getByTestId("pick-prescription").textContent!;
    const [sets, reps] = shown.split(" × ").slice(-2).map((n) => Number.parseInt(n, 10));
    fireEvent.click(first);

    const rows = within(sheet).getAllByTestId("edit-entry");
    expect(rows).toHaveLength(4);
    expect(within(rows[3]).getByText(added)).toBeInTheDocument();
    expect(within(rows[3]).getByText(String(sets), { selector: "[data-stepper-value$='sets']" })).toBeInTheDocument();
    expect(within(rows[3]).getByText(String(reps), { selector: "[data-stepper-value$='reps']" })).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: "Reset to program" }));
    expect(within(sheet).getAllByTestId("edit-entry")).toHaveLength(3);
    expect(within(sheet).getByRole("button", { name: "Reset to program" })).toBeDisabled();
  });

  it("steps the weight by 5 lbs and never below 0", async () => {
    const sheet = await openSheet();
    const weight = () =>
      sheet.querySelector("[data-stepper-value='Lat Pulldown weight']")!.textContent;
    fireEvent.click(within(sheet).getByRole("button", { name: "Increase Lat Pulldown weight" }));
    const raised = Number.parseInt(weight()!, 10);
    for (let i = 0; i < raised / 5 + 2; i++) {
      const down = within(sheet).getByRole("button", { name: "Decrease Lat Pulldown weight" });
      if (!(down as HTMLButtonElement).disabled) fireEvent.click(down);
    }
    expect(Number.parseInt(weight()!, 10)).toBeGreaterThanOrEqual(0);
    expect(within(sheet).getByRole("button", { name: "Decrease Lat Pulldown weight" })).toBeDisabled();
  });
});

describe("weight per set", () => {
  const perSetList = (sheet: HTMLElement) =>
    within(sheet).getByRole("list", { name: "Barbell Squat sets" });
  // Each set is a chip; its steppers open when it is tapped.
  const setWeights = (sheet: HTMLElement) =>
    [...perSetList(sheet).querySelectorAll("[data-set-weight]")].map((el) =>
      Number(el.getAttribute("data-set-weight"))
    );
  const openSet = (sheet: HTMLElement, n: number) =>
    fireEvent.click(within(perSetList(sheet)).getByRole("button", { name: new RegExp(`^Set ${n}\\b`) }));

  async function perSetSheet() {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Weight per set: Barbell Squat" }));
    return sheet;
  }

  it("gives each set its own weight and reps, prefilled from the plan, and names the working sets", async () => {
    const sheet = await perSetSheet();
    expect(within(sheet).getByRole("button", { name: "Weight per set: Barbell Squat" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(within(perSetList(sheet)).getAllByRole("listitem")).toHaveLength(5);
    expect(setWeights(sheet)).toEqual([190, 190, 190, 190, 190]);
    expect(within(sheet).getByTestId("working-sets")).toHaveTextContent(
      "Sets 1 to 5 are the working sets: pass or fail is judged on them."
    );
    expect(within(sheet).getByText("Counts toward progression")).toBeInTheDocument();
  });

  it("ramps up to the working weight, and the lift still counts", async () => {
    const sheet = await perSetSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Ramp up" }));
    expect(setWeights(sheet)).toEqual([150, 170, 190, 190, 190, 190, 190]);
    openSet(sheet, 1);
    expect(within(sheet).getByRole("button", { name: "Set 1: ramp" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByTestId("working-sets")).toHaveTextContent("Sets 3 to 7 are the working sets");
    expect(within(sheet).getByText("Counts toward progression")).toBeInTheDocument();
  });

  it("adds a back-off set after the working sets", async () => {
    const sheet = await perSetSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Back-off set" }));
    expect(setWeights(sheet)).toEqual([190, 190, 190, 190, 190, 150]);
    openSet(sheet, 6);
    expect(within(sheet).getByRole("button", { name: "Set 6: back-off" })).toHaveAttribute("aria-pressed", "true");
    expect(within(sheet).getByText("Counts toward progression")).toBeInTheDocument();
  });

  it("changes one set by the plate step, and a working set turned into a ramp leaves the lift logged only", async () => {
    const sheet = await perSetSheet();
    openSet(sheet, 1);
    fireEvent.click(within(sheet).getByRole("button", { name: "Decrease Barbell Squat set 1 weight" }));
    expect(setWeights(sheet)).toEqual([185, 190, 190, 190, 190]);
    fireEvent.click(within(sheet).getByRole("button", { name: "Set 1: ramp" }));
    expect(within(sheet).getByTestId("working-sets")).toHaveTextContent("Sets 2 to 5 are the working sets");
    expect(within(sheet).getByText("Logged only, progression paused")).toBeInTheDocument();
  });

  it("removes and adds sets", async () => {
    const sheet = await perSetSheet();
    openSet(sheet, 5);
    fireEvent.click(within(sheet).getByRole("button", { name: "Remove set 5 of Barbell Squat" }));
    expect(setWeights(sheet)).toHaveLength(4);
    fireEvent.click(within(sheet).getByRole("button", { name: "Add a set to Barbell Squat" }));
    expect(setWeights(sheet)).toHaveLength(5);
  });

  it("goes back to one weight for every set when switched off", async () => {
    const sheet = await perSetSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Ramp up" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Weight per set: Barbell Squat" }));
    expect(within(sheet).queryByRole("list", { name: "Barbell Squat sets" })).toBeNull();
    expect(within(sheet).getByText("5", { selector: "[data-stepper-value='Barbell Squat sets']" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Reset to program" })).toBeDisabled();
  });
});

describe("the day selector", () => {
  it("marks the due day and explains when another day is chosen", async () => {
    render(<Harness templateId="A1" />);
    const group = await screen.findByRole("radiogroup", { name: "Workout day" });
    expect(within(group).getByRole("radio", { name: "A1 · due" })).toBeChecked();
    expect(screen.queryByText(/stays next/)).toBeNull();

    fireEvent.click(within(group).getByRole("radio", { name: "B1" }));
    await waitFor(() => expect(within(group).getByRole("radio", { name: "B1" })).toBeChecked());
    expect(screen.getByText(/B1.s lifts will progress if done as prescribed\. A1 stays next\./)).toBeInTheDocument();
    expect(plannedNames()[0]).toBe("Barbell OHP");
  });
});

describe("prescribedSetsFor", () => {
  it("is the prescription's sets for the lift or its home exercise, and nothing for anything else", async () => {
    const { prescribedSetsFor } = await import("./EditWorkoutSheet");
    const prescribed = [
      { exerciseId: "squat", tier: "T1" as const, weight: 200, sets: 5, reps: 3 },
      {
        exerciseId: "bench",
        tier: "T2" as const,
        weight: 135,
        sets: 3,
        reps: 10,
        home: { exerciseId: "db_bench", weight: 45, perHand: true, sets: 3, reps: 10 },
      },
    ];
    expect(prescribedSetsFor({ exerciseId: "squat", tier: "T1" }, prescribed)).toEqual(
      Array.from({ length: 5 }, () => ({ weight: 200, reps: 3 }))
    );
    expect(prescribedSetsFor({ exerciseId: "bench", substituteExerciseId: "db_bench", tier: "T2" }, prescribed)).toHaveLength(3);
    expect(prescribedSetsFor({ exerciseId: "bench", substituteExerciseId: "db_bench", tier: "T2" }, prescribed)?.[0]).toEqual({ weight: 45, reps: 10 });
    expect(prescribedSetsFor({ exerciseId: "bench", tier: "T2" }, prescribed)).toBeUndefined();
    expect(prescribedSetsFor({ exerciseId: "db_row", tier: "T3" }, prescribed)).toBeUndefined();
  });
});
