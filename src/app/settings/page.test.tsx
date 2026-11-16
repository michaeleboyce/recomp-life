import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb } from "@/lib/data/testUtils";
import SettingsPage from "./page";

beforeEach(async () => {
  cleanup();
  await clearDb();
  await initializeDatabase();
});

const settings = async () => (await db.userProfile.toCollection().first())!.settings;

describe("settings page", () => {
  it("has a training location control near the top that saves the default", async () => {
    render(<SettingsPage />);
    const control = await screen.findByTestId("training-location");
    // First section on the page.
    const sections = document.querySelectorAll("section, [data-slot=card]");
    expect(sections[0]).toContainElement(control);
    expect(control).toHaveTextContent(/substitutions and preferences/);

    fireEvent.click(within(control).getByRole("button", { name: "Home" }));
    await waitFor(async () => expect((await settings()).defaultLocation).toBe("home"));
    await waitFor(() =>
      expect(control.querySelector("[data-slot=location-chip]")).toHaveAttribute("data-location", "home")
    );
  });

  it("labels the equipment as home equipment, with the dumbbell limit, and the gym as a full setup", async () => {
    render(<SettingsPage />);
    const intro = await screen.findByTestId("equipment-intro");
    const home = intro.querySelector("[data-location=home]")!;
    expect(home).toHaveTextContent(`dumbbells up to ${(await settings()).equipment.maxDumbbellWeight} lbs`);
    expect(intro.querySelector("[data-location=gym]")).not.toBeNull();
    expect(intro).toHaveTextContent(/full barbell setup/);
  });

  it("links to the import screen once, next to Apple Health", async () => {
    render(<SettingsPage />);
    const imports = await screen.findByRole("region", { name: "Imports" });
    const links = within(imports).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/settings/health", "/settings/import"]);
    expect(screen.getAllByRole("link", { name: /Import history/ })).toHaveLength(1);
  });

  it("shows no diet target until one is set, and saves the one entered", async () => {
    await db.userProfile.toCollection().modify((p) => {
      p.settings.trainingPhase = { mode: "maintaining" };
    });
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Cutting/i }));
    await waitFor(async () => expect((await settings()).trainingPhase.mode).toBe("cutting"));
    // No made-up targets are filled in when switching to cutting.
    expect((await settings()).trainingPhase).toEqual({ mode: "cutting" });

    const deficit = await screen.findByRole("button", { name: "Daily deficit: not set" });
    expect(deficit).toHaveTextContent("Not set");
    expect(screen.getByRole("button", { name: "Protein target: not set" })).toHaveTextContent("Not set");

    fireEvent.click(deficit);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(null);
    fireEvent.change(input, { target: { value: "500" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(async () => expect((await settings()).trainingPhase.dailyDeficit).toBe(500));
    expect(await screen.findByRole("button", { name: "Daily deficit: 500 cal" })).toHaveTextContent("500 cal");
    expect((await settings()).trainingPhase.proteinGramsPerDay).toBeUndefined();
  });

  it("gives the cloud sync card the id the More screen links to", async () => {
    render(<SettingsPage />);
    await screen.findByText("Cloud Sync");
    expect(document.getElementById("sync")).toContainElement(screen.getByText("Cloud Sync"));
  });
});
