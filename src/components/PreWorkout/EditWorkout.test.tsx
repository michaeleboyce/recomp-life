import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { initializeDatabase } from "@/db/init";
import { clearDb } from "@/lib/data/testUtils";
import { DaySelector } from "./DaySelector";
import { EditWorkoutButton } from "./EditWorkoutButton";
import { PlannedExerciseList } from "./PlannedExerciseList";
import { useWorkoutSetup } from "./useWorkoutSetup";

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
  it("swaps a lift for a candidate and marks the replacement logged only", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Swap Lat Pulldown" }));
    const choices = within(sheet).getByRole("list", { name: "Choices" });
    const first = within(choices).getAllByRole("button")[0];
    const chosen = first.textContent!;
    expect(chosen).not.toBe("Lat Pulldown");
    fireEvent.click(first);

    expect(within(sheet).getByText(chosen)).toBeInTheDocument();
    expect(within(sheet).queryByRole("button", { name: "Swap Lat Pulldown" })).toBeNull();
    expect(within(sheet).getByText("Logged only, progression paused")).toBeInTheDocument();
    expect(within(sheet).getByText("Not done today, weight unchanged")).toBeInTheDocument();
  });

  it("does not offer exercises already in the workout as swaps", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Swap Lat Pulldown" }));
    const names = within(within(sheet).getByRole("list", { name: "Choices" }))
      .getAllByRole("button")
      .map((b) => b.textContent);
    expect(names).not.toContain("Barbell Squat");
    expect(names).not.toContain("Barbell Bench Press");
    expect(names).not.toContain("Lat Pulldown");
  });

  it("adds an exercise at 3 x 12 and resets to the program", async () => {
    const sheet = await openSheet();
    fireEvent.click(within(sheet).getByRole("button", { name: "Add exercise" }));
    const choices = within(sheet).getByRole("list", { name: "Choices" });
    const first = within(choices).getAllByRole("button")[0];
    const added = first.textContent!;
    fireEvent.click(first);

    const rows = within(sheet).getAllByTestId("edit-entry");
    expect(rows).toHaveLength(4);
    expect(within(rows[3]).getByText(added)).toBeInTheDocument();
    expect(within(rows[3]).getByText("3", { selector: "[data-stepper-value$='sets']" })).toBeInTheDocument();
    expect(within(rows[3]).getByText("12", { selector: "[data-stepper-value$='reps']" })).toBeInTheDocument();

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
