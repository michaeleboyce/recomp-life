import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { initializeDatabase } from "@/db/init";
import { clearDb } from "@/lib/data/testUtils";
import { setSyncKey } from "@/lib/syncKey";
import packageJson from "../../../package.json";
import MorePage from "./page";

beforeEach(async () => {
  cleanup();
  localStorage.clear();
  await clearDb();
  await initializeDatabase();
});

const group = (name: string) => screen.getByRole("region", { name });
const link = (scope: HTMLElement, name: RegExp) => within(scope).getByRole("link", { name });

describe("More page", () => {
  it("groups every destination with its secondary line", async () => {
    render(<MorePage />);
    const training = group("Training");
    expect(link(training, /Upcoming workouts/)).toHaveAttribute("href", "/progress/upcoming");
    await waitFor(() => expect(link(training, /Upcoming workouts/)).toHaveTextContent("A1 · Squat day"));
    expect(link(training, /Exercises/)).toHaveAttribute("href", "/exercises");
    expect(link(training, /Muscles/)).toHaveAttribute("href", "/muscles");

    const tools = group("Tools");
    expect(link(tools, /Plate calculator/)).toHaveAttribute("href", "/plate-calculator");
    expect(link(tools, /1RM calculator/)).toHaveAttribute("href", "/1rm-calculator");

    const learn = group("Learn");
    expect(link(learn, /Glossary/)).toHaveAttribute("href", "/more/glossary");
    expect(link(learn, /Glossary/)).toHaveTextContent("What AMRAP, T1, RPE and the rest mean");
    expect(link(learn, /How the app coaches/)).toHaveAttribute("href", "/research");

    const you = group("You");
    await waitFor(() => expect(link(you, /Settings/)).toHaveTextContent("Cutting"));
    expect(link(you, /Settings/)).toHaveAttribute("href", "/settings");
    expect(link(you, /Cloud sync/)).toHaveAttribute("href", "/settings#sync");
    expect(link(you, /Cloud sync/)).toHaveTextContent("Off");

    expect(screen.getByText(`Version ${packageJson.version}`)).toBeInTheDocument();
  });

  it("switches the training location in place and saves it", async () => {
    render(<MorePage />);
    const row = screen.getByTestId("training-location");
    expect(row.querySelector("[data-slot=location-chip]")).toHaveAttribute("data-location", "gym");
    fireEvent.click(within(row).getByRole("button", { name: "Home" }));
    await waitFor(() =>
      expect(row.querySelector("[data-slot=location-chip]")).toHaveAttribute("data-location", "home")
    );
    const profile = await db.userProfile.toCollection().first();
    expect(profile?.settings.defaultLocation).toBe("home");
  });

  it("shows sync as on when a passphrase is saved here", async () => {
    render(<MorePage />);
    act(() => {
      setSyncKey("secret");
      window.dispatchEvent(new Event("recomp-sync-key-changed"));
    });
    expect(link(group("You"), /Cloud sync/)).toHaveTextContent("On this device");
  });
});
