import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LocationChip } from "./location-chip";

afterEach(cleanup);

describe("LocationChip", () => {
  it("shows the gym in the accent treatment", () => {
    render(<LocationChip location="gym" />);
    const chip = screen.getByText("Gym").closest("[data-slot=location-chip]")!;
    expect(chip).toHaveAttribute("data-location", "gym");
    expect(chip.className).toContain("text-accent-primary");
  });

  it("shows home in the info treatment, with optional detail", () => {
    render(<LocationChip location="home" detail="80 lb dumbbells" size="sm" />);
    const chip = screen.getByText("Home").closest("[data-slot=location-chip]")!;
    expect(chip.className).toContain("text-info");
    expect(chip).toHaveTextContent("Home·80 lb dumbbells");
  });
});
