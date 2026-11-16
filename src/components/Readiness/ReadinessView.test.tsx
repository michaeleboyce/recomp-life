import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { SLEEP_SHORT_HOURS } from "@/lib/health/sleep";
import type { ReadinessScore } from "@/types";
import { ReadinessEmpty, ReadinessView } from "./ReadinessScreen";
import { readinessBackTarget } from "./backLink";
import { forecastShiftText, readinessVerdict, spokenPoints, usualLine } from "./readinessText";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(cleanup);

const score: ReadinessScore = {
  score: 78,
  usual: 72,
  suggestSkippingAccessories: false,
  contributions: [
    { id: "rest-days", label: "Two rest days", detail: "Hamstrings fully recovered", points: 8, ruleId: "recovery-windows" },
    { id: "sleep", label: "Sleep 6 h 23 m", detail: "From Apple Health", points: -3, ruleId: "readiness" },
    { id: "run", label: "Easy run", detail: "Yesterday", points: 0, ruleId: "run-interference" },
  ],
};

describe("ReadinessView", () => {
  it("shows the score, a verdict and the usual", () => {
    render(<ReadinessView score={score} />);
    expect(screen.getByRole("img", { name: "Readiness 78 out of 100" })).toBeInTheDocument();
    expect(screen.getByText("A good day: train as planned.")).toBeInTheDocument();
    expect(screen.getByText(/Your usual is 72\. Two things moved it/)).toBeInTheDocument();
  });

  it("reads each contribution in order with its points in words and its rule", () => {
    render(<ReadinessView score={score} />);
    const rows = within(screen.getByRole("list", { name: "What moved the score" })).getAllByRole("listitem");
    expect(rows.map((row) => row.getAttribute("data-contribution"))).toEqual(["rest-days", "sleep", "run"]);
    expect(rows[0]).toHaveTextContent("adds 8 points");
    expect(rows[1]).toHaveTextContent("takes 3 points");
    expect(rows[2]).toHaveTextContent("no change");
    expect(within(rows[1]).getByRole("link", { name: /^Moderate/ })).toHaveAttribute("href", "/research#readiness");
  });

  it("says what changes today: never a weight, the forecast shift, the one suggestion", () => {
    const { rerender } = render(<ReadinessView score={score} />);
    const card = screen.getByRole("region", { name: "What this changes today" });
    expect(card).toHaveTextContent("Weights: nothing.");
    expect(card).toHaveTextContent(/Forecasts: the strength level .* moves up 0\.3%/);
    expect(card).toHaveTextContent(/Accessories: as planned/);
    expect(card).toHaveTextContent(`only after under ${SLEEP_SHORT_HOURS} hours of sleep with low energy`);
    rerender(<ReadinessView score={{ ...score, suggestSkippingAccessories: true }} />);
    expect(screen.getByRole("region", { name: "What this changes today" })).toHaveTextContent(
      /suggests skipping them today/
    );
    expect(screen.getByRole("region", { name: "What this changes today" })).toHaveTextContent(
      `after under ${SLEEP_SHORT_HOURS} hours of sleep with low energy`
    );
    expect(screen.getByRole("link", { name: "How the score is worked out" })).toHaveAttribute(
      "href",
      "/research#readiness-score"
    );
  });

  it("tells a user with no check-in what to do", () => {
    render(<ReadinessEmpty />);
    expect(screen.getByRole("link", { name: "Answer on the Ready screen" })).toHaveAttribute(
      "href",
      "/workout/configure"
    );
  });
});

describe("readiness words", () => {
  it("never says to change a weight", () => {
    expect(readinessVerdict({ score: 50, usual: 72, suggestSkippingAccessories: false })).toMatch(/Train as planned/);
    expect(readinessVerdict({ score: 50, usual: 72, suggestSkippingAccessories: true })).toMatch(/accessories/);
    expect(readinessVerdict({ score: 72, usual: 72, suggestSkippingAccessories: false })).toBe("Train as planned.");
  });

  it("counts what moved the score and says points in words", () => {
    expect(usualLine({ ...score, contributions: [] })).toBe("Your usual is 72. Nothing moved it today.");
    expect(spokenPoints(1)).toBe("adds 1 point");
    expect(spokenPoints(-4)).toBe("takes 4 points");
    expect(forecastShiftText({ score: 70, usual: 70 })).toMatch(/no change/);
  });

  it("goes back where the user came from", () => {
    expect(readinessBackTarget("ready")).toEqual({ href: "/workout/configure", label: "Ready" });
    expect(readinessBackTarget("today").href).toBe("/");
    expect(readinessBackTarget("https://evil.example").href).toBe("/");
    expect(readinessBackTarget(null).href).toBe("/");
  });
});
