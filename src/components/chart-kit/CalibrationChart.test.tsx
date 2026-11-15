import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CalibrationChart, calibrationSummary, type CalibrationBin } from "./CalibrationChart";

const bins: CalibrationBin[] = [
  { stated: 0.2, hits: 2, count: 8 },
  { stated: 0.4, hits: 3, count: 9 },
  { stated: 0.6, hits: 8, count: 12 },
  { stated: 0.8, hits: 7, count: 9 },
  { stated: 1, hits: 0, count: 0 },
];

describe("CalibrationChart", () => {
  it("states each bucket's stated chance against what happened", () => {
    render(<CalibrationChart bins={bins} />);
    expect(screen.getByRole("img")).toHaveAccessibleName(calibrationSummary(bins));
    expect(calibrationSummary(bins)).toContain("When it said 20%, it happened 2 of 8 times (25%).");
    expect(calibrationSummary(bins)).not.toContain("100%,");
  });

  it("draws a dot per non-empty bucket, bigger for more forecasts, and a diagonal", () => {
    const { container } = render(<CalibrationChart bins={bins} />);
    const dots = Array.from(container.querySelectorAll("[data-bin] circle"));
    expect(dots).toHaveLength(4);
    const r = dots.map((d) => Number(d.getAttribute("r")));
    expect(r[2]).toBeGreaterThan(r[0]);
    expect(container.querySelector("[data-diagonal]")).toHaveAttribute("stroke-dasharray", "4 4");
    expect(screen.getByText("8 of 12")).toBeInTheDocument();
  });

  it("puts a dot higher when it happened more often", () => {
    const { container } = render(<CalibrationChart bins={bins} />);
    const cy = Array.from(container.querySelectorAll("[data-bin] circle")).map((d) =>
      Number(d.getAttribute("cy"))
    );
    // 25% happened sits below 78% happened (larger y is lower).
    expect(cy[0]).toBeGreaterThan(cy[3]);
  });

  it("shows the empty message when nothing has resolved", () => {
    render(<CalibrationChart bins={[{ stated: 0.5, hits: 0, count: 0 }]} emptyMessage="Not enough history yet" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Not enough history yet")).toBeInTheDocument();
  });
});
