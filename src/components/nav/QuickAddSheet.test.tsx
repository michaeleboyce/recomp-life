import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const hooks = vi.hoisted(() => ({
  useDueTemplateId: vi.fn(),
  useBodyweightLog: vi.fn(),
  useRuns: vi.fn(),
  useFavoriteWorkouts: vi.fn(),
}));
vi.mock("@/hooks", () => hooks);

import { QuickAddSheet } from "./QuickAddSheet";

function setHooks(
  overrides: { next?: unknown; weights?: unknown; runs?: unknown; favorites?: unknown } = {}
) {
  const data = {
    favorites: [{ id: "a" }, { id: "b" }],
    next: "A1",
    weights: [{ weight: 230 }, { weight: 226 }],
    runs: [{ distanceMiles: 3.1 }, { distanceMiles: 5 }],
    ...overrides,
  };
  hooks.useDueTemplateId.mockReturnValue(data.next);
  hooks.useBodyweightLog.mockReturnValue(data.weights);
  hooks.useRuns.mockReturnValue(data.runs);
  hooks.useFavoriteWorkouts.mockReturnValue(data.favorites);
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
    expect(screen.getByRole("link", { name: /Log activity/ })).toHaveAttribute("href", "/activity");
    expect(screen.getByRole("link", { name: /Body check/ })).toHaveAttribute("href", "/body-check");
  });

  it("shows the next workout, last weight and last run from the hooks", () => {
    render(<QuickAddSheet open onOpenChange={() => {}} />);
    expect(screen.getByRole("link", { name: /Start workout/ })).toHaveTextContent("A1 · Squat day");
    expect(screen.getByRole("link", { name: /Log weight/ })).toHaveTextContent("last 226.0");
    expect(screen.getByRole("link", { name: /Log activity/ })).toHaveTextContent("last 3.1 mi");
  });

  it("omits secondary text while hooks are loading", () => {
    setHooks({ next: undefined, weights: undefined, runs: undefined });
    render(<QuickAddSheet open onOpenChange={() => {}} />);
    expect(screen.getByRole("link", { name: "Start workout" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log weight" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log activity" })).toBeInTheDocument();
  });

  it("omits secondary text when there is no data or no distance", () => {
    setHooks({ weights: [], runs: [{ distanceMiles: null }] });
    render(<QuickAddSheet open onOpenChange={() => {}} />);
    expect(screen.getByRole("link", { name: "Log weight" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Log activity" })).toBeInTheDocument();
  });

  it("links to the favourites with how many are saved", () => {
    const { unmount } = render(<QuickAddSheet open onOpenChange={() => {}} />);
    const row = screen.getByRole("link", { name: /Start a favourite/ });
    expect(row).toHaveAttribute("href", "/favorites");
    expect(row).toHaveTextContent("2 saved");
    unmount();

    setHooks({ favorites: [] });
    render(<QuickAddSheet open onOpenChange={() => {}} />);
    expect(screen.getByRole("link", { name: /Start a favourite/ })).toHaveTextContent("None saved yet");
  });

  it("closes the sheet when a row is chosen", () => {
    const onOpenChange = vi.fn();
    render(<QuickAddSheet open onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByRole("link", { name: /Log activity/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
