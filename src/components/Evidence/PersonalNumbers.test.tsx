import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import {
  NOT_PROOF,
  PERSONAL_MIN_GROUP_SIZE,
  formatSignedReps,
  personalEvidenceFor,
  type PersonalEvidence,
} from "@/lib/evidence/personal";
import { constructedHistory, emptyLog } from "@/lib/evidence/personal/testHelpers";
import type { RuleId } from "@/lib/evidence";

const NOW = new Date("2026-11-15T12:00:00Z");
const shown = (id: RuleId) => personalEvidenceFor(id, constructedHistory(NOW), NOW)!;
const empty = (id: RuleId) => personalEvidenceFor(id, emptyLog(), NOW)!;

// The rule page reads the hook; give it constructed evidence for the three rules.
let byRule: Partial<Record<RuleId, PersonalEvidence | null>> = {};
vi.mock("@/hooks/usePersonalEvidence", () => ({
  usePersonalEvidence: (id: RuleId) => byRule[id] ?? null,
}));

import { PersonalNumbers } from "./PersonalNumbers";
import { RulePage } from "./RulePage";

afterEach(() => {
  cleanup();
  byRule = {};
});

describe("PersonalNumbers with enough history", () => {
  it("shows both averages with their group sizes, the gap with its range, and the verdict", () => {
    const evidence = shown("rest-heavy");
    const r = evidence.result!;
    render(<PersonalNumbers evidence={evidence} />);

    const card = screen.getByRole("region", { name: "Your own numbers" });
    const total = evidence.exposed.count + evidence.reference.count;
    expect(within(card).getByText(`${total} heavy sets`)).toBeInTheDocument();
    // The big numbers are the two averages, in order.
    const big = card.querySelectorAll('[data-slot="personal-average"]');
    expect([...big].map((el) => el.textContent)).toEqual([
      formatSignedReps(r.exposedMean),
      formatSignedReps(r.referenceMean),
    ]);
    expect(
      within(card).getByText(`${evidence.exposed.label} (${evidence.exposed.count} heavy sets)`)
    ).toBeInTheDocument();
    expect(
      within(card).getByText(`${evidence.reference.label} (${evidence.reference.count} heavy sets)`)
    ).toBeInTheDocument();
    expect(card).toHaveTextContent(
      `Gap ${formatSignedReps(r.difference)} reps, with a rough 90% range of ${formatSignedReps(r.low)} to ${formatSignedReps(r.high)}.`
    );
    expect(within(card).getByText("Agrees with the research.")).toBeInTheDocument();
    expect(within(card).getByText(`${NOT_PROOF}.`)).toBeInTheDocument();
  });

  it("words every verdict", () => {
    const base = shown("readiness");
    const cases = [
      ["unclear", "No clear difference yet."],
      ["opposite", "Points the other way."],
    ] as const;
    for (const [verdict, text] of cases) {
      const { unmount } = render(
        <PersonalNumbers evidence={{ ...base, result: { ...base.result!, verdict } }} />
      );
      expect(screen.getByText(text)).toBeInTheDocument();
      expect(screen.getByText(`${NOT_PROOF}.`)).toBeInTheDocument();
      unmount();
    }
  });

  it("explains how it is worked out", () => {
    const evidence = shown("run-interference");
    render(<PersonalNumbers evidence={evidence} />);
    expect(screen.getByText("How this is worked out")).toBeInTheDocument();
    for (const sentence of evidence.method) expect(screen.getByText(sentence)).toBeInTheDocument();
  });
});

describe("PersonalNumbers below the minimum sample", () => {
  it("shows no numbers and says how many more of each are needed", () => {
    render(<PersonalNumbers evidence={empty("readiness")} />);
    const card = screen.getByRole("region", { name: "Your own numbers" });
    expect(card).toHaveTextContent("Not enough in your log yet to compare.");
    expect(card).toHaveTextContent(
      `Needs ${PERSONAL_MIN_GROUP_SIZE} more sessions after under 7 hours of sleep and ${PERSONAL_MIN_GROUP_SIZE} more after 7 hours or more.`
    );
    expect(card).not.toHaveTextContent("Gap");
    expect(card).not.toHaveTextContent(/agrees with the research/i);
  });

  it("names only the group still short", () => {
    const evidence: PersonalEvidence = {
      ...empty("run-interference"),
      exposed: { ...empty("run-interference").exposed, count: 2 },
      reference: { ...empty("run-interference").reference, count: 9 },
      needed: { exposed: 3, reference: 0 },
    };
    render(<PersonalNumbers evidence={evidence} />);
    expect(
      screen.getByText("Needs 3 more leg sessions within 24 hours of a hard run or session.")
    ).toBeInTheDocument();
    expect(screen.getByRole("region")).toHaveTextContent(
      "So far: 2 leg sessions within 24 hours of a hard run or session, and 9 with no hard run or session in the 24 hours before."
    );
  });

  it("says why sets of one kind wait for a match", () => {
    const evidence: PersonalEvidence = { ...empty("rest-heavy"), unmatched: 144 };
    render(<PersonalNumbers evidence={evidence} />);
    expect(screen.getByRole("region")).toHaveTextContent(
      "144 heavy sets wait for a match: sets are compared only with sets of the same kind"
    );
  });
});

describe("on the rule page", () => {
  it("shows the card for rest, a run the day before and sleep", () => {
    for (const id of ["rest-heavy", "run-interference", "readiness"] as const) {
      byRule = { [id]: shown(id) };
      const { container, unmount } = render(<RulePage ruleId={id} backHref="/research" />);
      expect(container.querySelector(`[data-personal-evidence="${id}"]`)).not.toBeNull();
      unmount();
    }
  });

  it("sits after 'Where it could be wrong' and before the sources", () => {
    byRule = { "rest-heavy": shown("rest-heavy") };
    render(<RulePage ruleId="rest-heavy" backHref="/research" />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    const own = headings.indexOf("Your own numbers");
    expect(own).toBe(headings.indexOf("Where it could be wrong") + 1);
    expect(headings.indexOf("Sources")).toBeGreaterThan(own);
  });

  it("shows nothing for other rules", () => {
    render(<RulePage ruleId="rest-light" backHref="/research" />);
    expect(screen.queryByText("Your own numbers")).toBeNull();
  });
});
