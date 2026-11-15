import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Starburst } from "./starburst";

describe("Starburst", () => {
  it("draws the requested number of rays in currentColor, hidden from assistive tech", () => {
    const { container } = render(<Starburst rays={12} className="size-20 text-primary" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("size-20");
    expect(svg.querySelectorAll("line")).toHaveLength(12);
    expect(svg.querySelector("g")).toHaveAttribute("stroke", "currentColor");
  });

  it("defaults to sixteen rays", () => {
    const { container } = render(<Starburst />);
    expect(container.querySelectorAll("line")).toHaveLength(16);
  });
});
