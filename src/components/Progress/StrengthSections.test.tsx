import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GymDebtSection } from "./StrengthSections";
import type { GymDebtItem } from "./sections";

describe("GymDebtSection", () => {
  it("says what each lift is trained as at home and the barbell weight back at the gym", () => {
    const items: GymDebtItem[] = [
      {
        exerciseId: "squat",
        name: "Barbell Squat",
        t1Weight: 245,
        home: { exerciseId: "bulgarian_split_squat", weight: 80, perHand: true },
        gymWeight: 255,
        homeLabel: "Trained at home: Bulgarian split squat, 80 lbs a hand",
        gymLabel: "255 lbs",
      },
    ];
    render(<GymDebtSection items={items} maxDumbbellWeight={80} />);
    expect(screen.getByText("Trained at home: Bulgarian split squat, 80 lbs a hand")).toBeInTheDocument();
    expect(screen.getByText("255 lbs")).toBeInTheDocument();
    expect(screen.getByText("back at the gym")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Waiting for gym" })).toHaveTextContent(
      "At home these lifts are at your heaviest dumbbell (80 lbs)."
    );
    // No "needs" or "over" number: the lift is still being trained.
    expect(screen.queryByText(/over|DB equiv/)).toBeNull();
  });
});
