import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { EvidenceLine } from "./EvidenceLine";
import { StrengthBadge } from "./StrengthBadge";
import { RuleDetail } from "./RuleDetail";
import {
  formatShortCitation,
  getAllRules,
  getRule,
  getSources,
} from "@/lib/evidence";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

describe("EvidenceLine", () => {
  it("shows the one-line reason and the short citation", () => {
    render(<EvidenceLine ruleId="rest-light" />);
    expect(screen.getByText(getRule("rest-light").summary)).toBeTruthy();
    expect(screen.getByText("Singer 2024 · meta-analysis")).toBeTruthy();
  });

  it("does not show the sheet until tapped", () => {
    render(<EvidenceLine ruleId="rest-light" />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens a sheet with what the app does, why, and the strength", () => {
    render(<EvidenceLine ruleId="rest-light" />);
    fireEvent.click(screen.getByRole("button"));

    const dialog = screen.getByRole("dialog");
    const rule = getRule("rest-light");
    expect(within(dialog).getByText(rule.title)).toBeTruthy();
    expect(within(dialog).getByText(rule.appBehavior)).toBeTruthy();
    expect(within(dialog).getByText(rule.rationale)).toBeTruthy();
    expect(within(dialog).getByText("Moderate evidence")).toBeTruthy();
  });

  it("links every source to its paper in a new tab", () => {
    render(<EvidenceLine ruleId="rest-heavy" />);
    fireEvent.click(screen.getByRole("button"));

    const dialog = screen.getByRole("dialog");
    const paperLinks = within(dialog).getAllByRole("link", { name: /read the paper/i });
    const sources = getSources("rest-heavy");

    expect(paperLinks.map((a) => a.getAttribute("href"))).toEqual(sources.map((s) => s.url));
    for (const link of paperLinks) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });

  it("offers the free full text when a source has one", () => {
    render(<EvidenceLine ruleId="rest-light" />);
    fireEvent.click(screen.getByRole("button"));

    const link = within(screen.getByRole("dialog")).getByRole("link", { name: /free full text/i });
    expect(link.getAttribute("href")).toBe(getSources("rest-light")[0].fullTextUrl);
  });

  it("links to the rule on the research page", () => {
    render(<EvidenceLine ruleId="time-off" />);
    fireEvent.click(screen.getByRole("button"));

    const link = within(screen.getByRole("dialog")).getByRole("link", { name: /see all research/i });
    expect(link.getAttribute("href")).toBe("/research#time-off");
  });

  it("can hide the research-page link during a workout", () => {
    render(<EvidenceLine ruleId="rest-light" hideLibraryLink />);
    fireEvent.click(screen.getByRole("button"));

    expect(
      within(screen.getByRole("dialog")).queryByRole("link", { name: /see all research/i })
    ).toBeNull();
  });

  it("is honest when a rule has no research behind it", () => {
    render(<EvidenceLine ruleId="rest-cut-bonus" />);
    expect(screen.getByText("Coaching heuristic · no direct research")).toBeTruthy();

    fireEvent.click(screen.getByRole("button"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Coaching heuristic")).toBeTruthy();
    expect(within(dialog).getByText(/No direct research/)).toBeTruthy();
    expect(within(dialog).queryByRole("link", { name: /read the paper/i })).toBeNull();
  });

  it("labels program rules as program rules, not research", () => {
    render(<EvidenceLine ruleId="gzclp-progression" />);
    expect(screen.getByText("GZCLP program rule")).toBeTruthy();
  });

  it("icon variant shows only an accessible button", () => {
    render(<EvidenceLine ruleId="rest-light" variant="icon" />);
    const button = screen.getByRole("button");
    expect(button.getAttribute("aria-label")).toContain(getRule("rest-light").title);
    expect(screen.queryByText(getRule("rest-light").summary)).toBeNull();

    fireEvent.click(button);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("does not trigger a click handler on a wrapping element", () => {
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <EvidenceLine ruleId="rest-light" />
      </div>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it("renders for every rule in the registry", () => {
    for (const rule of getAllRules()) {
      const { unmount } = render(<EvidenceLine ruleId={rule.id} />);
      expect(screen.getByText(rule.summary)).toBeTruthy();
      expect(screen.getByText(formatShortCitation(rule.id))).toBeTruthy();
      unmount();
    }
  });
});

describe("StrengthBadge", () => {
  it("names each grade", () => {
    const { rerender } = render(<StrengthBadge strength="strong" />);
    expect(screen.getByText("Strong evidence")).toBeTruthy();
    rerender(<StrengthBadge strength="limited" />);
    expect(screen.getByText("Limited evidence")).toBeTruthy();
    rerender(<StrengthBadge strength="heuristic" />);
    expect(screen.getByText("Coaching heuristic")).toBeTruthy();
    rerender(<StrengthBadge strength="program" />);
    expect(screen.getByText("Program rule")).toBeTruthy();
  });
});

describe("RuleDetail", () => {
  it("shows activation notes for planned rules", () => {
    render(<RuleDetail ruleId="deload" />);
    expect(screen.getByText("Before this is switched on")).toBeTruthy();
    expect(screen.getByText(getRule("deload").activationNotes!)).toBeTruthy();
  });

  it("shows the limits of the evidence when a rule has a caveat", () => {
    render(<RuleDetail ruleId="time-off" />);
    expect(screen.getByText(getRule("time-off").caveat!)).toBeTruthy();
  });
});
