import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import PlateCalculatorPage from "./page";

describe("PlateCalculatorPage", () => {
  beforeEach(clearDb);
  afterEach(cleanup);

  it("uses the stored profile's bar weight", async () => {
    const base = makeProfile();
    await db.userProfile.add({
      ...base,
      settings: {
        ...base.settings,
        equipment: { ...base.settings.equipment, barWeight: 35 },
      },
    });
    render(<PlateCalculatorPage />);
    expect(await screen.findByText("Bar: 35 lbs")).toBeInTheDocument();
  });
});
