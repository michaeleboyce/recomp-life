import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { MetricResult } from "@/hooks/useMetric";
import type { Point } from "@/lib/metrics/types";
import { summarize } from "@/lib/metrics";

let result: MetricResult | undefined;
const useMetric = vi.fn((id: string, params?: { exerciseId?: string }) => {
  void id;
  void params;
  return result;
});
vi.mock("@/hooks", () => ({
  useMetric: (id: string, params?: { exerciseId?: string }) => useMetric(id, params),
}));
vi.mock("@/components/chart-kit/LazyTrendChart", () => ({
  LazyTrendChart: (props: { ariaLabel: string; series: { points: unknown[] } }) => (
    <div role="img" aria-label={props.ariaLabel} data-points={props.series.points.length} />
  ),
  TrendChartSkeleton: () => <div data-testid="chart-skeleton" />,
}));

import { ExerciseE1RMSection } from "./ExerciseDetail";

function metric(points: Point[]): MetricResult {
  const series = {
    metric: "e1rm" as const,
    params: { exerciseId: "squat" },
    points,
    unit: "lbs" as const,
    better: "up" as const,
  };
  return { full: series, series, summary: summarize(series) };
}

const DAY = 86_400_000;

beforeEach(() => {
  result = undefined;
  useMetric.mockClear();
});
afterEach(cleanup);

describe("ExerciseE1RMSection", () => {
  it("reads the e1rm metric for the exercise", () => {
    render(<ExerciseE1RMSection exerciseId="squat" exerciseName="Barbell Squat" />);
    expect(useMetric).toHaveBeenCalledWith("e1rm", { exerciseId: "squat" });
  });

  it("shows a placeholder while loading", () => {
    render(<ExerciseE1RMSection exerciseId="squat" exerciseName="Barbell Squat" />);
    expect(screen.getByTestId("chart-skeleton")).toBeInTheDocument();
  });

  it("shows an empty state with no estimates", () => {
    result = metric([]);
    render(<ExerciseE1RMSection exerciseId="squat" exerciseName="Barbell Squat" />);
    expect(screen.getByText(/Complete an AMRAP set/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("draws the trend chart and the latest value", () => {
    result = metric([
      { t: 0, v: 200 },
      { t: 7 * DAY, v: 211.4 },
    ]);
    render(<ExerciseE1RMSection exerciseId="squat" exerciseName="Barbell Squat" />);
    const chart = screen.getByRole("img", { name: "Barbell Squat estimated 1RM over time" });
    expect(chart).toHaveAttribute("data-points", "2");
    expect(screen.getByText("211")).toBeInTheDocument();
  });

  it("links a main lift to its progress page", () => {
    result = metric([{ t: 0, v: 200 }]);
    render(<ExerciseE1RMSection exerciseId="squat" exerciseName="Barbell Squat" />);
    expect(screen.getByRole("link", { name: /Full history/ })).toHaveAttribute(
      "href",
      "/progress/lift/squat"
    );
  });

  it("has no progress link for other exercises", () => {
    result = metric([{ t: 0, v: 50 }]);
    render(<ExerciseE1RMSection exerciseId="db_curl" exerciseName="Dumbbell Curl" />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
