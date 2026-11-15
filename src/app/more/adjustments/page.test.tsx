import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb } from "@/lib/data/testUtils";
import { recordAdjustment } from "@/lib/data/adjustments";
import { Toaster } from "@/components/ui/toast";
import {
  dateLabel,
  isStartEntry,
  linkLabel,
  orderForLog,
} from "@/components/Transparency/AdjustmentLog";
import type { AdjustmentEntry } from "@/types";
import AdjustmentsPage from "./page";

beforeEach(async () => {
  cleanup();
  await clearDb();
  await initializeDatabase();
});

const entry = (id: string, at: Date): AdjustmentEntry => ({
  id,
  at,
  source: "progression",
  title: id,
  detail: "",
});

describe("log helpers", () => {
  it("shows starting weights last, labelled Start, never as a 1970 date", () => {
    const start = entry("start", new Date(0));
    const old = entry("old", new Date(2026, 0, 3));
    const recent = entry("recent", new Date(2026, 10, 5));
    // The feed is newest first, so a start would already be last; the order holds anyway.
    expect(orderForLog([start, recent, old]).map((e) => e.id)).toEqual(["recent", "old", "start"]);
    expect(isStartEntry(start)).toBe(true);
    expect(dateLabel(start, new Date(2026, 10, 15))).toEqual({ top: "Start" });
  });

  it("dates today's entries Today with the time", () => {
    const now = new Date(2026, 10, 15, 12, 0);
    expect(dateLabel(entry("a", new Date(2026, 10, 15, 7, 2)), now).top).toBe("Today");
  });

  it("names the link by where it goes", () => {
    expect(linkLabel("/research?rule=x")).toBe("Rule");
    expect(linkLabel("/progress/forecasts/record")).toBe("Forecast");
    expect(linkLabel("/progress/lift/squat")).toBe("Lift");
  });
});

describe("Adjustment log page", () => {
  it("lists a change made by hand with Undo, and undoing it records a second change", async () => {
    render(
      <>
        <AdjustmentsPage />
        <Toaster />
      </>
    );
    await recordAdjustment({
      exerciseId: "squat",
      source: "manual",
      set: { t1Weight: 185 },
    });

    const row = await waitFor(() => {
      const undo = screen.getAllByRole("button", { name: "Undo" })[0];
      expect(undo).toBeInTheDocument();
      return undo.closest("li") as HTMLElement;
    });
    expect(within(row).getByRole("link", { name: /Lift/ })).toHaveAttribute(
      "href",
      "/progress/lift/squat"
    );

    fireEvent.click(within(row).getByRole("button", { name: "Undo" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Undo this change?");
    fireEvent.click(within(dialog).getByRole("button", { name: "Undo the change" }));

    await waitFor(() => expect(screen.getByText("Change undone.")).toBeInTheDocument());
    expect((await db.liftAdjustments.toArray()).filter((a) => a.source === "manual")).toHaveLength(2);
  });

  it("puts the starting weights last under Start and filters by group", async () => {
    render(<AdjustmentsPage />);
    await waitFor(() => expect(screen.getAllByText("Start").length).toBeGreaterThan(0));
    expect(screen.queryByText(/1970/)).toBeNull();
    const chips = screen.getByRole("radiogroup", { name: "Filter the log" });
    expect(within(chips).getByRole("radio", { name: /^All/ })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(within(chips).getByRole("radio", { name: "Forecasts" }));
    // Rule changes about projections show under Forecasts; starting weights do not.
    expect(screen.getAllByText(/^Rule updated/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Start")).toBeNull();
  });
});
