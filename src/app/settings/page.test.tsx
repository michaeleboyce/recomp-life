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

  it("gives the cloud sync card the id the More screen links to", async () => {
    render(<SettingsPage />);
    await screen.findByText("Cloud Sync");
    expect(document.getElementById("sync")).toContainElement(screen.getByText("Cloud Sync"));
  });
});
