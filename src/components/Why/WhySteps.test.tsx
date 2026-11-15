import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { DecisionTrace } from "@/types";
import { WhySteps, citedRules, spokenEffect } from "./WhySteps";

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

const trace: DecisionTrace = {
  subject: { kind: "weight", exerciseId: "squat", tier: "T1" },
  result: 215,
  unit: "lb",
  steps: [
    { id: "last-session", title: "Last time", detail: "205 × 3.", effect: { op: "start", value: 205, unit: "lb" } },
    {
      id: "progression",
      title: "Progression",
      detail: "A pass adds your step.",
      effect: { op: "add", value: 10, unit: "lb" },
      ruleId: "gzclp-progression",
    },
    {
      id: "phase",
      title: "Cutting phase",
      detail: "Weight stays.",
      effect: { op: "none", unit: "lb" },
      ruleId: "readiness",
    },
    { id: "plates", title: "Plates", detail: "Loads exactly.", effect: { op: "round", value: 215, unit: "lb" } },
  ],
};

describe("WhySteps", () => {
  it("lists every check in order, each readable with its effect", () => {
    render(<WhySteps trace={trace} />);
    const items = within(screen.getByRole("list", { name: /in the order the app ran them/ })).getAllByRole(
      "listitem"
    );
    expect(items.map((li) => li.getAttribute("data-step"))).toEqual([
      "last-session",
      "progression",
      "phase",
      "plates",
    ]);
    expect(items[1]).toHaveTextContent("plus 10 pounds");
    expect(items[2]).toHaveTextContent("no change");
  });

  it("links each grade to its rule in the research library", () => {
    render(<WhySteps trace={trace} />);
    const links = screen.getAllByRole("link", { name: /Program rule/ });
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(link).toHaveAttribute("href", "/research#gzclp-progression");
    expect(screen.getAllByRole("link", { name: /^Moderate/ })[0]).toHaveAttribute("href", "/research#readiness");
  });

  it("numbers the cited rules once each, for the footnotes", () => {
    const cited = citedRules({ ...trace, steps: [...trace.steps, { ...trace.steps[1], id: "again" }] });
    expect([...cited.values()].map((rule) => [rule.id, rule.note])).toEqual([
      ["gzclp-progression", 1],
      ["readiness", 2],
    ]);
    render(<WhySteps trace={trace} />);
    expect(screen.getByRole("list", { name: "Sources" })).toHaveTextContent(
      "GZCLP program rule, not a research finding"
    );
  });

  it("says effects in words", () => {
    expect(spokenEffect({ ...trace.steps[1], effect: { op: "add", value: -5, unit: "lb" } })).toBe(
      "minus 5 pounds"
    );
    expect(spokenEffect({ ...trace.steps[0], effect: { op: "add", value: 30, unit: "s" } })).toBe("plus 0:30");
  });
});
