import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeE1RM, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import { PROJECTION_EVIDENCE_IDS } from "@/lib/projection";

// jsdom has no layout, so ResponsiveContainer would measure 0 x 0 and draw nothing.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      isValidElement(children)
        ? cloneElement(children as ReactElement<{ width: number; height: number }>, {
            width: 350,
            height: 220,
          })
        : null,
  };
});

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

let liftId = "squat";
vi.mock("next/navigation", () => ({ useParams: () => ({ id: liftId }) }));

import LiftProjectionPage from "./page";

const NOW = new Date();
const demo = generateDemoData(NOW);

async function seedDemo() {
  await db.workouts.bulkPut(demo.workouts);
  await db.estimated1RMs.bulkPut(demo.estimated1RMs);
  await db.liftStates.bulkPut(demo.liftStates);
  await db.userProfile.put(makeProfile());
}

const summary = () => screen.getByTestId("projection-summary").textContent ?? "";
const chart = () => screen.getByRole("img", { name: /estimated 1RM history/i });

// The database open and the lazy chart import are slow under full-suite load.
vi.setConfig({ testTimeout: 30_000 });
const LOAD = { timeout: 15_000 };

async function renderLoaded() {
  render(<LiftProjectionPage />);
  await waitFor(() => expect(screen.getByTestId("projection-summary")).toBeInTheDocument(), LOAD);
  await screen.findByRole("img", { name: /estimated 1RM history/i }, LOAD);
}

beforeEach(async () => {
  liftId = "squat";
  await clearDb();
});

