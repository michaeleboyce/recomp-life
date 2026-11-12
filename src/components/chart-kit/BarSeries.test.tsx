import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { BarSeries, type BarDatum } from "./BarSeries";

const data: BarDatum[] = [
  { key: "chest", label: "Chest", value: 6 },
  { key: "back", label: "Back", value: 12, tone: "good" },
  { key: "core", label: "Core", value: 3, tone: "warn" },
];

// Each bar is an SVG sized to its value, holding the rounded rect.
function barRects(container: HTMLElement) {
  const bars = Array.from(container.querySelectorAll<SVGSVGElement>("svg[data-bar]"));
  for (const b of bars) expect(b.querySelector("rect")).not.toBeNull();
  return bars;
}

describe("BarSeries", () => {
  it("shows a quiet message instead of an empty frame", () => {
    render(<BarSeries data={[]} ariaLabel="Weekly sets" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it("horizontal: renders one visibly sized bar per datum, with labels and values", () => {
    const { container } = render(<BarSeries data={data} ariaLabel="Weekly sets per muscle" />);
    expect(screen.getByRole("img", { name: "Weekly sets per muscle" })).toBeInTheDocument();
    const rects = barRects(container);
    expect(rects).toHaveLength(3);
    for (const r of rects) {
      expect(parseFloat(r.getAttribute("width")!)).toBeGreaterThan(0);
      expect(parseFloat(r.getAttribute("height")!)).toBeGreaterThan(0);
    }
    // Longest bar fills the scale.
    expect(rects[1].getAttribute("width")).toBe("100%");
    expect(rects[0].getAttribute("width")).toBe("50%");
    expect(screen.getByText("Chest")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("vertical: renders one visibly sized column per datum", () => {
    const { container } = render(
      <BarSeries data={data} orientation="vertical" ariaLabel="Sessions per week" />
    );
    const rects = barRects(container);
    expect(rects).toHaveLength(3);
    for (const r of rects) {
      expect(parseFloat(r.getAttribute("height")!)).toBeGreaterThan(0);
      expect(parseFloat(r.getAttribute("width")!)).toBeGreaterThan(0);
    }
    expect(rects[1].getAttribute("height")).toBe("100%");
  });

  it("fills bars with token colours by tone", () => {
    const { container } = render(<BarSeries data={data} ariaLabel="x" />);
    const fills = barRects(container).map((r) => r.querySelector("rect")!.getAttribute("fill"));
    expect(fills).toEqual(["var(--chart-line)", "var(--chart-good)", "var(--chart-warn)"]);
  });

  it("draws a target marker and includes the target in the scale", () => {
    const { container } = render(
      <BarSeries data={data} target={{ value: 24, label: "Target" }} ariaLabel="x" />
    );
    const marker = container.querySelector("[data-target]") as HTMLElement;
    expect(marker).not.toBeNull();
    expect(marker.style.left).toBe("100%");
    expect(barRects(container)[1].getAttribute("width")).toBe("50%");
    expect(screen.getByText("Target")).toBeInTheDocument();
  });

  it("uses formatValue for the value labels", () => {
    render(<BarSeries data={data} formatValue={(v) => `${v} sets`} ariaLabel="x" />);
    expect(screen.getByText("12 sets")).toBeInTheDocument();
  });

  it("a zero value draws no bar but keeps its row", () => {
    const { container } = render(
      <BarSeries data={[...data, { key: "calves", label: "Calves", value: 0 }]} ariaLabel="x" />
    );
    expect(screen.getByText("Calves")).toBeInTheDocument();
    expect(barRects(container)).toHaveLength(3);
  });
});
