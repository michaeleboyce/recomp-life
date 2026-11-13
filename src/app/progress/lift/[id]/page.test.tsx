import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { db } from "@/db/local";
import { clearDb, makeProfile } from "@/lib/data/testUtils";
import { generateDemoData } from "@/lib/demo/generateDemoData";

let id = "squat";
vi.mock("next/navigation", () => ({
  useParams: () => ({ id }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/chart-kit/LazyTrendChart", () => ({
  LazyTrendChart: (props: {
    ariaLabel: string;
    series: { points: unknown[] };
    overlays?: Array<{ label: string }>;
  }) => (
    <div
      role="img"
      aria-label={props.ariaLabel}
      data-points={props.series.points.length}
      data-overlays={(props.overlays ?? []).map((o) => o.label).join(",")}
    />
  ),
  TrendChartSkeleton: () => null,
}));

import LiftPage from "./page";

const demo = generateDemoData(new Date());

async function seedDemo() {
  await db.workouts.bulkPut(demo.workouts);
  await db.estimated1RMs.bulkPut(demo.estimated1RMs);
  await db.liftStates.bulkPut(demo.liftStates);
  await db.userProfile.put(makeProfile());
}

beforeEach(async () => {
  id = "squat";
  await clearDb();
});
afterEach(cleanup);

describe("Lift detail page", () => {
  it("shows the headline, PR line, stats and sessions", async () => {
    await seedDemo();
    render(<LiftPage />);
    expect(await screen.findByRole("heading", { name: "Barbell Squat" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/progress");
    expect(screen.getByRole("link", { name: "Form and muscles" })).toHaveAttribute(
      "href",
      "/exercises/squat"
    );

    const latest = demo.estimated1RMs
      .filter((r) => r.exerciseId === "squat")
      .sort((a, b) => +a.date - +b.date)
      .at(-1)!.estimated1RM;
    expect(await screen.findByTestId("e1rm-latest")).toHaveTextContent(String(Math.round(latest)));

    const squat = demo.liftStates.find((s) => s.exerciseId === "squat")!;
    expect(screen.getByTestId("pr-line")).toHaveTextContent(`Next squat is ${squat.t1Weight}.`);

    const stats = screen.getByRole("region", { name: "Lift stats" });
    for (const label of ["Working", "Last set", "Effort", "Volume"]) {
      expect(stats).toHaveTextContent(label);
    }
    expect(within(stats).getByRole("button", { name: "What does Last set mean?" })).toHaveAttribute("data-term", "amrap");
    expect(within(stats).getByRole("button", { name: "What does Effort mean?" })).toHaveAttribute("data-term", "rpe");
    // Each tier in the session list is explained once.
    const sessions = screen.getByRole("region", { name: "Sessions" });
    expect(within(sessions).getAllByRole("button", { name: "What does T1 mean?" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Projection/ })).toHaveAttribute(
      "href",
      "/progress/lift/squat/projection"
    );
    expect(screen.getAllByTestId("session-row").length).toBeGreaterThan(0);
    expect(screen.getAllByText("best")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "What does Estimated 1RM mean?" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("Estimated 1RM");
  });

  it("draws the trend overlay with enough points", async () => {
    await seedDemo();
    render(<LiftPage />);
    const chart = await screen.findByRole("img", { name: /estimated 1RM over time/ });
    expect(Number(chart.getAttribute("data-points"))).toBeGreaterThanOrEqual(4);
    expect(chart).toHaveAttribute("data-overlays", "Trend");
  });

  it("a range change alters the summarised numbers", async () => {
    await seedDemo();
    render(<LiftPage />);
    await screen.findByTestId("e1rm-latest");
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    const allStats = screen.getByRole("region", { name: "Lift stats" }).textContent;
    const allPoints = screen.getByRole("img", { name: /estimated 1RM/ }).getAttribute("data-points");
    fireEvent.click(screen.getByRole("radio", { name: "4w" }));
    await waitFor(() =>
      expect(screen.getByRole("region", { name: "Lift stats" }).textContent).not.toBe(allStats)
    );
    expect(screen.getByRole("img", { name: /estimated 1RM/ }).getAttribute("data-points")).not.toBe(
      allPoints
    );
  });

  it("keeps the extra charts behind a disclosure", async () => {
    await seedDemo();
    render(<LiftPage />);
    const toggle = await screen.findByRole("button", { name: "More charts" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Weekly volume")).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    for (const title of ["Working weight", "Last-set reps", "Effort (RPE)", "Weekly volume"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
  });

  it("shows ten sessions, then all of them", async () => {
    await seedDemo();
    render(<LiftPage />);
    await screen.findByTestId("e1rm-latest");
    const total = demo.workouts.filter((w) =>
      w.sets.some((s) => s.exerciseId === "squat" && s.tier !== "warmup")
    ).length;
    expect(total).toBeGreaterThan(10);
    expect(screen.getAllByTestId("session-row")).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: /Show all/ }));
    expect(screen.getAllByTestId("session-row").length).toBeGreaterThanOrEqual(total);
  });

  it("shows an empty state with no data", async () => {
    render(<LiftPage />);
    expect(await screen.findByText("No squat sessions yet")).toBeInTheDocument();
  });

  it("an unknown id links back to Progress", async () => {
    id = "lat_pulldown";
    render(<LiftPage />);
    expect(screen.getByText("No such lift")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Progress" })).toHaveAttribute("href", "/progress");
  });
});
