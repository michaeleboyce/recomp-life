import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sparkline } from "./Sparkline";

describe("Sparkline", () => {
  it("draws a polyline with min and max on the edges of the box", () => {
    const { container } = render(<Sparkline points={[10, 20, 15]} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "64");
    expect(svg).toHaveAttribute("height", "24");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector("polyline")).toHaveAttribute("points", "1,23 32,1 63,12");
  });

  it("accepts metric points and a custom size", () => {
    const { container } = render(
      <Sparkline points={[{ t: 1, v: 3 }, { t: 2, v: 1 }]} width={100} height={20} />
    );
    expect(container.querySelector("polyline")).toHaveAttribute("points", "1,1 99,19");
  });

  it("draws a dot for a single point", () => {
    const { container } = render(<Sparkline points={[5]} />);
    expect(container.querySelector("polyline")).toBeNull();
    const dot = container.querySelector("circle")!;
    expect(dot).toHaveAttribute("cx", "32");
    expect(dot).toHaveAttribute("cy", "12");
  });

  it("draws a flat series along the middle", () => {
    const { container } = render(<Sparkline points={[4, 4, 4]} />);
    expect(container.querySelector("polyline")).toHaveAttribute("points", "1,12 32,12 63,12");
  });

  it("keeps its footprint with no data", () => {
    const { container } = render(<Sparkline points={[]} />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "64");
    expect(container.querySelector("polyline")).toBeNull();
  });

  it("colours by tone through tokens", () => {
    const { container } = render(<Sparkline points={[1, 2]} tone="warn" />);
    expect(container.querySelector("polyline")).toHaveAttribute("stroke", "var(--chart-warn)");
  });

  it("can be exposed to assistive technology with a label", () => {
    render(<Sparkline points={[1, 2]} ariaHidden={false} ariaLabel="Rising" />);
    expect(screen.getByRole("img", { name: "Rising" })).toBeInTheDocument();
  });
});
