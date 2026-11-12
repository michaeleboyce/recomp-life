import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeLiftState, makeProfile } from "@/lib/data/testUtils";
import GymDebtBanner from "./GymDebtBanner";

beforeEach(clearDb);

describe("GymDebtBanner", () => {
  it("lists barbell lifts whose dumbbell equivalent exceeds the home maximum", async () => {
    const profile = makeProfile();
    await db.userProfile.add({
      ...profile,
      settings: {
        ...profile.settings,
        equipment: { ...profile.settings.equipment, maxDumbbellWeight: 10 },
      },
    });
    await db.liftStates.add(makeLiftState({ exerciseId: "squat", t1Weight: 300, t2Weight: 0 }));
    render(<GymDebtBanner />);
    expect(await screen.findByText(/waiting for gym/)).toBeInTheDocument();
    expect(screen.getByText(/300 lbs/)).toBeInTheDocument();
  });
});
