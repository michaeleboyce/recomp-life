import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { GymDebtSection } from "./StrengthSections";
import type { GymDebtItem } from "./sections";

describe("GymDebtSection", () => {
  it("prints each lift's dumbbell equivalent with its own unit", () => {
    const items: GymDebtItem[] = [
      { exerciseId: "bench", name: "Barbell Bench Press", t1Weight: 200, dbEquivalent: 85, overage: 35, perHand: true, dbLabel: "85 lbs/hand" },
      { exerciseId: "squat", name: "Barbell Squat", t1Weight: 260, dbEquivalent: 180, overage: 130, perHand: false, dbLabel: "180 lbs" },
    ];
    render(<GymDebtSection items={items} maxDumbbellWeight={50} />);
    expect(screen.getByText("DB equiv 85 lbs/hand")).toBeInTheDocument();
    // One dumbbell held in both hands: not "per hand".
    expect(screen.getByText("DB equiv 180 lbs")).toBeInTheDocument();
    expect(screen.queryByText("DB equiv 180 lbs/hand")).toBeNull();
  });
});
