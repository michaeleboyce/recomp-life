import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WeeklyReviewLink } from "./WeeklyReviewLink";

afterEach(cleanup);

describe("WeeklyReviewLink", () => {
  it("on Sunday links to the week ending today", () => {
    render(<WeeklyReviewLink now={new Date(2026, 10, 8, 20)} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/progress/review?week=2026-11-02");
    expect(screen.getByText(/Nov 2 – 8/)).toBeInTheDocument();
  });

  it("on Monday links to the week that just finished", () => {
    render(<WeeklyReviewLink now={new Date(2026, 10, 9, 7)} />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/progress/review?week=2026-11-02");
  });

  it("renders nothing on other days", () => {
    const { container } = render(<WeeklyReviewLink now={new Date(2026, 10, 10, 7)} />);
    expect(container).toBeEmptyDOMElement();
  });
});
