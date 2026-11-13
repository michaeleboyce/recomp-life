import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/progress",
  useSearchParams: () => search,
}));
vi.mock("@/components/chart-kit/LazyTrendChart", () => ({
  LazyTrendChart: (props: { ariaLabel: string; series: { points: unknown[] } }) => (
    <div role="img" aria-label={props.ariaLabel} data-points={props.series.points.length} />
  ),
  TrendChartSkeleton: () => null,
}));
vi.mock("@/components/Progress/MusclesTab", () => ({
  MusclesTab: () => <div data-testid="muscles-tab" />,
}));
vi.mock("@/components/Progress/BodyTab", () => ({ BodyTab: () => <div data-testid="body-tab" /> }));
vi.mock("@/components/Progress/RunsTab", () => ({ RunsTab: () => <div data-testid="runs-tab" /> }));

import ProgressPage from "./page";

const demo = generateDemoData(new Date());

async function seedDemo() {
  await db.workouts.bulkPut(demo.workouts);
  await db.estimated1RMs.bulkPut(demo.estimated1RMs);
  await db.liftStates.bulkPut(demo.liftStates);
  await db.userProfile.put(makeProfile());
}

beforeEach(async () => {
  replace.mockClear();
  search = new URLSearchParams();
  await clearDb();
});
afterEach(cleanup);

describe("Progress hub tabs", () => {
  it("opens on Strength and switching updates the query string", async () => {
    render(<ProgressPage />);
    expect(screen.getByRole("heading", { name: "Progress" })).toBeInTheDocument();
    expect(await screen.findByRole("tabpanel", { name: "Strength" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cardio" }));
    expect(replace).toHaveBeenCalledWith("/progress?tab=runs", { scroll: false });
  });

  it.each([
    ["body", "body-tab"],
    ["runs", "runs-tab"],
  ])("selects the %s tab from ?tab=", async (tab, testId) => {
    search = new URLSearchParams({ tab });
    render(<ProgressPage />);
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });

  it("renders the muscles view once there is training data", async () => {
    await seedDemo();
    search = new URLSearchParams({ tab: "muscles" });
    render(<ProgressPage />);
    expect(await screen.findByTestId("muscles-tab")).toBeInTheDocument();
  });

  it("falls back to Strength for an unknown tab", async () => {
    search = new URLSearchParams({ tab: "nope" });
    render(<ProgressPage />);
    expect(await screen.findByRole("tabpanel", { name: "Strength" })).toBeInTheDocument();
  });
});

describe("Strength tab", () => {
  it("lists the four lifts with demo values and links", async () => {
    await seedDemo();
    render(<ProgressPage />);
    const list = await screen.findByTestId("lift-list");
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/progress/lift/squat",
      "/progress/lift/bench",
      "/progress/lift/deadlift",
      "/progress/lift/ohp",
    ]);
    const squat = demo.liftStates.find((s) => s.exerciseId === "squat")!;
    expect(links[0]).toHaveTextContent("Squat");
    expect(links[0]).toHaveTextContent(`working ${squat.t1Weight}`);
    const latest = demo.estimated1RMs
      .filter((r) => r.exerciseId === "squat")
      .sort((a, b) => +a.date - +b.date)
      .at(-1)!.estimated1RM;
    expect(links[0]).toHaveTextContent(String(Math.round(latest)));
    const total = screen.getByRole("region", { name: "Strength total" });
    expect(within(total).getByRole("heading")).toHaveTextContent("Total of four lifts, est. 1RM");
    expect(within(total).getByRole("button", { name: "What does est. 1RM mean?" })).toHaveAttribute(
      "data-term",
      "e1rm"
    );
    expect(screen.getByRole("region", { name: "Recovery" })).toBeInTheDocument();
  });

  it("changing the range changes the total chart's points", async () => {
    await seedDemo();
    render(<ProgressPage />);
    const chart = await screen.findByRole("img", { name: /Total of four lifts/ });
    const before = Number(chart.getAttribute("data-points"));
    fireEvent.click(screen.getByRole("radio", { name: "4w" }));
    await waitFor(() =>
      expect(Number(screen.getByRole("img", { name: /Total of four lifts/ }).getAttribute("data-points"))).toBeLessThan(before)
    );
  });

  it("shows an empty state with an empty database", async () => {
    render(<ProgressPage />);
    expect(await screen.findByText("No lifts logged yet")).toBeInTheDocument();
    expect(screen.queryByTestId("lift-list")).toBeNull();
  });

  it("the muscles tab shows an empty state with an empty database", async () => {
    search = new URLSearchParams({ tab: "muscles" });
    render(<ProgressPage />);
    expect(await screen.findByText("No muscle data yet")).toBeInTheDocument();
  });
});
