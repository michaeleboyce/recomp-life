import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  CalibrationChart,
  calibrationSummary,
  placeCalibrationLabels,
  type CalibrationBin,
  type PlacedLabel,
} from "./CalibrationChart";

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

  it("sets its words at 12px", () => {
    const { container } = render(<CalibrationChart bins={bins} />);
    const sizes = Array.from(container.querySelectorAll("text, g[font-size]")).map((el) =>
      Number(el.getAttribute("font-size") ?? 12)
    );
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12);
  });
});

describe("placeCalibrationLabels", () => {
  const overlaps = (a: PlacedLabel["box"], b: PlacedLabel["box"]) =>
    Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1]);

  it("keeps labels apart when dots sit close together near 100%", () => {
    // The case from the track record: 67%, 96% and 36% all came true every time.
    const close: CalibrationBin[] = [
      { stated: 0.36, hits: 2, count: 2 },
      { stated: 0.52, hits: 4, count: 6 },
      { stated: 0.67, hits: 7, count: 7 },
      { stated: 0.96, hits: 24, count: 24 },
    ];
    const { container } = render(<CalibrationChart bins={close} />);
    const dots = Array.from(container.querySelectorAll("[data-bin] circle")).map((c) => ({
      cx: Number(c.getAttribute("cx")),
      cy: Number(c.getAttribute("cy")),
      r: Number(c.getAttribute("r")),
    }));
    const placed = placeCalibrationLabels(
      dots.map((d, i) => ({ ...d, text: `${close[i].hits} of ${close[i].count}` }))
    );
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i].box, placed[j].box), `labels ${i} and ${j}`).toBe(false);
      }
      for (const d of dots) {
        expect(overlaps(placed[i].box, [d.cx - d.r, d.cy - d.r, d.cx + d.r, d.cy + d.r]), `label ${i} on a dot`).toBe(
          false
        );
      }
    }
    // The rendered text uses the placement.
    const texts = Array.from(container.querySelectorAll("[data-bin] text"));
    expect(texts.map((t) => Number(t.getAttribute("x")))).toEqual(placed.map((p) => p.x));
  });

  it("puts a lone label to the right of its dot, or to the left near the right edge", () => {
    const [mid] = placeCalibrationLabels([{ cx: 150, cy: 80, r: 6, text: "3 of 9" }]);
    expect(mid.anchor).toBe("start");
    expect(mid.x).toBeGreaterThan(156);
    const [edge] = placeCalibrationLabels([{ cx: 300, cy: 80, r: 6, text: "3 of 9" }]);
    expect(edge.anchor).toBe("end");
    expect(edge.x).toBeLessThan(294);
  });

  it("stacks labels for dots on top of each other", () => {
    const placed = placeCalibrationLabels([
      { cx: 200, cy: 40, r: 8, text: "5 of 6" },
      { cx: 204, cy: 44, r: 8, text: "9 of 9" },
    ]);
    expect(overlaps(placed[0].box, placed[1].box)).toBe(false);
  });
});