describe("projection screen", () => {
  it("renders the demo squat: title, summary, chart with the current trend, controls", async () => {
    await seedDemo();
    await renderLoaded();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Squat projection");
    for (const word of ["projection", "Weekly sets", "Fail and reset", "Training phase"]) {
      expect(screen.getByRole("button", { name: `What does ${word} mean?` })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/progress/lift/squat");
    // The longest horizon the demo's history supports.
    expect(summary()).toMatch(/^On your current trend, about \d+ in \d+ weeks\.$/);
    expect(chart().getAttribute("aria-label")).toMatch(/current trend \d+, range \d+ to \d+/);
    expect(chart().getAttribute("aria-label")).not.toMatch(/alternative/);
    expect(screen.getByText(/^Current trend, range \d+ to \d+$/)).toBeInTheDocument();
    expect(screen.getByLabelText("Squat sessions a week")).toHaveAttribute("type", "range");
    expect(screen.getByText(/Sets from other exercises that train your quads and glutes/)).toBeInTheDocument();
    expect(screen.getByText("Where your work comes from")).toBeInTheDocument();
    expect(screen.getByText("Quads")).toBeInTheDocument();
    expect(screen.getByText(/not added to the projection/)).toBeInTheDocument();
  });

  it("changes the horizon", async () => {
    await seedDemo();
    await renderLoaded();
    fireEvent.click(screen.getByRole("radio", { name: "4w" }));
    await waitFor(() => expect(summary()).toMatch(/in 4 weeks\.$/));
  });

  const controls: Array<[string, () => void, RegExp]> = [
    ["sessions", () => fireEvent.change(screen.getByLabelText("Squat sessions a week"), { target: { value: "3" } }), /3 squat sessions a week instead of/],
    ["sets of the lift", () => fireEvent.change(screen.getByLabelText("Sets of squat a week"), { target: { value: "15" } }), /15 sets of squat a week instead of/],
    ["other work", () => fireEvent.change(screen.getByLabelText("Other work for the same muscles, sets a week"), { target: { value: "18" } }), /18 sets a week from other exercises/],
    ["sessions passed", () => fireEvent.change(screen.getByLabelText("Sessions passed"), { target: { value: "60" } }), /60% of sessions passed instead of/],
    // The test profile is cutting, so bulking is a change.
    ["phase", () => fireEvent.click(screen.getByRole("button", { name: "Bulking" })), /bulking instead of cutting/],
  ];

  for (const [name, act, pattern] of controls) {
    it(`the ${name} control changes the alternative and the summary`, async () => {
      await seedDemo();
      await renderLoaded();
      const before = chart().getAttribute("aria-label");
      act();
      await waitFor(() => expect(summary()).toMatch(pattern));
      expect(summary()).toMatch(/On your current trend, about \d+\.$/);
      expect(chart().getAttribute("aria-label")).toMatch(/your alternative \d+/);
      expect(chart().getAttribute("aria-label")).not.toBe(before);
      expect(screen.getByText("Your alternative")).toBeInTheDocument();
    });
  }

  it("Reset returns to the baseline", async () => {
    await seedDemo();
    await renderLoaded();
    const reset = screen.getByRole("button", { name: "Reset" });
    expect(reset).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Bulking" }));
    await waitFor(() => expect(summary()).toMatch(/^With bulking/));
    fireEvent.click(reset);
    await waitFor(() => expect(summary()).toMatch(/^On your current trend/));
    expect(screen.queryByText("Your alternative")).toBeNull();
  });

  it("shows one evidence line per projection rule, each opening a sheet linking to /research#id", async () => {
    await seedDemo();
    await renderLoaded();
    const lines = document.querySelectorAll("[data-evidence]");
    expect([...lines].map((l) => l.getAttribute("data-evidence"))).toEqual(PROJECTION_EVIDENCE_IDS);
    for (const id of PROJECTION_EVIDENCE_IDS) {
      fireEvent.click(document.querySelector(`[data-evidence="${id}"]`)!);
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).getByRole("link", { name: /see all research/i })).toHaveAttribute(
        "href",
        `/research#${id}`
      );
      expect(within(dialog).getAllByRole("link", { name: /read the paper/i }).length).toBeGreaterThan(0);
      fireEvent.keyDown(dialog, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
    expect(screen.getByText(/one slowing rate is used for everyone/i)).toBeInTheDocument();
  });

  it("insufficient data: says how many more AMRAP sets, no chart or controls", async () => {
    render(<LiftProjectionPage />);
    expect(await screen.findByText("Not enough data to project yet", {}, LOAD)).toBeInTheDocument();
    expect(screen.getByText(/Log 4 more T1 AMRAP sets of squat/)).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.queryByRole("slider")).toBeNull();
  });

  it("flat trend: chart and an explanation, controls hidden", async () => {
    const rows = demo.estimated1RMs
      .filter((r) => r.exerciseId === "squat")
      .map((r) => ({ ...r, estimated1RM: 250 }));
    await db.estimated1RMs.bulkPut(rows);
    await renderLoaded();
    expect(summary()).toMatch(/not rising, so the projection holds about 250/);
    expect(screen.getByRole("status")).toHaveTextContent(/no personal rate of gain/);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(chart()).toBeInTheDocument();
  });

  const WEEK = 7 * 86_400_000;
  const squatRows = () => demo.estimated1RMs.filter((r) => r.exerciseId === "squat");

  it("a short history disables the longer horizons, says why, and opens on the longest allowed", async () => {
    // The demo's recent squat results span under eight weeks.
    await seedDemo();
    await renderLoaded();
    const enabled = ["4w", "8w", "12w"].filter((name) => !screen.getByRole("radio", { name }).hasAttribute("disabled"));
    expect(enabled.length).toBeLessThan(3);
    expect(enabled).toContain("4w");
    const longest = enabled[enabled.length - 1];
    expect(screen.getByRole("radio", { name: longest })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "12w" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "12w" }));
    expect(screen.getByRole("radio", { name: longest })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("horizon-note")).toHaveTextContent(/only shown .* ahead/);
    expect(summary()).toMatch(new RegExp(`in ${parseInt(longest, 10)} weeks\\.$`));
    // "Built from" uses the weeks the trend was fitted to (under eight here).
    const built = screen.getByText(/The estimate is built from about \d+ weeks?/).textContent!;
    expect(Number(built.match(/about (\d+) week/)![1])).toBeLessThan(8);
  });

  it("twelve weeks of results allow every horizon and show no note", async () => {
    const rows = Array.from({ length: 13 }, (_, i) =>
      makeE1RM({
        exerciseId: "squat",
        date: new Date(NOW.getTime() - (12 - i) * WEEK - 3_600_000),
        estimated1RM: 220 + 2 * i + (i % 2),
      })
    );
    await db.estimated1RMs.bulkPut(rows);
    await db.userProfile.put(makeProfile());
    await renderLoaded();
    for (const name of ["4w", "8w", "12w"]) {
      expect(screen.getByRole("radio", { name })).toBeEnabled();
    }
    expect(screen.getByRole("radio", { name: "12w" })).toHaveAttribute("aria-checked", "true");
    expect(screen.queryByTestId("horizon-note")).toBeNull();
    expect(screen.getByText(/The estimate is built from about 12 weeks/)).toBeInTheDocument();
  });

  it("an old last result: says how old, above the chart", async () => {
    await db.estimated1RMs.bulkPut(
      squatRows().map((r) => ({ ...r, date: new Date(new Date(r.date).getTime() - 8 * WEEK) }))
    );
    await db.userProfile.put(makeProfile());
    await renderLoaded();
    const callout = screen.getByText(/Your last squat estimate is \d+ weeks old/);
    expect(Number(callout.textContent!.match(/is (\d+) weeks/)![1])).toBeGreaterThanOrEqual(8);
    expect(callout.compareDocumentPosition(chart()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("no sessions and no sets of the lift: its own message, not the flat-trend text", async () => {
    await seedDemo();
    await renderLoaded();
    fireEvent.change(screen.getByLabelText("Squat sessions a week"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Sets of squat a week"), { target: { value: "0" } });
    await waitFor(() => expect(summary()).toMatch(/^With no squat sets or sessions/));
    expect(summary()).not.toMatch(/estimates are not rising/);
  });

  it("unknown lift: an empty state with a link back", async () => {
    liftId = "not-a-lift";
    render(<LiftProjectionPage />);
    expect(screen.getByText("Lift not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Progress" })).toHaveAttribute("href", "/progress");
  });
});
