import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import type { RangeKey } from "@/lib/metrics/types";
import type { WindowSpan } from "@/lib/metrics/window";
import { strengthTimeline, type StrengthSet, type StrengthTimeline } from "@/lib/strength";
import { day, set, t1Session } from "@/lib/strength/testHelpers";
import { liftEstimate } from "@/components/Progress/strength";
import { StrengthTrendPanel } from "./StrengthTrendPanel";
import { TREND_PREFS_KEY } from "./trendPrefs";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const NOW = day(60).getTime();
const imported = (sets: StrengthSet[]) => sets.map((s) => ({ ...s, imported: true as const }));
const bench = (id: string, d: number, w: number) => t1Session({ sessionId: id, exerciseId: "bench", weight: w, amrapReps: 5, day: d });
const dbBench = (id: string, d: number, w: number) =>
  t1Session({ sessionId: id, exerciseId: "db_bench", weight: w, perHand: true, amrapReps: 8, day: d });
const floor = (id: string, d: number, w: number) =>
  t1Session({ sessionId: id, exerciseId: "db_floor_press", weight: w, perHand: true, amrapReps: 8, day: d });
const target = set({
  id: "target-1",
  sessionId: "target:db_floor_press",
  exerciseId: "db_floor_press",
  weight: 80,
  perHand: true,
  reps: 8,
  date: day(55),
  provisional: true,
});

/** Every kind of dot: the app's own, imported, a related exercise with pairs, one without, and a target. */
const ALL: StrengthSet[] = [
  ...imported(bench("imp1", 2, 165)),
  ...imported(bench("imp2", 9, 170)),
  ...floor("f1", 25, 65),
  ...bench("w1", 40, 180),
  ...dbBench("h1", 43, 70),
  ...bench("w2", 47, 185),
  ...dbBench("h2", 50, 72),
  target,
  ...bench("w3", 52, 190),
];

function Harness({ timeline, initialRange = "all" }: { timeline: StrengthTimeline; initialRange?: RangeKey }) {
  const [range, setRange] = useState<RangeKey>(initialRange);
  const [span, setSpan] = useState<WindowSpan | null>(null);
  return (
    <StrengthTrendPanel
      timeline={timeline}
      range={range}
      onRangeChange={setRange}
      span={span}
      onSpanChange={setSpan}
      title="Estimated 1RM"
      ariaLabel="Bench estimated 1RM over time"
      anchorLabel="Plan"
    />
  );
}

const chart = () => screen.getByRole("img", { name: "Bench estimated 1RM over time" });
const sources = () => within(screen.getByRole("list", { name: "Sources" }));

