import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { render, screen, within } from "@testing-library/react";
import type { Series } from "@/lib/metrics/types";
import { summarize } from "@/lib/metrics";
import { LiftList } from "./LiftList";
import type { LiftOverview } from "./strength";

const DAY = 86_400_000;

function lift(points: Series["points"], latestBeforeRange: LiftOverview["latestBeforeRange"]): LiftOverview {
  const series: Series = { metric: "e1rm", params: {}, points, unit: "lbs", better: "up" };
  return {
    id: "bench",
    label: "Bench press",
    liftState: undefined,
    full: series,
    series,
    summary: summarize(series),
    stall: null,
    latestBeforeRange,
  };
}

afterEach(cleanup);

describe("LiftList", () => {
  it("shows the latest estimate in the range", () => {
    const now = Date.now();
    render(<LiftList lifts={[lift([{ t: now - 10 * DAY, v: 180 }, { t: now - 3 * DAY, v: 185 }], null)]} />);
    const card = screen.getByRole("link");
    expect(within(card).getByText("185")).toBeInTheDocument();
    expect(within(card).queryByTestId("lift-latest-date")).toBeNull();
  });

  it("with no estimate in the range, shows the latest one with its date instead of '–', marked imported", () => {
    const at = new Date(2024, 7, 2, 18).getTime();
    render(<LiftList lifts={[lift([], { t: at, v: 175, imported: true })]} />);
    const card = screen.getByRole("link");
    expect(within(card).getByText("175")).toBeInTheDocument();
    expect(within(card).getByTestId("lift-latest-date")).toHaveTextContent("Aug 2, 2024");
    expect(within(card).getByTestId("lift-latest-imported")).toHaveTextContent("Imported");
    expect(within(card).queryByText("–")).toBeNull();
  });

  it("shows '–' only for a lift with no estimate at all", () => {
    render(<LiftList lifts={[lift([], null)]} />);
    expect(within(screen.getByRole("link")).getByText("–")).toBeInTheDocument();
  });
});
