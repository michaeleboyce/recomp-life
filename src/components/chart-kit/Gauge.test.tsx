import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Gauge } from "./Gauge";

describe("Gauge", () => {
  it("shows the number and states it with its scale", () => {
    render(<Gauge value={78} label="Readiness" />);
    expect(screen.getByRole("img")).toHaveAccessibleName("Readiness 78 out of 100");
    expect(screen.getByText("78")).toBeInTheDocument();
  });

  it("fills the half ring in proportion to the value", () => {
    const { container } = render(<Gauge value={30} max={60} />);
    const arc = container.querySelector("[data-value]")!;
    expect(arc).toHaveAttribute("stroke-dasharray", "50 100");
    expect(arc).toHaveAttribute("stroke", "var(--primary)");
  });

  it("clamps out-of-range values and draws no fill at zero", () => {
    const { container, rerender } = render(<Gauge value={140} />);
    expect(container.querySelector("[data-value]")).toHaveAttribute("stroke-dasharray", "100 100");
    rerender(<Gauge value={0} />);
    expect(container.querySelector("[data-value]")).toBeNull();
  });
});
