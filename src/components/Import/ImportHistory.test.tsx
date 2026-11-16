import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { initializeDatabase } from "@/db/init";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import { buildFitbodFile, fRow } from "@/lib/import/parse/fixtures";
import { ImportHistory } from "./ImportHistory";

// Every file here is made up: invented names, dates and weights in the real column layout.

function madeUpFile(): File {
  const text = buildFitbodFile([
    fRow({ Date: "2026-10-20 10:00:00 +0000", Exercise: "Barbell Bench Press", "Weight(kg)": 68.0388555, Reps: 5, multiplier: " 1.0" }),
    fRow({ Date: "2026-10-20 10:00:00 +0000", Exercise: "Barbell Bench Press", "Weight(kg)": 68.0388555, Reps: 5, multiplier: " 1.0" }),
    fRow({ Date: "2026-10-20 10:00:00 +0000", Exercise: "Wobbly Hammer Curl", "Weight(kg)": 10 }),
    fRow({ Date: "2026-10-22 10:00:00 +0000", Exercise: "Dumbbell Bench Press", "Weight(kg)": 22.6796185, Reps: 8 }),
    fRow({ Date: "2026-10-22 10:00:00 +0000", Exercise: "Zorblax", "Weight(kg)": 5 }),
    fRow({ Date: "2026-10-23 07:00:00 +0000", Exercise: "Walking", Reps: 0, "Weight(kg)": 0, "Duration(s)": 1800, "Distance(m)": 2500 }),
    fRow({ Date: "garbage" }),
  ]);
  return new File([text], "made-up-export.csv", { type: "text/csv" });
}

function pick(file: File) {
  fireEvent.change(screen.getByTestId("import-file-input"), { target: { files: [file] } });
}

beforeEach(async () => {
  localStorage.clear();
  await clearDb();
  await initializeDatabase();
});
afterEach(() => cleanup());

describe("ImportHistory", () => {
  it("previews a file before writing anything", async () => {
    render(<ImportHistory />);
    pick(madeUpFile());
    const preview = await screen.findByTestId("import-preview");
    expect(within(preview).getByText("Fitbod export")).toBeInTheDocument();
    expect(screen.getByTestId("import-range")).toHaveTextContent(/Oct 20, 2026 to Oct 23, 2026/);
    expect(within(preview).getByText("Sessions").parentElement).toHaveTextContent("2");
    expect(within(preview).getByText("Sets").parentElement).toHaveTextContent("5");
    expect(within(preview).getByText("Cardio").parentElement).toHaveTextContent("1");
    expect(screen.getByTestId("import-rejected")).toHaveTextContent("1 row: unreadable date (row 8)");
    expect(screen.getByTestId("import-samples")).toHaveTextContent("50 lb × 2 hands");
    expect(screen.getByTestId("import-samples")).toHaveTextContent("150 lb");
    expect(within(screen.getByTestId("import-group-not")).getByText("Zorblax")).toBeInTheDocument();
    expect(within(screen.getByTestId("import-group-muscles")).getByText("Wobbly Hammer Curl")).toBeInTheDocument();
    expect(await db.importedSessions.count()).toBe(0);
    expect(await db.activities.count()).toBe(0);
  });

  it("remembers a confirmed guess and a remapped name, and moves them to Matched", async () => {
    render(<ImportHistory />);
    pick(madeUpFile());
    await screen.findByTestId("import-preview");
    fireEvent.click(screen.getByRole("button", { name: "Confirm the muscles for Wobbly Hammer Curl" }));
    fireEvent.click(screen.getByRole("button", { name: "Change what Zorblax maps to" }));
    fireEvent.change(screen.getByLabelText("Map to a library exercise"), { target: { value: "bicep_curls" } });
    await waitFor(() => expect(screen.queryByTestId("import-group-not")).toBeNull());
    expect(screen.queryByTestId("import-group-muscles")).toBeNull();
    const matched = screen.getByTestId("import-group-matched");
    expect(within(matched).getByText("Zorblax")).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem("recomp-import-mappings")!);
    expect(stored.zorblax).toEqual({ kind: "exercise", exerciseId: "bicep_curls" });
  });

  it("imports with a result summary, suggests starting weights, and undoes the import", async () => {
    render(<ImportHistory />);
    pick(madeUpFile());
    await screen.findByTestId("import-preview");
    fireEvent.click(screen.getByRole("button", { name: "Import 2 sessions" }));
    const result = await screen.findByTestId("import-result");
    expect(result).toHaveTextContent("Added 2 sessions (5 sets) and 1 activity.");
    expect(await db.importedSessions.count()).toBe(2);
    expect(await db.activities.count()).toBe(1);

    // Starting weights are only suggested.
    const weights = await screen.findByTestId("starting-weights");
    expect(within(weights).getAllByTestId("starting-weight").length).toBeGreaterThan(0);
    // The rules behind them: the starting weights, and the ratio a home exercise goes through.
    expect(weights.querySelector('[data-evidence="starting-weights"]')).not.toBeNull();
    expect(within(weights).getByTestId("starting-weights-home").querySelector('[data-evidence="transfer-ratio"]')).not.toBeNull();
    const benchBefore = (await db.liftStates.get("bench"))!.t1Weight;
    expect(benchBefore).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Undo this import" }));
    await screen.findByText("Import undone");
    expect((await db.importedSessions.toArray()).every((s) => s.deletedAt != null)).toBe(true);
    expect((await db.activities.toArray()).every((a) => a.deletedAt != null)).toBe(true);
    expect((await db.liftStates.get("bench"))!.t1Weight).toBe(benchBefore);
  });

  it("adds nothing when the same file is imported again", async () => {
    render(<ImportHistory />);
    pick(madeUpFile());
    await screen.findByTestId("import-preview");
    fireEvent.click(screen.getByRole("button", { name: "Import 2 sessions" }));
    await screen.findByTestId("import-result");

    pick(madeUpFile());
    await screen.findByTestId("import-preview");
    expect(screen.getByText("Already imported")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Import cardio" }));
    expect(await screen.findByTestId("import-result")).toHaveTextContent(/Nothing new to add/);
    expect(await db.importedSessions.count()).toBe(2);
    expect(await db.activities.count()).toBe(1);
  });

  it("confirms a starting weight only when asked", async () => {
    render(<ImportHistory />);
    pick(madeUpFile());
    await screen.findByTestId("import-preview");
    fireEvent.click(screen.getByRole("button", { name: "Import 2 sessions" }));
    await screen.findByTestId("starting-weights");
    const adjustmentsBefore = await db.liftAdjustments.count();
    const rows = screen.getAllByTestId("starting-weight");
    const bench = rows.find((r) => r.textContent?.includes("Bench") && r.querySelector("[data-tier=T1]"))!;
    const input = within(bench).getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "120" } });
    fireEvent.click(within(bench).getByRole("button", { name: /Use 120 lb/ }));
    await within(bench).findByText(/Saved: 120 lb/);
    expect(await db.liftAdjustments.count()).toBe(adjustmentsBefore + 1);
  });

  it("explains a file it cannot read", async () => {
    render(<ImportHistory />);
    pick(new File(["name,thing\na,b\n"], "other.csv", { type: "text/csv" }));
    expect(await screen.findByText("Could not use other.csv")).toBeInTheDocument();
    expect(await db.importedSessions.count()).toBe(0);
  });
});
