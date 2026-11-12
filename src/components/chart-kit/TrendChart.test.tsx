import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Point, Series } from "@/lib/metrics/types";

// jsdom has no layout, so ResponsiveContainer would measure 0 x 0 and draw nothing.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      isValidElement(children)
        ? cloneElement(children as ReactElement<{ width: number; height: number }>, {
            width: 350,
            height: 170,
          })
        : null,
  };
});

import { TrendChart } from "./TrendChart";
import { LazyTrendChart } from "./LazyTrendChart";

const DAY = 86_400_000;
const T0 = new Date(2026, 8, 19).getTime();
const pts: Point[] = [192, 201, 210, 215, 224, 237].map((v, i) => ({
  t: T0 + i * 7 * DAY,
  v,
  label: i === 4 ? "215 x 4" : undefined,
}));
const series: Series = {
  metric: "e1rm",
  params: { exerciseId: "squat" },
  points: pts,
  unit: "lbs",
  better: "up",
};

function curves(container: HTMLElement) {
  return container.querySelectorAll("path.recharts-line-curve, path.recharts-curve.recharts-line-curve");
}

describe("TrendChart", () => {
  it("shows a quiet message with no data, not an empty frame", () => {
    render(<TrendChart data={[]} unit="lbs" ariaLabel="Squat e1RM" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });

  it("renders a labelled image with one line for the series", () => {
    const { container } = render(<TrendChart series={series} ariaLabel="Squat e1RM" />);
    expect(screen.getByRole("img", { name: "Squat e1RM" })).toBeInTheDocument();
    expect(curves(container)).toHaveLength(1);
  });

  it("strokes the line with the chart token", () => {
    const { container } = render(<TrendChart series={series} ariaLabel="x" />);
    expect(curves(container)[0]).toHaveAttribute("stroke", "var(--chart-line)");
  });

  // Recharts 3 draws tick labels in their own layer, apart from the tick lines.
  const tickLabels = (c: HTMLElement, axis: "x" | "y") =>
    Array.from(
      c.querySelectorAll(`.recharts-${axis}Axis-tick-labels .recharts-cartesian-axis-tick-label`)
    ).map((n) => n.textContent ?? "");

  it("uses three or four y ticks and three date ticks: first, middle, last", () => {
    const { container } = render(<TrendChart series={series} ariaLabel="x" />);
    const y = tickLabels(container, "y");
    expect(y.length).toBeGreaterThanOrEqual(3);
    expect(y.length).toBeLessThanOrEqual(4);
    expect(tickLabels(container, "x")).toEqual(["Sep 19", "Oct 6", "Oct 24"]);
  });

  it("never starts a weight axis at zero", () => {
    const { container } = render(<TrendChart series={series} ariaLabel="x" />);
    const labels = tickLabels(container, "y").map(Number);
    expect(labels.length).toBeGreaterThan(0);
    expect(Math.min(...labels)).toBeGreaterThan(100);
  });

  it("renders one extra line per overlay with distinct dash patterns and end labels", () => {
    const now = pts[pts.length - 1].t;
    const ahead = (w: number) => now + w * 7 * DAY;
    const { container } = render(
      <TrendChart
        series={series}
        nowMarker={now}
        overlays={[
          {
            id: "trend",
            label: "Current trend",
            points: [{ t: now, v: 237 }, { t: ahead(12), v: 252 }],
            band: [
              { t: now, low: 237, high: 237 },
              { t: ahead(12), low: 244, high: 260 },
            ],
          },
          {
            id: "freq",
            label: "2 sessions / wk",
            style: "dashed",
            points: [{ t: now, v: 237 }, { t: ahead(12), v: 258 }],
          },
          {
            id: "kcal",
            label: "Maintenance calories",
            style: "dotted",
            points: [{ t: now, v: 237 }, { t: ahead(12), v: 261 }],
          },
        ]}
        ariaLabel="Squat projection"
      />
    );
    const lines = curves(container);
    expect(lines).toHaveLength(4);
    const strokes = Array.from(lines).slice(1).map((l) => l.getAttribute("stroke"));
    expect(strokes).toEqual([
      "var(--chart-series-2)",
      "var(--chart-series-3)",
      "var(--chart-series-4)",
    ]);
    const dashes = Array.from(lines).slice(1).map((l) => l.getAttribute("stroke-dasharray") ?? "none");
    expect(new Set(dashes).size).toBe(3);
    // Direct end labels.
    expect(screen.getByText("252")).toBeInTheDocument();
    expect(screen.getByText("258")).toBeInTheDocument();
    expect(screen.getByText("261")).toBeInTheDocument();
    // Legend names each overlay.
    expect(screen.getByText("Maintenance calories")).toBeInTheDocument();
    // Range band for the trend.
    expect(container.querySelectorAll(".recharts-area.chart-overlay-band")).toHaveLength(1);
    // Now marker.
    expect(container.querySelector(".recharts-reference-line")).not.toBeNull();
  });

  it("shades the target band", () => {
    const { container } = render(
      <TrendChart
        data={pts.map((p) => ({ ...p, v: -p.v / 200 }))}
        unit="lbs/week"
        target={{ low: -1.25, high: -0.75, label: "Target" }}
        ariaLabel="Loss rate"
      />
    );
    const area = container.querySelector(".recharts-reference-area-rect");
    expect(area).not.toBeNull();
    expect(area).toHaveAttribute("fill", "var(--chart-band)");
  });

  it("area variant fills under the line", () => {
    const { container } = render(<TrendChart series={series} variant="area" ariaLabel="x" />);
    const area = container.querySelector(".recharts-area-area");
    expect(area).toHaveAttribute("fill", "var(--chart-area)");
  });

  it("selects points with the keyboard and announces them", () => {
    const onSelect = vi.fn();
    render(
      <TrendChart
        series={series}
        formatValue={(v) => `est. ${v}`}
        onSelectPoint={onSelect}
        ariaLabel="Squat e1RM"
      />
    );
    const chart = screen.getByRole("img", { name: "Squat e1RM" });
    fireEvent.keyDown(chart, { key: "End" });
    expect(onSelect).toHaveBeenLastCalledWith(pts[5]);
    fireEvent.keyDown(chart, { key: "ArrowLeft" });
    expect(onSelect).toHaveBeenLastCalledWith(pts[4]);
    const live = document.querySelector("[aria-live='polite']")!;
    expect(live.textContent).toContain("Oct 17");
    expect(live.textContent).toContain("215 x 4");
    expect(live.textContent).toContain("est. 224");
    // Guide line and enlarged point.
    expect(document.querySelector(".recharts-reference-line")).not.toBeNull();
    expect(document.querySelector(".recharts-reference-dot circle")).toHaveAttribute("r", "6");
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(onSelect).toHaveBeenLastCalledWith(null);
    expect(live.textContent).toBe("");
  });

  it("LazyTrendChart loads the chart on the client", async () => {
    render(<LazyTrendChart series={series} ariaLabel="Lazy squat" />);
    expect(await screen.findByRole("img", { name: "Lazy squat" })).toBeInTheDocument();
  });
});
