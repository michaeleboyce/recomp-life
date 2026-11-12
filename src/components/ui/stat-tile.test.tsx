import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { StatTile } from "./stat-tile";

afterEach(cleanup);

describe("StatTile", () => {
  it("renders label, mono value and unit", () => {
    render(<StatTile label="Bodyweight" value="226.0" unit="lb" />);
    expect(screen.getByText("Bodyweight")).toHaveClass("text-xs", "text-muted-foreground");
    expect(screen.getByText("226.0")).toHaveClass("font-mono", "font-bold", "text-[22px]");
    expect(screen.getByText("lb")).toBeInTheDocument();
  });

  it("renders as a plain div without href", () => {
    render(<StatTile label="Squat" value={300} className="extra" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    const tile = screen.getByText("Squat").closest("[data-slot=stat-tile]")!;
    expect(tile.tagName).toBe("DIV");
    expect(tile).toHaveClass("bg-card", "rounded-[14px]", "extra");
    expect(tile).not.toHaveClass("border");
  });

  it("renders delta and sparkline slots when given", () => {
    render(
      <StatTile
        label="Squat"
        value={300}
        delta={<span>+5</span>}
        sparkline={<svg data-testid="spark" />}
      />
    );
    expect(screen.getByText("+5")).toBeInTheDocument();
    expect(screen.getByTestId("spark")).toBeInTheDocument();
  });

  it("omits optional slots when absent", () => {
    const { container } = render(<StatTile label="Squat" value={300} />);
    expect(container.querySelector("[data-slot=stat-tile-delta]")).toBeNull();
    expect(container.querySelector("[data-slot=stat-tile-sparkline]")).toBeNull();
  });

  it("is a single link with a focus ring when href is given", () => {
    render(<StatTile label="Squat" value={300} href="/progress/lift/squat" />);
    const link = screen.getByRole("link", { name: /Squat/ });
    expect(link).toHaveAttribute("href", "/progress/lift/squat");
    expect(link.className).toContain("focus-visible:ring");
  });
});
