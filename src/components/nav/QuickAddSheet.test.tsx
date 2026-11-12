import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { WORKOUT_TEMPLATES } from "@/lib/workoutTemplates";

const hooks = vi.hoisted(() => ({
  useNextWorkout: vi.fn(),
  useBodyweightLog: vi.fn(),
  useRuns: vi.fn(),
}));
vi.mock("@/hooks", () => hooks);

import { QuickAddSheet } from "./QuickAddSheet";

const a1 = WORKOUT_TEMPLATES.A1;

function setHooks(overrides: { next?: unknown; weights?: unknown; runs?: unknown } = {}) {
  const data = {
    next: { templateId: "A1", template: a1, plan: [] },
    weights: [{ weight: 230 }, { weight: 226 }],
    runs: [{ distanceMiles: 3.1 }, { distanceMiles: 5 }],
    ...overrides,
  };
  hooks.useNextWorkout.mockReturnValue(data.next);
  hooks.useBodyweightLog.mockReturnValue(data.weights);
  hooks.useRuns.mockReturnValue(data.runs);
}

describe("QuickAddSheet", () => {
  beforeEach(() => setHooks());
  afterEach(cleanup);

  it("renders nothing when closed", () => {
    render(<QuickAddSheet open={false} onOpenChange={() => {}} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("links each row to its route", () => {
    render(<QuickAddSheet open onOpenChange={() => {}} />);
    expect(screen.getByRole("link", { name: /Start workout/ })).toHaveAttribute(
      "href",
      "/workout/configure"
    );
    expect(screen.getByRole("link", { name: /Log weight/ })).toHaveAttribute("href", "/weigh-in");
    expect(screen.getByRole("link", { name: /Log run/ })).toHaveAttribute("href", "/run");
    expect(screen.getByRole("link", { name: /Body check/ })).toHaveAttribute("href", "/body-check");
  });

  it("shows the next workout, last weight and last run from the hooks", () => {
    render(<QuickAddSheet open onOpenChange={() => {}} />);
    expect(screen.getByRole("link", { name: /Start workout/ })).toHaveTextContent(/A1/);
    expect(screen.getByRole("link", { name: /Start workout/ })).toHaveTextContent(/Squat/i);
    expect(screen.getByRole("link", { name: /Log weight/ })).toHaveTextContent("last 226.0");
    expect(screen.getByRole("link", { name: /Log run/ })).toHaveTextContent("last 3.1 mi");
  });

  it("omits secondary text while hooks are loading", () => {
    setHooks({ next: undefined, weights: undefined, runs: undefined });
    render(<QuickAddSheet open onOpenChange={() => {}} />);
    expect(screen.getByRole("link", { name: "Start workout" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log weight" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log run" })).toBeInTheDocument();
  });

  it("omits secondary text when there is no data or no distance", () => {
    setHooks({ weights: [], runs: [{ distanceMiles: null }] });
    render(<QuickAddSheet open onOpenChange={() => {}} />);
    expect(screen.getByRole("link", { name: "Log weight" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log run" })).toBeInTheDocument();
  });

  it("closes the sheet when a row is chosen", () => {
    const onOpenChange = vi.fn();
    render(<QuickAddSheet open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("link", { name: /Log run/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
