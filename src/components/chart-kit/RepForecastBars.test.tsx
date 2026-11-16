import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { RepForecastBars, repForecastColumns } from "./RepForecastBars";

// Indexed from 0 reps; the last entry is "8 or more".
const pmf = [0, 0, 0, 0.12, 0.3, 0.31, 0.18, 0.07, 0.02];

describe("repForecastColumns", () => {
  it("returns one column per rep count, the last meaning that many or more", () => {
    const cols = repForecastColumns(pmf, 3, [4, 6]);
    expect(cols.map((c) => c.label)).toEqual(["3", "4", "5", "6", "7", "8+"]);
    expect(cols.map((c) => c.inRange)).toEqual([false, true, true, true, false, false]);
  });

  it("folds the tail into the last column when capped", () => {
    const cols = repForecastColumns(pmf, 3, [4, 6], 6);
    expect(cols.map((c) => c.label)).toEqual(["3", "4", "5", "6+"]);
    expect(cols[3].probability).toBeCloseTo(0.27);
  });
});

describe("RepForecastBars", () => {
  it("shows a percentage and a bar per rep count, in a grid of matching columns", () => {
    const { container } = render(<RepForecastBars pmf={pmf} firstReps={3} range={[4, 6]} gap={6} />);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.style.gridTemplateColumns).toBe("repeat(6, minmax(0, 1fr))");
    expect(grid.style.columnGap).toBe("6px");
    expect(screen.getByText("12%")).toBeInTheDocument();
    expect(screen.getByText("31%")).toBeInTheDocument();
    expect(container.querySelectorAll("svg[data-bar]")).toHaveLength(6);
  });

  it("scales the tallest bar to the plot height and highlights the range", () => {
    const { container } = render(
      <RepForecastBars pmf={pmf} firstReps={3} range={[4, 6]} height={40} />
    );
    const bars = Array.from(container.querySelectorAll("svg[data-bar]"));
    expect(bars[2]).toHaveAttribute("height", "40");
    expect(Number(bars[5].getAttribute("height"))).toBeGreaterThanOrEqual(2);
    expect(bars[1].querySelector("rect")).toHaveAttribute("fill", "var(--chart-line)");
    expect(bars[0].querySelector("rect")).toHaveAttribute("fill", "var(--secondary)");
  });

  it("marks the selected count and states every number in its text alternative", () => {
    const { container } = render(
      <RepForecastBars pmf={pmf} firstReps={3} range={[4, 6]} selected={6} />
    );
    expect(container.querySelector('[data-selected="true"]')).toHaveAttribute("data-reps", "6");
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "Chance of each rep count. 3: 12%, 4: 30%, 5: 31%, 6: 18%, 7: 7%, 8 or more: 2%. Likely range 4 to 6."
    );
  });

  it("keeps labels at least 11px", () => {
    render(<RepForecastBars pmf={pmf} firstReps={3} range={[4, 6]} />);
    expect(screen.getByText("18%")).toHaveClass("text-[12px]");
  });
});
