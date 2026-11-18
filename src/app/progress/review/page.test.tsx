import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { DEFAULT_USER_PROFILE } from "@/db/seed";
import { generateDemoData } from "@/lib/demo/generateDemoData";
import {
  buildWeeklyReview,
  previousWeek,
  reviewWeeks,
  weekOf,
  type ReviewSource,
} from "@/lib/review";
import { importedSession, importedSet } from "@/lib/import/testRecords";
import type { ImportedSessionRecord, UserSettings } from "@/types";

// Friday 13 Nov 2026: the last completed week is 2-8 Nov.
const NOW = new Date(2026, 10, 13, 12);
const demo = generateDemoData(NOW);
let settings: UserSettings;
let imported: ImportedSessionRecord[] = [];

function source(): ReviewSource {
  return {
    workouts: demo.workouts,
    e1rms: demo.estimated1RMs,
    bodyweight: demo.bodyweight,
    runs: demo.runs,
    readiness: demo.readinessLogs,
    pain: demo.painEntries,
    liftStates: demo.liftStates,
    settings,
    activities: [],
    imported,
  };
}

const replace = vi.fn();
let search = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => "/progress/review",
  useSearchParams: () => search,
}));
vi.mock("@/hooks", () => ({
  useSettings: () => settings,
  useWeeklyReview: (week?: Date) => {
    const src = source();
    const thisWeek = weekOf(NOW);
    const lastWeek = previousWeek(thisWeek);
    return {
      review: buildWeeklyReview(src, [], week ?? lastWeek, NOW, { sessionTarget: 5 }),
      weeks: reviewWeeks(src, NOW),
      thisWeek,
      lastWeek,
    };
  },
}));

import WeeklyReviewPage from "./page";

const phase = (mode: "cutting" | "maintaining"): UserSettings => ({
  ...DEFAULT_USER_PROFILE.settings,
  trainingPhase: { mode },
});

const hrefs = () => screen.getAllByRole("link").map((a) => a.getAttribute("href"));
const range = () => screen.getByText(/^[A-Z][a-z]{2} \d+ – /).textContent;

beforeEach(() => {
  replace.mockClear();
  search = new URLSearchParams();
  settings = phase("cutting");
  imported = [];
});
afterEach(cleanup);

describe("Weekly review page", () => {
  it("opens on the last completed week with its sections, linked to their details", () => {
    render(<WeeklyReviewPage />);
    expect(screen.getByRole("heading", { name: "Weekly review" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back" })).toHaveAttribute("href", "/progress");
    expect(range()).toBe("Nov 2 – 8");
    for (const title of ["Training", "Body", "Volume", "Cardio and recovery"]) {
      expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    }
    const links = hrefs();
    for (const target of [
      "/progress/lift/squat",
      "/progress/lift/bench",
      "/progress/lift/deadlift",
      "/progress/lift/ohp",
      "/progress/body",
      "/progress?tab=muscles",
      "/progress?tab=runs",
      "/log",
    ]) {
      expect(links).toContain(target);
    }
    expect(screen.getByRole("img", { name: "Hard sets per muscle group this week" })).toBeInTheDocument();
    expect(document.querySelector('[data-term="e1rm"]')).not.toBeNull();
    expect(document.querySelector('[data-term="hard-set"]')).not.toBeNull();
  });

  it("counts a made-up imported session and says how many were imported", () => {
    imported = [importedSession([importedSet(), importedSet()], { startedAt: new Date(2026, 10, 3, 7) })];
    render(<WeeklyReviewPage />);
    const sessions = screen.getByRole("link", { name: /^Sessions/ });
    expect(sessions).toHaveTextContent("1 imported");
    const squat = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "/progress/lift/squat")!;
    expect(squat).toHaveTextContent("1 imported");
    expect(screen.getByRole("region", { name: "Volume" })).toHaveTextContent("Includes 1 imported session.");
  });

  it("counts a made-up imported dumbbell bench in the bench row, at home, and names it when it gives the best", () => {
    const db = importedSet({
      exerciseName: "Made-up DB Bench",
      mappedExerciseId: "db_bench",
      weightPerImplementLb: 120,
      implementCount: 2,
      reps: 8,
    });
    imported = [importedSession([db], { startedAt: new Date(2026, 10, 7, 9) })];
    const plain = buildWeeklyReview({ ...source(), imported: [] }, [], new Date(2026, 10, 2), NOW).lifts.find(
      (l) => l.id === "bench"
    )!;
    render(<WeeklyReviewPage />);
    const benchRow = screen.getAllByRole("link").find((a) => a.getAttribute("href") === "/progress/lift/bench")!;
    expect(benchRow).toHaveTextContent(`${plain.sessions + 1} sessions, 1 as a home version, 1 imported`);
    expect(within(benchRow).getByTestId("best-from-bench")).toHaveTextContent("Best from DB Bench Press");
    expect(within(benchRow).queryByText(/best$/)).toBeNull();
  });

  it("switches weeks through the URL and shows that week's numbers", () => {
    const { unmount } = render(<WeeklyReviewPage />);
    const tonnage = () => within(screen.getByText("Tonnage").closest("a")!).getByText(/^[0-9,]+ lbs$/).textContent;
    const before = tonnage();
    fireEvent.click(screen.getByRole("button", { name: "Previous week" }));
    expect(replace).toHaveBeenCalledWith("/progress/review?week=2026-10-26", { scroll: false });
    unmount();

    search = new URLSearchParams({ week: "2026-10-26" });
    render(<WeeklyReviewPage />);
    expect(range()).toBe("Oct 26 – Nov 1");
    const review = buildWeeklyReview(source(), [], new Date(2026, 9, 26), NOW, { sessionTarget: 5 });
    const sessions = within(screen.getByText("Sessions").closest("a")!).getByText(/ of 5$/).textContent;
    expect(sessions).toBe(`${review.sessions.count} of 5`);
    expect(tonnage()).not.toBe(before);
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(replace).toHaveBeenLastCalledWith("/progress/review?week=2026-11-02", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "This week so far" }));
    expect(replace).toHaveBeenLastCalledWith("/progress/review?week=2026-11-09", { scroll: false });
  });

  it("disables next on the current week", () => {
    search = new URLSearchParams({ week: "2026-11-11" });
    render(<WeeklyReviewPage />);
    expect(range()).toBe("Nov 9 – 15");
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "This week so far" })).toBeNull();
    expect(screen.getByText("This week so far")).toBeInTheDocument();
  });

  it("shows an empty state for a week with nothing logged, keeping the switcher", () => {
    search = new URLSearchParams({ week: "2026-09-07" });
    render(<WeeklyReviewPage />);
    expect(screen.getByText("Nothing logged that week")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Training" })).toBeNull();
    expect(screen.getByRole("button", { name: "This week so far" })).toBeEnabled();
  });

  it("shows the pace and target band only while cutting", () => {
    render(<WeeklyReviewPage />);
    expect(screen.getByText(/^Target /)).toBeInTheDocument();
    expect(screen.getByText(/^(on pace|slow|fast|gaining)$/)).toBeInTheDocument();
    cleanup();
    settings = phase("maintaining");
    render(<WeeklyReviewPage />);
    expect(screen.queryByText(/^Target /)).toBeNull();
    expect(screen.queryByText(/^(on pace|slow|fast|gaining)$/)).toBeNull();
    expect(screen.getByText("7-day average")).toBeInTheDocument();
  });

  it("lists takeaways with links", () => {
    render(<WeeklyReviewPage />);
    const rows = screen.getAllByTestId("takeaway");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(within(rows[0]).getByRole("link")).toHaveAttribute("href");
  });
});
