import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup } from "@testing-library/react";
import { render, screen, within } from "@testing-library/react";
import type { Series } from "@/lib/metrics/types";
import { summarize } from "@/lib/metrics";
import { LiftList } from "./LiftList";
import { latestNote, type LiftEstimate, type LiftOverview } from "./strength";

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 18, 12).getTime();

function lift(
  points: Series["points"],
  latestBeforeRange: LiftOverview["latestBeforeRange"],
  estimate?: LiftEstimate
): LiftOverview {
  const series: Series = { metric: "e1rm", params: {}, points, unit: "lbs", better: "up" };
  const base: LiftOverview = {
    id: "bench",
    label: "Bench press",
    liftState: undefined,
    full: series,
    series,
    summary: summarize(series),
    stall: null,
    latestBeforeRange,
    ...(estimate ? { estimate } : {}),
  };
  return { ...base, note: latestNote(base, "3m", NOW) };
}

afterEach(cleanup);

describe("LiftList", () => {
  it("shows the latest estimate in the range", () => {
    render(<LiftList lifts={[lift([{ t: NOW - 10 * DAY, v: 180 }, { t: NOW - 3 * DAY, v: 185 }], null)]} />);
    const card = screen.getByRole("link");
    expect(within(card).getByText("185")).toBeInTheDocument();
    expect(within(card).queryByTestId("lift-latest-note")).toBeNull();
  });

  it("with no estimate in the range, shows the latest one with its date instead of '–', marked imported", () => {
    const at = new Date(2024, 7, 2, 18).getTime();
    render(<LiftList lifts={[lift([], { t: at, v: 175, imported: true })]} />);
    const card = screen.getByRole("link");
    expect(within(card).getByText("175")).toBeInTheDocument();
    expect(within(card).getByTestId("lift-latest-note")).toHaveTextContent("Imported, Aug 2, 2024");
    expect(within(card).queryByText("–")).toBeNull();
  });

  it("with the pooled estimate, shows it and its line's change instead of the latest session's", () => {
    const before = new Date(NOW);
    before.setDate(before.getDate() - 10);
    const card = lift([{ t: before.getTime(), v: 158 }], null, {
      value: 162,
      change: 4.4,
      line: [
        { t: before.getTime(), v: 157.6 },
        { t: NOW, v: 162 },
      ],
      latest: { t: before.getTime(), imported: false },
      newest: { t: before.getTime(), imported: false, exerciseId: "bench" },
    });
    render(<LiftList lifts={[card]} />);
    const link = screen.getByRole("link");
    expect(within(link).getByText("162")).toBeInTheDocument();
    expect(within(link).queryByText("158")).toBeNull();
    expect(link).toHaveTextContent("+4");
    expect(within(link).queryByTestId("lift-latest-note")).toBeNull();
  });

  it("marks the pooled estimate imported, with the date, when the lift's newest session is an old imported one", () => {
    const at = new Date(2024, 7, 2, 18).getTime();
    const card = lift([], { t: at, v: 175, imported: true }, {
      value: 171,
      change: null,
      line: [],
      latest: { t: at, imported: true },
      newest: { t: at, imported: true, exerciseId: "bench" },
    });
    render(<LiftList lifts={[card]} />);
    const link = screen.getByRole("link");
    expect(within(link).getByText("171")).toBeInTheDocument();
    expect(within(link).getByTestId("lift-latest-note")).toHaveTextContent("Imported, Aug 2, 2024");
  });

  it("gives the date and the home version when an imported home version is the newest, inside the range too", () => {
    const at = new Date(2026, 10, 10, 18).getTime();
    const barbell = new Date(2026, 9, 3, 18).getTime();
    const card = lift([{ t: barbell, v: 160, imported: true }], null, {
      value: 162,
      change: 2,
      line: [],
      latest: { t: barbell, imported: true },
      newest: { t: at, imported: true, exerciseId: "db_bench" },
    });
    render(<LiftList lifts={[card]} />);
    expect(within(screen.getByRole("link")).getByTestId("lift-latest-note")).toHaveTextContent(
      "Imported, Nov 10 · DB Bench Press"
    );
  });

  it("shows '–' only for a lift with no estimate at all", () => {
    render(<LiftList lifts={[lift([], null)]} />);
    expect(within(screen.getByRole("link")).getByText("–")).toBeInTheDocument();
  });
});
