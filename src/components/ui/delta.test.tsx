import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Delta } from "./delta";

afterEach(cleanup);

function el() {
  return screen.getByTestId("d");
}

describe("Delta", () => {
  it.each([
    ["up", 16, "text-success"],
    ["up", -16, "text-warning"],
    ["down", -16, "text-success"],
    ["down", 16, "text-warning"],
    ["none", 16, "text-muted-foreground"],
    ["none", -16, "text-muted-foreground"],
    ["up", 0, "text-muted-foreground"],
    ["down", 0, "text-muted-foreground"],
  ] as const)("better=%s value=%s uses %s", (better, value, cls) => {
    render(<Delta data-testid="d" value={value} better={better} />);
    expect(el()).toHaveClass(cls);
  });

  it("defaults to better=none", () => {
    render(<Delta data-testid="d" value={3} />);
    expect(el()).toHaveClass("text-muted-foreground");
  });

  it("shows a plus sign and spells it out", () => {
    render(<Delta data-testid="d" value={16} better="up" />);
    expect(el()).toHaveTextContent("+16");
    expect(el()).toHaveAttribute("aria-label", "up 16");
    expect(el()).toHaveClass("font-mono");
  });

  it("uses a true minus sign with unit, suffix and format", () => {
    render(
      <Delta
        data-testid="d"
        value={-1}
        unit="lb"
        suffix="/ wk"
        better="down"
        format={(n) => n.toFixed(1)}
      />
    );
    expect(el()).toHaveTextContent("−1.0 lb / wk");
    expect(el()).toHaveAttribute("aria-label", "down 1.0 lb / wk");
  });

  it("shows zero without a sign", () => {
    render(<Delta data-testid="d" value={0} />);
    expect(el()).toHaveTextContent("0");
    expect(el()).toHaveAttribute("aria-label", "no change");
  });

  it("rounds non-integers to one decimal by default", () => {
    render(<Delta data-testid="d" value={2.345} />);
    expect(el()).toHaveTextContent("+2.3");
  });
});
