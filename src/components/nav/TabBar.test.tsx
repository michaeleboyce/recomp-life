import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const pathname = vi.fn<() => string>();
let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname(),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/hooks", () => ({
  useNextWorkout: () => undefined,
  useBodyweightLog: () => undefined,
  useRuns: () => undefined,
  useFavoriteWorkouts: () => undefined,
}));

import { TabBar, activeTab } from "./TabBar";

function renderAt(path: string, query = "") {
  pathname.mockReturnValue(path);
  search = query;
  return render(<TabBar />);
}

describe("activeTab", () => {
  it.each([
    ["/", "today"],
    ["/progress", "progress"],
    ["/progress/lift/squat", "progress"],
    ["/muscles", "progress"],
    ["/progress/upcoming", "more"],
    ["/log", "log"],
    ["/log/workout", "log"],
    ["/more", "more"],
    ["/settings", "more"],
    ["/exercises/squat", "more"],
    ["/research", "more"],
    ["/1rm-calculator", "more"],
    ["/plate-calculator", "more"],
    ["/weigh-in", null],
    ["/workout/configure", null],
    ["/progressive", null],
  ])("%s -> %s", (path, tab) => {
    expect(activeTab(path)).toBe(tab);
  });
});

describe("activeTab with from", () => {
  it("lights Today for Coming up opened from Today", () => {
    expect(activeTab("/progress/upcoming", "today")).toBe("today");
  });
  it("ignores other and unknown values", () => {
    expect(activeTab("/progress/upcoming", "bogus")).toBe("more");
    expect(activeTab("/progress/upcoming", null)).toBe("more");
    expect(activeTab("/log", "today")).toBe("log");
  });
});

describe("TabBar", () => {
  beforeEach(() => pathname.mockReset());
  afterEach(cleanup);

  it("links the four tabs", () => {
    renderAt("/");
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Progress" })).toHaveAttribute("href", "/progress");
    expect(screen.getByRole("link", { name: "Log" })).toHaveAttribute("href", "/log");
    expect(screen.getByRole("link", { name: "More" })).toHaveAttribute("href", "/more");
  });

  it.each([
    ["/", "Today"],
    ["/progress", "Progress"],
    ["/muscles", "Progress"],
    ["/log", "Log"],
    ["/more", "More"],
    ["/settings", "More"],
    ["/exercises", "More"],
    ["/favorites", "More"],
    ["/research", "More"],
    ["/1rm-calculator", "More"],
    ["/plate-calculator", "More"],
  ])("marks only the right tab active on %s", (path, label) => {
    renderAt(path);
    const current = screen
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(label);
  });

  it("lights Today on Coming up when it was opened from Today", () => {
    renderAt("/progress/upcoming", "from=today");
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "More" })).not.toHaveAttribute("aria-current");
  });

  it("passes where quick add was opened to the logging screens", () => {
    renderAt("/progress", "tab=body");
    fireEvent.click(screen.getByRole("button", { name: "Quick add" }));
    expect(screen.getByRole("link", { name: /Log weight/ })).toHaveAttribute("href", "/weigh-in?from=body");
  });

  it("marks no tab active on an unrelated route", () => {
    renderAt("/weigh-in");
    expect(
      screen.getAllByRole("link").some((l) => l.hasAttribute("aria-current"))
    ).toBe(false);
  });

  it("does not mark Today active away from /", () => {
    renderAt("/log");
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current");
  });

  it("has a centre button that opens the quick add sheet", () => {
    renderAt("/");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quick add" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Start workout/ })).toHaveAttribute(
      "href",
      "/workout/configure"
    );
  });

  it("respects the bottom safe area", () => {
    renderAt("/");
    expect(screen.getByRole("navigation", { name: "Main" }).className).toContain(
      "pb-[env(safe-area-inset-bottom)]"
    );
  });
});
