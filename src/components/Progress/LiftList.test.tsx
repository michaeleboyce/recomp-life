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

  it("with the pooled estimate, shows it and its line's change instead of the latest session's", () => {
    const now = new Date(2026, 10, 18, 12);
    const before = new Date(now);
    before.setDate(before.getDate() - 10);
    const card = lift([{ t: before.getTime(), v: 158 }], null);
    card.estimate = {
      value: 162,
      change: 4.4,
      line: [
        { t: before.getTime(), v: 157.6 },
        { t: now.getTime(), v: 162 },
      ],
      latest: { t: before.getTime(), imported: false },
    };
    render(<LiftList lifts={[card]} />);
    const link = screen.getByRole("link");
    expect(within(link).getByText("162")).toBeInTheDocument();
    expect(within(link).queryByText("158")).toBeNull();
    expect(link).toHaveTextContent("+4");
  });

  it("marks the pooled estimate imported, with the date, when the lift's newest session is an old imported one", () => {
    const at = new Date(2024, 7, 2, 18).getTime();
    const card = lift([], { t: at, v: 175, imported: true });
    card.estimate = { value: 171, change: null, line: [], latest: { t: at, imported: true } };
    render(<LiftList lifts={[card]} />);
    const link = screen.getByRole("link");
    expect(within(link).getByText("171")).toBeInTheDocument();
    expect(within(link).getByTestId("lift-latest-imported")).toHaveTextContent("Imported");
    expect(within(link).getByTestId("lift-latest-date")).toHaveTextContent("Aug 2, 2024");
  });

  it("shows '–' only for a lift with no estimate at all", () => {
    render(<LiftList lifts={[lift([], null)]} />);
    expect(within(screen.getByRole("link")).getByText("–")).toBeInTheDocument();
  });
});
