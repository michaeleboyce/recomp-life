import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Logo, LOCKUP_RATIO } from "./logo";

afterEach(cleanup);

describe("Logo", () => {
  it("renders the square mark by default, named for assistive tech", () => {
    render(<Logo />);
    const svg = screen.getByRole("img", { name: "ReComp Life" });
    expect(svg).toHaveAttribute("width", "32");
    expect(svg).toHaveAttribute("height", "32");
    expect(svg).toHaveAttribute("viewBox", "64 64 384 384");
    expect(svg.querySelector("text")).toBeNull();
  });

  it("sizes the mark from the size prop", () => {
    render(<Logo variant="mark" size={180} />);
    const svg = screen.getByRole("img");
    expect(svg).toHaveAttribute("width", "180");
    expect(svg).toHaveAttribute("height", "180");
  });

  it("renders the lockup with the mark and the wordmark at the lockup ratio", () => {
    render(<Logo variant="lockup" size={24} />);
    const svg = screen.getByRole("img", { name: "ReComp Life" });
    expect(svg).toHaveAttribute("height", "24");
    expect(Number(svg.getAttribute("width"))).toBeCloseTo(24 * LOCKUP_RATIO, 1);
    expect(svg.querySelector("[data-part=plate]")).not.toBeNull();
    expect(svg.querySelector("text")).toHaveTextContent("RECOMP LIFE");
    expect(svg.querySelector("text")).toHaveAttribute("fill", "currentColor");
  });

  it("draws with theme tokens and falls back to the brand palette", () => {
    const { container } = render(<Logo />);
    const fills = Array.from(container.querySelectorAll("circle, polygon")).map((el) =>
      el.getAttribute("fill")
    );
    expect(fills[0]).toBe("var(--logo-plate, var(--stripe-1, #ef7a4a))");
    expect(fills).toContain("var(--logo-hub, var(--stripe-2, #e0a93b))");
    expect(fills).toContain("var(--logo-well, #1b1512)");
    expect(fills).toContain("var(--logo-sleeve, #f3e9d8)");
  });

  it("passes extra props through to the svg", () => {
    render(<Logo className="shrink-0" data-testid="logo" />);
    expect(screen.getByTestId("logo")).toHaveClass("shrink-0");
  });
});
