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

  it("leaves room for long tick labels and end labels so neither is cut off", () => {
    const big: Point[] = [880, 905, 930, 960, 985].map((v, i) => ({ t: T0 + i * 7 * DAY, v }));
    const { container } = render(
      <TrendChart
        data={big}
        unit="lbs"
        overlays={[{ id: "avg", label: "Average", points: [{ t: big[0].t, v: 880 }, { t: big[4].t, v: 1012.4 }] }]}
        ariaLabel="Total"
      />
    );
    const ticks = Array.from(
      container.querySelectorAll(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-label text, .recharts-yAxis-tick-labels text")
    );
    const longest = ticks.find((t) => t.textContent === "1,000") ?? ticks[ticks.length - 1];
    expect(longest?.textContent).toBe("1,000");
    // Right-aligned at x: five 10 px mono characters (about 6 px each) must start at or after 0.
    expect(Number(longest!.getAttribute("x")) - 5 * 6.2).toBeGreaterThanOrEqual(0);
    // The end label "1,012.4" starts after the line's end and fits in the 350 px chart.
    const end = screen.getByText("1,012.4");
    expect(Number(end.getAttribute("x")) + "1,012.4".length * 6.9).toBeLessThanOrEqual(350);
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

  it("draws imported points apart: a dashed line of hollow dots, named in the legend and the inspector", () => {
    const withImported: Series = {
      ...series,
      points: [
        { t: T0 - 21 * DAY, v: 180, label: "Imported · 155 x 5", imported: true },
        { t: T0 - 14 * DAY, v: 185, label: "Imported · 160 x 5", imported: true },
        ...pts,
      ],
    };
    const { container } = render(<TrendChart series={withImported} seriesLabel="Estimated 1RM" ariaLabel="Squat e1RM" />);
    const lines = curves(container);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toHaveAttribute("stroke-dasharray", "3 3");
    expect(screen.getByTestId("legend-imported")).toHaveTextContent("Imported");
    expect(screen.getByText("Estimated 1RM")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("img", { name: "Squat e1RM" }), { key: "Home" });
    expect(document.querySelector("[aria-live='polite']")!.textContent).toContain("Imported · 155 x 5");
  });

  it("shows no legend or second line without imported points or overlays", () => {
    const { container } = render(<TrendChart series={series} ariaLabel="x" />);
    expect(curves(container)).toHaveLength(1);
    expect(screen.queryByTestId("legend-imported")).toBeNull();
  });

  it("LazyTrendChart loads the chart on the client", async () => {
    render(<LazyTrendChart series={series} ariaLabel="Lazy squat" />);
    expect(await screen.findByRole("img", { name: "Lazy squat" })).toBeInTheDocument();
  });
});
