import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb } from "@/lib/data/testUtils";
import { getHealthSettings } from "@/lib/health/deviceSettings";
import { HEALTH_DEMO_KEY } from "@/native/appleHealth";
import { AppleHealthSettings, describeImport } from "./AppleHealthSettings";

// The demo data is built from the clock, so pin it to a local midday. Only
// Date is faked: timers stay real for the async queries.
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 10, 12, 0, 0));
  localStorage.clear();
  await clearDb();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("describeImport", () => {
  const none = { weighIns: 0, runs: 0, activities: 0, matched: 0, sessions: 0, days: 0 };

  it("says so when there is nothing new", () => {
    expect(describeImport(none)).toBe("Nothing new in Apple Health.");
  });

  it("lists what was added in plain words", () => {
    expect(describeImport({ ...none, weighIns: 2, runs: 1, days: 30 })).toBe(
      "Added 2 weigh-ins, 1 run and 30 days of health data."
    );
  });

  it("mentions linked sessions and heart rate", () => {
    expect(describeImport({ ...none, matched: 1, sessions: 2 })).toBe(
      "1 session you had logged by hand was linked, not duplicated. Heart rate was added to 2 lifting sessions."
    );
  });
});

describe("AppleHealthSettings", () => {
  it("explains that Apple Health needs the iPhone app when it is unavailable", async () => {
    render(<AppleHealthSettings />);
    expect(await screen.findByText("Apple Health needs the iPhone app")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Apple Health" })).toBeNull();
  });

  it("connects, imports and reports what was added", async () => {
    localStorage.setItem(HEALTH_DEMO_KEY, "1");
    render(<AppleHealthSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Connect Apple Health" }));

    expect(await screen.findByText(/^Added 30 weigh-ins/)).toBeInTheDocument();
    expect(getHealthSettings().connected).toBe(true);
    expect(getHealthSettings().lastImportAt).not.toBeNull();
    expect(await db.bodyweight.count()).toBe(30);
    expect(await db.healthDaily.count()).toBeGreaterThanOrEqual(30);
    expect(await db.runs.count()).toBeGreaterThan(0);
    expect((await db.runs.toArray()).every((run) => run.perceivedEffort === null)).toBe(true);

    // Importing again finds nothing new.
    fireEvent.click(screen.getByRole("button", { name: "Import now" }));
    expect(await screen.findByText("Nothing new in Apple Health.")).toBeInTheDocument();
    expect(await db.bodyweight.count()).toBe(30);
  });

  it("imports only the categories left switched on", async () => {
    localStorage.setItem(HEALTH_DEMO_KEY, "1");
    render(<AppleHealthSettings />);
    await screen.findByRole("button", { name: "Connect Apple Health" });
    fireEvent.click(screen.getByRole("switch", { name: /Bodyweight/ }));
    fireEvent.click(screen.getByRole("switch", { name: /Workouts/ }));
    await waitFor(() => expect(getHealthSettings().categories).toEqual(["sleep", "daily"]));

    fireEvent.click(screen.getByRole("button", { name: "Connect Apple Health" }));
    expect(await screen.findByText(/days of health data/)).toBeInTheDocument();
    expect(await db.bodyweight.count()).toBe(0);
    expect(await db.runs.count()).toBe(0);
  });

  it("stops importing on request and keeps what was imported", async () => {
    localStorage.setItem(HEALTH_DEMO_KEY, "1");
    render(<AppleHealthSettings />);
    fireEvent.click(await screen.findByRole("button", { name: "Connect Apple Health" }));
    await screen.findByText(/^Added/);
    fireEvent.click(screen.getByRole("button", { name: "Stop importing on this iPhone" }));
    expect(await screen.findByRole("button", { name: "Connect Apple Health" })).toBeInTheDocument();
    expect(getHealthSettings().connected).toBe(false);
    expect(await db.bodyweight.count()).toBe(30);
  });
});
