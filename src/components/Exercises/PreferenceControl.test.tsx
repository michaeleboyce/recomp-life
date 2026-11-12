import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { db } from "@/db/local";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { clearDb } from "@/lib/data/testUtils";
import { PreferenceControl } from "./PreferenceControl";

async function settings() {
  return (await db.userProfile.toCollection().first())!.settings;
}

describe("PreferenceControl", () => {
  beforeEach(async () => {
    await clearDb();
    await db.userProfile.add({
      ...DEFAULT_USER_PROFILE,
      id: "p1",
      clientId: "p1",
      createdAt: new Date(),
    });
  });

  it("renders nothing for a main lift", async () => {
    const { container } = render(<PreferenceControl exerciseId="squat" />);
    await waitFor(async () => expect(await settings()).toBeTruthy());
    expect(container.querySelector("[data-preference-control]")).toBeNull();
  });

  it("marks an accessory preferred everywhere", async () => {
    render(<PreferenceControl exerciseId="incline_db_press" />);
    fireEvent.click(await screen.findByRole("button", { name: "Preferred" }));
    await waitFor(async () =>
      expect((await settings()).exercisePreferences?.incline_db_press).toBe("preferred")
    );
    expect((await settings()).exercisePreferencesByLocation ?? {}).toEqual({});
  });

  it("starts on the workout's location and stores a location-only setting", async () => {
    render(<PreferenceControl exerciseId="pendulum_squat" defaultScope="gym" />);
    fireEvent.click(await screen.findByRole("button", { name: "Preferred" }));
    await waitFor(async () =>
      expect((await settings()).exercisePreferencesByLocation?.gym?.pendulum_squat).toBe(
        "preferred"
      )
    );
    expect((await settings()).exercisePreferences?.pendulum_squat).toBeUndefined();
    expect((await settings()).exercisePreferencesByLocation?.home).toBeUndefined();
  });

  it("shows the current choice as pressed and marks the profile for sync", async () => {
    render(<PreferenceControl exerciseId="db_pullover" defaultScope="home" />);
    const blocked = await screen.findByRole("button", { name: "Blocked" });
    fireEvent.click(blocked);
    await waitFor(() => expect(blocked.getAttribute("aria-pressed")).toBe("true"));
    expect((await db.userProfile.toCollection().first())!.synced).toBe(false);
  });
});