describe("StrengthTrendPanel (M4)", () => {
  it("shows the plan's estimate, the line and the dots by source, with each ratio in the legend", () => {
    const tl = strengthTimeline("bench", ALL, { now: NOW });
    render(<Harness timeline={tl} />);
    expect(screen.getByTestId("trend-anchor")).toHaveTextContent(String(tl.anchor!.value));
    expect(screen.getByTestId("today-marker")).toHaveTextContent(`Plan ${tl.anchor!.value}`);
    expect(screen.getByTestId("trend-change")).toHaveTextContent(/^[+−]?\d+ lb in \d+ wk$/);
    expect(chart()).toHaveAttribute("data-line", "smooth");
    expect(chart()).toHaveAttribute("data-points", "5");
    expect(chart()).toHaveAttribute("data-imported", "2");
    expect(sources().getByRole("checkbox", { name: /DB Bench Press ?÷ 0\.\d\d, from 2 pairs/ })).toBeInTheDocument();
    expect(sources().getByRole("checkbox", { name: /DB Floor Press ?÷ 0\.83, starting ratio/ })).toBeInTheDocument();
    expect(sources().getByRole("checkbox", { name: /Imported bench/ })).toBeChecked();
    // Shape and colour per source, never colour alone.
    const shapes = new Set([...document.querySelectorAll("[data-dot]")].map((d) => d.getAttribute("data-dot")));
    expect(shapes).toEqual(new Set(["own", "imported", "db_bench", "db_floor_press"]));
    expect(document.querySelector('[data-kind="target"]')).not.toBeNull();
    expect(screen.getByTestId("share-strip")).toBeInTheDocument();
    expect(screen.getByTestId("trend-summary").textContent).toMatch(/Bench press estimated 1RM trend/);
  });

  it("redraws without a source switched off and says the line no longer uses the plan's sources", () => {
    const tl = strengthTimeline("bench", ALL, { now: NOW });
    render(<Harness timeline={tl} />);
    const related = Number(chart().getAttribute("data-related"));
    fireEvent.click(sources().getByRole("checkbox", { name: /DB Bench Press/ }));
    expect(sources().getByRole("checkbox", { name: /DB Bench Press/ })).not.toBeChecked();
    expect(Number(chart().getAttribute("data-related"))).toBe(related - 2);
    expect(screen.getByTestId("trend-reason")).toHaveTextContent(/the number above is the plan's/);
  });

  it("shows the same number and change as Progress and Today (liftEstimate) for each preset", () => {
    const tl = strengthTimeline("bench", ALL, { now: NOW });
    for (const range of ["4w", "3m", "all"] as const) {
      render(<Harness timeline={tl} initialRange={range} />);
      const estimate = liftEstimate(tl, range)!;
      expect(screen.getByTestId("trend-anchor")).toHaveTextContent(String(Math.round(estimate.value)));
      const shown = screen.getByTestId("trend-change").textContent!.match(/^([+−]?)(\d+)/)!;
      expect((shown[1] === "−" ? -1 : 1) * Number(shown[2])).toBe(Math.round(estimate.change!));
      cleanup();
    }
  });

  it("explains a difference between the line and the plan's number", () => {
    const tl = strengthTimeline("bench", ALL, { now: NOW });
    render(<Harness timeline={tl} />);
    expect(screen.getByTestId("trend-reason")).toHaveTextContent(/older bench sessions?/);
    expect(screen.getByTestId("trend-reason")).toHaveTextContent(/The plan starts from your latest bench session/);
  });

  it("has six window presets, remembers the choice and the smoothing on the device", () => {
    const tl = strengthTimeline("bench", ALL, { now: NOW });
    render(<Harness timeline={tl} />);
    const presets = within(screen.getByRole("radiogroup", { name: "Chart window" })).getAllByRole("radio");
    expect(presets.map((p) => p.textContent)).toEqual(["4w", "3m", "6m", "1y", "2y", "All"]);
    fireEvent.click(screen.getByRole("radio", { name: "4w" }));
    fireEvent.click(screen.getByRole("radio", { name: "Heavy" }));
    expect(JSON.parse(window.localStorage.getItem(TREND_PREFS_KEY)!)).toEqual({ range: "4w", smoothing: "heavy" });
    cleanup();
    render(<Harness timeline={tl} initialRange="all" />);
    expect(screen.getByRole("radio", { name: "4w" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Heavy" })).toHaveAttribute("aria-checked", "true");
  });

  it("zooms with the two-thumb control, then resets to the preset", () => {
    const tl = strengthTimeline("bench", ALL, { now: NOW });
    render(<Harness timeline={tl} />);
    const all = Number(chart().getAttribute("data-points"));
    fireEvent.change(screen.getByRole("slider", { name: "Window start" }), { target: { value: "35" } });
    expect(screen.getByTestId("zoom-span")).toBeInTheDocument();
    expect(Number(chart().getAttribute("data-points"))).toBeLessThan(all);
    expect(within(screen.getByRole("radiogroup", { name: "Chart window" })).queryByRole("radio", { checked: true })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(Number(chart().getAttribute("data-points"))).toBe(all);
  });

  it("shows the points as a table", () => {
    const tl = strengthTimeline("bench", ALL, { now: NOW });
    render(<Harness timeline={tl} />);
    fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
    const rows = within(screen.getByTestId("trend-table")).getAllByRole("row");
    expect(rows.length - 1).toBe(tl.points.filter((p) => p.t <= NOW).length);
  });

  it("renders with imported sessions only, and with no data", () => {
    const only = strengthTimeline("bench", imported([...bench("i1", 1, 150), ...bench("i2", 8, 155)]), { now: NOW });
    render(<Harness timeline={only} />);
    expect(chart()).toHaveAttribute("data-imported", "2");
    expect(screen.getByTestId("trend-anchor")).toHaveTextContent(String(only.anchor!.value));
    cleanup();
    render(<Harness timeline={strengthTimeline("bench", [], { now: NOW })} />);
    expect(screen.getByTestId("trend-anchor")).toHaveTextContent("–");
    expect(chart()).toHaveAttribute("data-points", "0");
  });

  it("works when storage throws", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage")!;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      const tl = strengthTimeline("bench", ALL, { now: NOW });
      render(<Harness timeline={tl} />);
      fireEvent.click(screen.getByRole("radio", { name: "Light" }));
      expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
    } finally {
      Object.defineProperty(window, "localStorage", original);
    }
  });
});

describe("point detail (M5)", () => {
  const tl = strengthTimeline("bench", ALL, { now: NOW });
  const open = (sessionId: string) => {
    render(<Harness timeline={tl} />);
    fireEvent.click(screen.getByRole("button", { name: "Show as table" }));
    const point = tl.points.find((p) => p.sessionId === sessionId)!;
    const index = [...tl.points].filter((p) => p.t <= NOW).reverse().findIndex((p) => p.id === point.id);
    fireEvent.click(within(screen.getByTestId("trend-table")).getAllByRole("button")[index]);
    return screen.getByRole("region", { name: "Session detail" });
  };

  it("the lift's own session: set, estimated max and how much it counts today", () => {
    const detail = open("w3");
    expect(detail).toHaveTextContent("Barbell Bench Press");
    expect(detail).toHaveTextContent("Best set: 190 × 5");
    expect(detail).toHaveTextContent(/Estimated max \d+ lbs/);
    expect(detail).toHaveTextContent(/Counts today: [\d.]+ for its age \(8 days, halving every 14 days\)/);
  });

  it("an imported session", () => {
    expect(open("imp1")).toHaveTextContent("· imported");
  });

  it("a related exercise: the ratio and the translated value", () => {
    const detail = open("h2");
    expect(detail).toHaveTextContent("72 each × 8");
    expect(detail).toHaveTextContent(/144 lbs both dumbbells/);
    expect(detail).toHaveTextContent(/÷ 0\.\d\d \(learned from 2 pairs\) = \d+ lbs of bench/);
    expect(detail).toHaveTextContent(/0\.4 for a related exercise/);
  });

  it("a weight set by hand: counts at the target's share until lifted", () => {
    const detail = open("target:db_floor_press");
    expect(detail).toHaveTextContent("weight you set, not lifted yet");
    expect(detail).toHaveTextContent(/× 0\.5 for a weight not lifted yet/);
  });
});
