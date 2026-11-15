import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { installNavHistory, resetNavHistoryForTests } from "./navHistory";
import { BackButton } from "./BackButton";

/** Clicks the link and says whether the click was left to the link (no history.back). */
function clickLeftToLink(link: HTMLElement): boolean {
  let leftToLink = false;
  // Runs after React's handler; stops jsdom from trying to load the page.
  const after = (event: Event) => {
    leftToLink = !event.defaultPrevented;
    event.preventDefault();
  };
  window.addEventListener("click", after);
  fireEvent.click(link);
  window.removeEventListener("click", after);
  return leftToLink;
}

let back: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetNavHistoryForTests();
  sessionStorage.clear();
  window.history.replaceState({ __NA: true }, "", "/");
  back = vi.spyOn(window.history, "back").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  resetNavHistoryForTests();
  vi.restoreAllMocks();
});

describe("BackButton without an in-app previous screen", () => {
  it("links to its fallback with the fixed label", () => {
    render(<BackButton variant="label" fallback="/progress" label="Progress" />);
    const link = screen.getByRole("link", { name: "Back to Progress" });
    expect(link).toHaveAttribute("href", "/progress");
    expect(link).toHaveTextContent("Progress");
    expect(clickLeftToLink(link)).toBe(true);
    expect(back).not.toHaveBeenCalled();
  });

  it("is an icon link named Back when it has no label", () => {
    render(<BackButton fallback="/more" />);
    const link = screen.getByRole("link", { name: "Back" });
    expect(link).toHaveAttribute("href", "/more");
    expect(link.querySelector("svg")).toBeInTheDocument();
    // The 44px tap target.
    expect(link).toHaveClass("-m-3", "p-3");
  });

  it("falls back on the first screen of a session, after the tracker starts", () => {
    window.history.replaceState({ __NA: true }, "", "/progress/lift/squat");
    act(() => installNavHistory());
    render(<BackButton variant="label" fallback="/progress" label="Progress" />);
    expect(clickLeftToLink(screen.getByRole("link", { name: "Back to Progress" }))).toBe(true);
    expect(back).not.toHaveBeenCalled();
  });
});

describe("BackButton with an in-app previous screen", () => {
  beforeEach(() => {
    act(() => {
      installNavHistory();
      window.history.pushState({ __NA: true }, "", "/progress");
      window.history.pushState({ __NA: true }, "", "/progress/forecasts");
      window.history.pushState({ __NA: true }, "", "/progress/lift/squat");
    });
  });

  it("goes back through history and names the previous screen", () => {
    render(<BackButton variant="label" fallback="/progress" label="Progress" />);
    const link = screen.getByRole("link", { name: "Back to Forecasts" });
    expect(link).toHaveTextContent("Forecasts");
    // The fixed target stays as the link's address (open in a new tab, no script).
    expect(link).toHaveAttribute("href", "/progress");
    expect(clickLeftToLink(link)).toBe(false);
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("names the previous screen on an icon link too", () => {
    render(<BackButton fallback="/progress" />);
    fireEvent.click(screen.getByRole("link", { name: "Back to Forecasts" }));
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("says Back for a previous screen with no name", () => {
    act(() => {
      window.history.pushState({ __NA: true }, "", "/somewhere-new");
      window.history.pushState({ __NA: true }, "", "/progress/lift/bench");
    });
    render(<BackButton variant="label" fallback="/progress" label="Progress" />);
    expect(screen.getByRole("link", { name: "Back" })).toHaveTextContent("Back");
  });

  it("leaves a modified click (new tab) to the link", () => {
    render(<BackButton fallback="/progress" />);
    const link = screen.getByRole("link", { name: "Back to Forecasts" });
    const after = (event: Event) => event.preventDefault();
    window.addEventListener("click", after);
    fireEvent.click(link, { metaKey: true });
    window.removeEventListener("click", after);
    expect(back).not.toHaveBeenCalled();
  });
});
