import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RangeBar } from "./RangeBar";

describe("RangeBar", () => {
  it("places the range and point on the track and states the numbers", () => {
    const { container } = render(<RangeBar low={260} high={283} point={271} min={240} max={300} />);
    expect(
      screen.getByRole("img", { name: "Likely between 260 and 283, most likely 271" })
    ).toBeInTheDocument();
    const range = container.querySelector("[data-range]")!;
    expect(range).toHaveAttribute("x", "33.33%");
    expect(range).toHaveAttribute("width", "38.33%");
    expect(container.querySelector("[data-point]")).toHaveAttribute("cx", "51.67%");
  });

  it("pads the track around the range when no extent is given", () => {
    const { container } = render(<RangeBar low={4} high={6} />);
    expect(container.querySelector("[data-range]")).toHaveAttribute("x", "25%");
    expect(container.querySelector("[data-range]")).toHaveAttribute("width", "50%");
    expect(container.querySelector("[data-point]")).toBeNull();
    expect(screen.getByRole("img", { name: "Likely between 4 and 6" })).toBeInTheDocument();
  });

  it("clamps a point outside the track and accepts a custom label and format", () => {
    const { container } = render(
      <RangeBar low={1} high={2} point={9} min={0} max={4} formatValue={(v) => `${v} lb`} />
    );
    expect(container.querySelector("[data-point]")).toHaveAttribute("cx", "100%");
    expect(screen.getByRole("img")).toHaveAccessibleName("Likely between 1 lb and 2 lb, most likely 9 lb");
  });

  it("fills with tokens", () => {
    const { container } = render(<RangeBar low={1} high={2} point={1.5} />);
    expect(container.querySelector("[data-range]")).toHaveAttribute("fill", "var(--chart-line)");
  });
});
