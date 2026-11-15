import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { EvidenceStrength } from "@/types";
import { GradeChip, GRADE_LABELS } from "./grade-chip";
import { StrengthBadge } from "@/components/Evidence/StrengthBadge";

const ALL: EvidenceStrength[] = ["strong", "moderate", "limited", "heuristic", "program"];

describe("GradeChip", () => {
  it("always shows the grade's word", () => {
    for (const strength of ALL) {
      const { unmount } = render(<GradeChip strength={strength} />);
      const chip = screen.getByText(GRADE_LABELS[strength]);
      expect(chip).toHaveAttribute("data-strength", strength);
      unmount();
    }
    expect(Object.values(GRADE_LABELS)).toEqual([
      "Strong",
      "Moderate",
      "Limited",
      "Heuristic",
      "Program rule",
    ]);
  });

  it("dashes the heuristic outline and fills strong, so shape differs as well as colour", () => {
    const { rerender } = render(<GradeChip strength="heuristic" />);
    expect(screen.getByText("Heuristic")).toHaveClass("border-dashed");
    rerender(<GradeChip strength="strong" />);
    const strong = screen.getByText("Strong");
    expect(strong).not.toHaveClass("border-dashed");
    expect(strong.className).toContain("bg-[var(--grade-strong)]");
  });

  it("uses only grade tokens for colour", () => {
    for (const strength of ALL) {
      const { container, unmount } = render(<GradeChip strength={strength} />);
      expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}\b|oklch\(|rgba?\(/i);
      unmount();
    }
  });

  it("keeps text at least 11px", () => {
    render(<GradeChip strength="limited" />);
    expect(screen.getByText("Limited")).toHaveClass("text-[11px]");
  });

  it("accepts a longer label", () => {
    render(<GradeChip strength="strong" label="Strong evidence" size="md" />);
    expect(screen.getByText("Strong evidence")).toHaveClass("text-xs");
  });
});

describe("StrengthBadge", () => {
  it("renders a grade chip with the long label", () => {
    render(<StrengthBadge strength="heuristic" />);
    const chip = screen.getByText("Coaching heuristic");
    expect(chip).toHaveAttribute("data-slot", "grade-chip");
    expect(chip).toHaveClass("border-dashed");
  });
});
